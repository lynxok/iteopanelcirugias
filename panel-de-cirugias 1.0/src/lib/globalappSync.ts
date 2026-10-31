import { supabase } from './supabase';

export interface GlobalappSyncPayload {
    surgeryId: string;
    action: 'start' | 'finish' | 'sync';
    patientDni: string;
    patientName: string;
    surgeryDate: string; // YYYY-MM-DD
    startTime: string;   // HH:mm
    endTime: string;     // HH:mm
    orName: string;
    specialty: string;
    isAmbulatory: boolean;
    anesthesiaType: string;
    doctorName: string;
    doctorLicense?: string;
    anesthetistName?: string;
    anesthetistLicense?: string;
    ayudante1Name?: string;
    ayudante1License?: string;
    ayudante2Name?: string;
    ayudante2License?: string;
    anatomiaPatologica?: string;
    showBrowser?: boolean;
}

function addMinutesToHHmm(timeStr: string, minutesToAdd: number): string {
    if (!timeStr) return '09:00';
    const parts = timeStr.substring(0, 5).split(':').map(Number);
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return '09:00';
    const totalMinutes = (parts[0] * 60 + parts[1] + (minutesToAdd || 60)) % (24 * 60);
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

export async function buildGlobalappPayload(
    surgeryId: string,
    action: 'start' | 'finish' | 'sync',
    showBrowser: boolean = false
): Promise<GlobalappSyncPayload | null> {
    try {
        // 1. Fetch complete surgery with patient, doctor, anesthesiologist, operating_room
        const { data: sx, error: sxError } = await supabase
            .from('surgeries')
            .select(`
                *,
                patient:patients(*),
                doctor:doctors!doctor_id(*),
                anesthesiologist:doctors!anesthesiologist_id(*),
                operating_room:operating_rooms!operating_room_id(*)
            `)
            .eq('id', surgeryId)
            .maybeSingle();

        if (sxError || !sx) {
            console.error('[GlobalappSync] Error obteniendo cirugía:', sxError);
            return null;
        }

        // 2. Fetch surgery_forms if exists
        const { data: form } = await supabase
            .from('surgery_forms')
            .select('*')
            .eq('surgery_id', surgeryId)
            .maybeSingle();

        // 3. Fetch active users/doctors to resolve license numbers for ayudante_1 / ayudante_2 if needed
        const { data: usersList } = await supabase
            .from('users')
            .select('name, license_number, doctor_id, doctors(name, full_name, license_number, specialty)')
            .eq('active', true);

        const findLicenseByName = (name?: string | null): string => {
            if (!name || !usersList) return '';
            const norm = name.trim().toLowerCase();
            const match = usersList.find((u: any) =>
                (u.name && u.name.trim().toLowerCase() === norm) ||
                (u.doctors?.name && u.doctors.name.trim().toLowerCase() === norm) ||
                (u.doctors?.full_name && u.doctors.full_name.trim().toLowerCase() === norm)
            );
            return match?.license_number || (match?.doctors as any)?.license_number || '';
        };

        const patientDni = (sx.patient?.document_number || sx.patient_dni || '').toString().replace(/\D/g, '');
        const patientName = sx.patient?.full_name || sx.patient?.name || sx.patient_name || '';
        const surgeryDate = (sx.surgery_date || new Date().toISOString().split('T')[0]).substring(0, 10);

        const rawStartTime = (form?.cirugia_inicio || sx.actual_start_time || sx.start_time || sx.planned_start_time || '08:00').substring(0, 5);
        const estimatedDuration = Number(sx.estimated_duration || 60);
        const estimatedEndTime = addMinutesToHHmm(rawStartTime, estimatedDuration);
        const rawEndTime = (form?.cirugia_fin || sx.actual_end_time || estimatedEndTime).substring(0, 5);

        const isAmbulatory = Boolean(
            sx.is_ambulatory === true ||
            sx.is_guardia === true ||
            sx.operating_room?.is_ambulatory === true
        );

        const doctorName = sx.doctor?.full_name || sx.doctor?.name || sx.doctor_name || '';
        const doctorLicense = sx.doctor?.license_number || findLicenseByName(doctorName);
        const specialty = sx.doctor?.specialty || 'TRAUMATOLOGIA';

        let anesthetistName = sx.anesthesiologist?.full_name || sx.anesthesiologist?.name || sx.anesthesiologist_name || '';
        let anesthetistLicense = sx.anesthesiologist?.license_number || '';
        if (!anesthetistName && sx.anesthesiologist_id && usersList) {
            const uAnes = usersList.find((u: any) => u.doctor_id === sx.anesthesiologist_id);
            if (uAnes) {
                anesthetistName = uAnes.name;
                anesthetistLicense = uAnes.license_number || (uAnes.doctors as any)?.license_number || '';
            }
        }

        const ayudante1Name = form?.ayudante_1 || '';
        const ayudante1License = findLicenseByName(ayudante1Name);
        const ayudante2Name = form?.ayudante_2 || '';
        const ayudante2License = findLicenseByName(ayudante2Name);

        return {
            surgeryId,
            action,
            patientDni,
            patientName,
            surgeryDate,
            startTime: rawStartTime,
            endTime: rawEndTime,
            orName: sx.operating_room?.name || 'Quirófano 1',
            specialty,
            isAmbulatory,
            anesthesiaType: sx.anesthesia_type || 'General',
            doctorName,
            doctorLicense,
            anesthetistName,
            anesthetistLicense,
            ayudante1Name,
            ayudante1License,
            ayudante2Name,
            ayudante2License,
            anatomiaPatologica: form?.anatomia_patologica || '',
            showBrowser
        };
    } catch (err) {
        console.error('[GlobalappSync] Error armando payload:', err);
        return null;
    }
}

export async function triggerGlobalappSync(
    surgeryId: string,
    action: 'start' | 'finish' | 'sync',
    showBrowser: boolean = false
): Promise<{ success: boolean; delegated?: boolean; mode?: string; parteId?: number; error?: string }> {
    const payload = await buildGlobalappPayload(surgeryId, action, showBrowser);
    if (!payload) {
        return { success: false, error: 'No se pudo construir el paquete de datos de la cirugía.' };
    }

    const electronAPI = (window as any).electronAPI;

    // 1. Primary Path (Web, Tablet & Desktop): Direct Cloud Sync via Supabase Edge Function `globalapp-sync`
    // Does not require any PC or Electron open.
    try {
        console.log('[GlobalappSync] Sincronizando directo en la nube vía Edge Function globalapp-sync...', payload);
        const { data: cloudRes, error: fnError } = await supabase.functions.invoke('globalapp-sync', {
            body: payload
        });

        if (!fnError && cloudRes && cloudRes.success) {
            await supabase.from('audit_logs').insert({
                user_name: 'Sistema Globalapp (Cloud)',
                user_role: 'Quirofano',
                action: 'SYNC_GLOBALAPP',
                resource: 'Cirugía',
                resource_id: surgeryId,
                description: `Sincronización Globalapp (${action.toUpperCase()} - ${cloudRes.mode || 'ok'}) completada para ${payload.patientName} (DNI ${payload.patientDni}).`,
                diff: { payload, result: cloudRes }
            });
            return cloudRes;
        }

        if (cloudRes && !cloudRes.success) {
            console.warn('[GlobalappSync] Respuesta con alerta de globalapp-sync:', cloudRes.error);
            await supabase.from('audit_logs').insert({
                user_name: 'Sistema Globalapp (Cloud)',
                user_role: 'Quirofano',
                action: 'SYNC_GLOBALAPP_ERROR',
                resource: 'Cirugía',
                resource_id: surgeryId,
                description: `Error en sincronización Globalapp (${action.toUpperCase()}): ${cloudRes.error}`,
                diff: { payload, result: cloudRes }
            });
            return { success: false, error: cloudRes.error };
        }

        if (fnError) {
            console.warn('[GlobalappSync] Error invocando Edge Function, intentando fallback...', fnError);
        }
    } catch (cloudErr: any) {
        console.warn('[GlobalappSync] Excepción en Edge Function, intentando fallback...', cloudErr);
    }

    // 2. Fallback: If running inside Electron Desktop App, execute Playwright scraper locally
    if (electronAPI && typeof electronAPI.runGlobalappScraper === 'function') {
        try {
            console.log('[GlobalappSync] Ejecutando scraper localmente en Electron (fallback)...', payload);
            const res = await electronAPI.runGlobalappScraper(payload);
            await supabase.from('audit_logs').insert({
                user_name: 'Sistema Globalapp (Electron)',
                user_role: 'Quirofano',
                action: 'SYNC_GLOBALAPP',
                resource: 'Cirugía',
                resource_id: surgeryId,
                description: res?.success
                    ? `Sincronización Globalapp (${action.toUpperCase()} - ${res.mode || 'ok'}) completada para ${payload.patientName} (DNI ${payload.patientDni}).`
                    : `Error en sincronización Globalapp (${action.toUpperCase()}): ${res?.error || 'Desconocido'}`,
                diff: { payload, result: res }
            });
            return res;
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    return { success: false, error: 'No se pudo conectar con el servicio Cloud de Globalapp.' };
}
