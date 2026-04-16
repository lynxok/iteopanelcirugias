import { supabase } from './supabase';

export type AlertSeverity = 'Critical' | 'Urgent' | 'Warning' | 'Info';
export type AlertType = 'schedule_change' | 'operational_delay' | 'displacement' | 'proactive_validation' | 'urgent_validation_required';

interface CreateDoctorAlertParams {
    surgeryId: string;
    doctorId: string | null;
    title: string;
    message: string;
    severity: AlertSeverity;
    type: AlertType;
    patientName?: string;
}

/**
 * Creates or updates an operational alert for a doctor.
 * Avoids duplicate active alerts for the same surgery, role, and type.
 */
export const createOrUpdateDoctorAlert = async ({
    surgeryId,
    doctorId,
    title,
    message,
    severity,
    type,
    patientName
}: CreateDoctorAlertParams) => {
    if (!doctorId) return;

    try {
        // Check for an existing active alert of the same type for this surgery and doctor
        const { data: existing } = await supabase
            .from('system_alerts')
            .select('id, title, message')
            .eq('surgery_id', surgeryId)
            .eq('target_role', 'Medico')
            .eq('target_doctor_id', doctorId)
            .eq('type', type)
            .eq('status', 'Active')
            .maybeSingle();

        if (!existing) {
            // Create new
            await supabase.from('system_alerts').insert({
                surgery_id: surgeryId,
                target_doctor_id: doctorId,
                target_role: 'Medico',
                type: type,
                title,
                message,
                severity,
                patient_name: patientName || 'N/A',
                status: 'Active',
                date_generated: new Date().toISOString()
            });
        } else if (existing.title !== title || existing.message !== message) {
            // Update existing if content changed
            await supabase.from('system_alerts').update({
                title,
                message,
                severity,
                date_generated: new Date().toISOString()
            }).eq('id', existing.id);
        }
    } catch (error) {
        console.error('Error in createOrUpdateDoctorAlert:', error);
    }
};
