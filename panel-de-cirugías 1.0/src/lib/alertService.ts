import { supabase } from './supabase';
import { AlertSeverity, UserRole } from '../../types';

interface CreateAlertParams {
    surgeryId: string;
    targetRole: UserRole;
    doctorId?: string | null;
    vendorId?: string | null;
    title: string;
    message: string;
    severity: AlertSeverity;
    type: string;
    patientName?: string;
}

/**
 * Creates or updates an operational alert for a specific role/user.
 * Avoids duplicate active alerts for the same surgery, role, type and target.
 */
export const createOrUpdateSystemAlert = async ({
    surgeryId,
    targetRole,
    doctorId,
    vendorId,
    title,
    message,
    severity,
    type,
    patientName
}: CreateAlertParams) => {
    try {
        // 1. Check for an existing active alert
        let query = supabase
            .from('system_alerts')
            .select('id, title, message, severity')
            .eq('surgery_id', surgeryId)
            .eq('target_role', targetRole)
            .eq('type', type)
            .eq('status', 'Active');

        if (doctorId) query = query.eq('target_doctor_id', doctorId);
        if (vendorId) query = query.eq('target_vendor_id', vendorId);

        const { data: existing } = await query.maybeSingle();

        let isNew = false;
        let alertId = existing?.id;

        if (!existing) {
            // Create new
            const { data: newAlert, error: insError } = await supabase.from('system_alerts').insert({
                surgery_id: surgeryId,
                target_role: targetRole,
                target_doctor_id: doctorId || null,
                target_vendor_id: vendorId || null,
                type: type,
                title,
                message,
                severity,
                patient_name: patientName || 'N/A',
                status: 'Active',
                date_generated: new Date().toISOString()
            }).select('id').single();

            if (insError) throw insError;
            alertId = newAlert.id;
            isNew = true;
        } else if (existing.title !== title || existing.message !== message || existing.severity !== severity) {
            // Update existing if content changed
            await supabase.from('system_alerts').update({
                title,
                message,
                severity,
                date_generated: new Date().toISOString()
            }).eq('id', existing.id);
            isNew = true; // Signal change
        }

        return { isNew, id: alertId };
    } catch (error) {
        console.error('Error in createOrUpdateSystemAlert:', error);
        return { isNew: false, id: null };
    }
};

/**
 * Helper to queue a single consolidated Telegram notification for a user.
 */
export const notifySurgeryAlertsSummary = async (surgeryId: string) => {
    try {
        // 1. Fetch Surgery with related data
        const { data: surgery } = await supabase
            .from('surgeries')
            .select('*, patients(full_name, document_number)')
            .eq('id', surgeryId)
            .single();

        if (!surgery) return;

        // 2. Fetch all ACTIVE alerts for this surgery
        const { data: alerts } = await supabase
            .from('system_alerts')
            .select('*')
            .eq('surgery_id', surgeryId)
            .eq('status', 'Active');

        if (!alerts || alerts.length === 0) return;

        // 3. Fetch Global Setting
        const { data: globalSetting } = await supabase
            .from('admin_settings')
            .select('value')
            .eq('key', 'telegram_enabled')
            .single();

        if (globalSetting?.value !== 'true') return;

        // 4. Fetch eligible users
        const { data: users } = await supabase
            .from('users')
            .select('id, name, role, doctor_id, vendor_id, telegram_chat_id, telegram_enabled')
            .not('telegram_chat_id', 'is', null)
            .neq('telegram_chat_id', '')
            .eq('telegram_enabled', true);

        if (!users || users.length === 0) return;

        const patientName = (surgery.patients as any)?.full_name || surgery.patient_name || 'N/A';
        const patientDoc = (surgery.patients as any)?.document_number || 'N/A';
        const surgeryDate = surgery.surgery_date ? new Date(surgery.surgery_date + 'T12:00:00').toLocaleDateString() : 'N/A';
        const surgeryType = surgery.procedure_name || 'N/A';

        for (const user of users) {
            // Filter alerts relevant for THIS user
            const userAlerts = alerts.filter(a => {
                if (user.role === 'SuperAdmin') return true;
                if (a.target_doctor_id && a.target_doctor_id === user.doctor_id) return true;
                if (a.target_vendor_id && a.target_vendor_id === user.vendor_id) return true;
                if (a.target_role === user.role) return true;
                return false;
            });

            if (userAlerts.length === 0) continue;

            // Construct Consolidated Message
            const hasCritical = userAlerts.some(a => a.severity === 'Critical');
            const hasUrgent = userAlerts.some(a => a.severity === 'Urgent');
            const mainIcon = hasCritical ? '🔴' : (hasUrgent ? '🟠' : '🟡');

            let msg = `Hola *${user.name || 'Usuario'}*,\n\n`;
            msg += `${mainIcon} *Resumen de Alertas*\n`;
            msg += `• *Paciente:* ${patientName}\n`;
            msg += `• *DNI:* ${patientDoc}\n`;
            msg += `• *Cirugía:* ${surgeryType}\n`;
            msg += `• *Fecha:* ${surgeryDate}\n\n`;
            msg += `*Pendientes:*\n`;

            userAlerts.forEach(a => {
                const icon = a.severity === 'Critical' ? '🔴' : a.severity === 'Urgent' ? '🟠' : a.severity === 'Warning' ? '🟡' : '🔵';
                const cleanTitle = a.title.includes('ESCALACIÓN') ? a.title : a.title;
                msg += `• ${icon} *${cleanTitle}*: ${a.message}\n`;
            });

            msg += `\n_Acceda al panel para gestionar._`;

            // Insert notification
            await supabase.from('telegram_notifications').insert({
                user_id: user.id,
                message: msg,
                status: 'pending',
                surgery_id: surgeryId
            });
        }
    } catch (err) {
        console.error('Error in notifySurgeryAlertsSummary:', err);
    }
};

/**
 * Synchronizes all potential alerts for a surgery based on its current state.
 */
export const syncSurgeryAlerts = async (surgery: any, documents: any[] = []) => {
    try {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (!surgery.surgery_date) return;

        const sxDate = new Date(surgery.surgery_date + 'T12:00:00');
        const diffTime = sxDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        const isUrgent = ['urgent', 'emergency', 'urgency'].includes(surgery.priority?.toLowerCase());
        const patientName = (surgery.patients as any)?.full_name || surgery.patient_name || 'N/A';

        let hasChanges = false;

        // Helper to track changes
        const check = (res: { isNew: boolean }) => { if (res.isNew) hasChanges = true; };

        // --- 1. URGENCY & ORTHO LOGIC ---
        const needsOrthoValidation = surgery.requires_prosthesis || (surgery.materials && surgery.materials.length > 0);

        // A. Urgency Material Alert
        const urgencyType = 'urgencia_materiales';
        if (isUrgent && needsOrthoValidation && !surgery.ortho_validated) {
            check(await createOrUpdateSystemAlert({
                surgeryId: surgery.id,
                targetRole: 'Ortopedia',
                vendorId: surgery.vendor_id,
                severity: 'Critical',
                type: urgencyType,
                title: 'URGENCIA: Materiales Requeridos',
                message: 'Cirugía de URGENCIA programada. Requiere validación inmediata de materiales.',
                patientName
            }));
        } else {
            await resolveAlertByType(surgery.id, urgencyType);
        }

        // B. Standard Ortho Alert
        const orthoType = 'Gestión Prótesis';
        if (needsOrthoValidation && !surgery.ortho_validated && diffDays <= 14) {
            check(await createOrUpdateSystemAlert({
                surgeryId: surgery.id,
                targetRole: 'Ortopedia',
                vendorId: surgery.vendor_id,
                severity: diffDays < 7 ? 'Critical' : 'Warning',
                type: orthoType,
                title: diffDays < 7 ? 'URGENTE: Falta Prótesis' : 'Pendiente Prótesis',
                message: `Cirugía en ${diffDays} días. Falta validación de materiales/prótesis.`,
                patientName
            }));
        } else if (surgery.ortho_validated || !needsOrthoValidation || diffDays > 14) {
            await resolveAlertByType(surgery.id, orthoType);
        }

        // --- 2. DOCUMENTATION LOGIC ---
        const docsType = 'Estudios Pre-Qx';
        const REQUIRED_DOCS = ['order', 'auth', 'dni'];
        const sDocs = documents.map(d => typeof d === 'string' ? d : (d.category || d.type));
        const missingDocs = REQUIRED_DOCS.filter(cat => !sDocs.includes(cat));

        if (missingDocs.length > 0 && diffDays <= 7) {
            check(await createOrUpdateSystemAlert({
                surgeryId: surgery.id,
                targetRole: 'Internacion',
                severity: diffDays <= 3 ? 'Critical' : 'Urgent',
                type: docsType,
                title: 'Documentación Incompleta',
                message: `Faltan documentos críticos: ${missingDocs.join(', ')}.`,
                patientName
            }));
        } else {
            await resolveAlertByType(surgery.id, docsType);
        }

        // --- 3. AUTHORIZATION LOGIC ---
        const authType = 'proactive_validation';
        if (!surgery.auth_date && diffDays <= 3) {
            check(await createOrUpdateSystemAlert({
                surgeryId: surgery.id,
                targetRole: 'Internacion',
                severity: 'Critical',
                type: authType,
                title: 'URGENTE: Falta Autorización',
                message: `La cirugía es en ${diffDays} días y NO TIENE fecha de autorización cargada.`,
                patientName
            }));
        } else if (surgery.auth_date) {
            await resolveAlertByType(surgery.id, authType, 'URGENTE: Falta Autorización');
        }

        // --- 4. TECHNICAL LOGIC ---
        const techType = 'Validación Quirófano';
        if (!surgery.or_validated && diffDays <= 5) {
            check(await createOrUpdateSystemAlert({
                surgeryId: surgery.id,
                targetRole: 'Tecnico',
                severity: diffDays <= 2 ? 'Critical' : 'Urgent',
                type: techType,
                title: 'Pendiente Quirófano',
                message: `Cirugía programada en ${diffDays} días requiere validación técnica/insumos.`,
                patientName
            }));
        } else if (surgery.or_validated) {
            await resolveAlertByType(surgery.id, techType);
        }

        // --- 5. ESCALATION LOGIC ---
        if (diffDays <= 10 && !['suspended', 'cancelled'].includes(surgery.status?.toLowerCase())) {
            const missingOrto = surgery.requires_prosthesis && !surgery.ortho_validated;
            const missingAdm = !surgery.admission_validated;
            const missingOr = !surgery.or_validated;

            if (missingOrto || missingAdm || missingOr) {
                const reason = [];
                if (missingOrto) reason.push('Ortopedia');
                if (missingAdm) reason.push('Internación');
                if (missingOr) reason.push('Quirófano');

                const roles: UserRole[] = ['Tecnico', 'Internacion', 'Ortopedia'];
                for (const role of roles) {
                    check(await createOrUpdateSystemAlert({
                        surgeryId: surgery.id,
                        targetRole: role,
                        severity: 'Critical',
                        type: 'proactive_validation',
                        title: 'ESCALACIÓN CRÍTICA: Falta Validación',
                        message: `La cirugía programada en ${diffDays} días aún no cuenta con validación de: ${reason.join(', ')}.`,
                        patientName
                    }));
                }

                if (surgery.doctor_id) {
                    check(await createOrUpdateSystemAlert({
                        surgeryId: surgery.id,
                        targetRole: 'Medico',
                        doctorId: surgery.doctor_id,
                        severity: 'Critical',
                        type: 'proactive_validation',
                        title: 'ALERTA MÉDICO: Validación Pendiente',
                        message: `Su cirugía en ${diffDays} días tiene validaciones pendientes de: ${reason.join(', ')}.`,
                        patientName
                    }));
                }
            }
        }

        // --- 6. URGENT PHYSICIAN VALIDATION ---
        const urgentValType = 'urgent_validation_required';
        if (surgery.priority === 'urgent' && !surgery.doctor_priority_validated && surgery.doctor_id) {
            check(await createOrUpdateSystemAlert({
                surgeryId: surgery.id,
                targetRole: 'Medico',
                doctorId: surgery.doctor_id,
                severity: 'Urgent',
                type: urgentValType,
                title: 'Validación de Urgencia Requerida',
                message: `Se ha solicitado una cirugía de Urgencia para ${patientName}. Se requiere su aval para programarla.`,
                patientName
            }));
        } else {
            await resolveAlertByType(surgery.id, urgentValType);
        }

        // FINAL STEP: Notify if anything changed
        if (hasChanges) {
            await notifySurgeryAlertsSummary(surgery.id);
        }

    } catch (error) {
        console.error('Error in syncSurgeryAlerts:', error);
    }
};

/**
 * Syncs alerts for ALL active surgeries. Used for periodic cleanup or app initialization.
 */
export const syncAllAlerts = async () => {
    try {
        const { data: surgeries, error } = await supabase
            .from('surgeries')
            .select('*, patients(full_name), surgery_materials(*)')
            .neq('status', 'completed')
            .neq('status', 'cancelled')
            .not('surgery_date', 'is', null);

        if (error) throw error;

        const { data: documents } = await supabase
            .from('surgery_documents')
            .select('surgery_id, category, type');

        for (const sx of surgeries) {
            const sxDocs = (documents || []).filter(d => d.surgery_id === sx.id);
            await syncSurgeryAlerts(sx, sxDocs);
        }
    } catch (err) {
        console.error('Error syncing all alerts:', err);
    }
};

/**
 * Resolves an alert by type and optionally title.
 */
export const resolveAlertByType = async (surgeryId: string, type: string, titleContains?: string) => {
    try {
        let query = supabase
            .from('system_alerts')
            .update({
                status: 'Resolved',
                resolved_at: new Date().toISOString(),
                resolved_by: 'Sistema (Auto)'
            })
            .eq('surgery_id', surgeryId)
            .eq('type', type)
            .eq('status', 'Active');

        if (titleContains) {
            query = query.ilike('title', `%${titleContains}%`);
        }

        await query;
    } catch (error) {
        console.error('Error resolving alert by type:', error);
    }
};

// Backward compatibility
export const createOrUpdateDoctorAlert = (params: any) => createOrUpdateSystemAlert({
    ...params,
    targetRole: 'Medico',
    doctorId: params.doctorId
});
