-- 1. Create a dedicated queue for Telegram notifications
CREATE TABLE IF NOT EXISTS quirofano.telegram_notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id), -- Recipient (must have telegram_chat_id)
    message TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, sent, error
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT
);

-- 2. Function: Check Proactive Alerts (Daily Morning Check)
CREATE OR REPLACE FUNCTION quirofano.check_proactive_alerts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_surgery RECORD;
    v_alert_msg TEXT;
    v_user RECORD;
BEGIN
    -- A. Check Prosthesis (< 7 days, not validated)
    FOR v_surgery IN 
        SELECT s.id, s.surgery_date, p.full_name, s.procedure_name, d.id as doctor_id
        FROM quirofano.surgeries s
        JOIN quirofano.patients p ON s.patient_id = p.id
        JOIN quirofano.doctors d ON s.doctor_id = d.id
        WHERE s.status = 'scheduled'
        AND s.ortho_validated = false
        AND s.surgery_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')
        AND s.requires_prosthesis = true -- Assuming this flag exists or strictly via doctor specialty
    LOOP
        v_alert_msg := format('⚠️ ALERTA: La cirugía de %s (%s) es en menos de 7 días y NO tiene validación de Orttopedia.', v_surgery.full_name, v_surgery.procedure_name);
        
        -- Insert into system_alerts (Frontend History)
        INSERT INTO quirofano.system_alerts (type, message, surgery_id, created_at)
        VALUES ('prosthesis', v_alert_msg, v_surgery.id, NOW())
        ON CONFLICT DO NOTHING;

        -- Find Doctor User to Notify? Or SuperAdmins?
        -- For now, let's notify the Doctor if they are a user with Telegram
        FOR v_user IN SELECT id FROM quirofano.users WHERE doctor_id = v_surgery.doctor_id AND telegram_enabled = true AND telegram_chat_id IS NOT NULL
        LOOP
            INSERT INTO quirofano.telegram_notifications (user_id, message)
            VALUES (v_user.id, v_alert_msg);
        END LOOP;
    END LOOP;

    -- B. Check Authorizations (< 3 days, not validated)
    FOR v_surgery IN 
        SELECT s.id, s.surgery_date, p.full_name, s.procedure_name, d.id as doctor_id
        FROM quirofano.surgeries s
        JOIN quirofano.patients p ON s.patient_id = p.id
        JOIN quirofano.doctors d ON s.doctor_id = d.id
        WHERE s.status = 'scheduled'
        AND s.admission_validated = false
        AND s.surgery_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '3 days')
    LOOP
        v_alert_msg := format('⚠️ URGENTE: Cirugía de %s sin autorización a menos de 72hs.', v_surgery.full_name);
         
        INSERT INTO quirofano.system_alerts (type, message, surgery_id, created_at)
        VALUES ('authorization', v_alert_msg, v_surgery.id, NOW())
        ON CONFLICT DO NOTHING;

        FOR v_user IN SELECT id FROM quirofano.users WHERE doctor_id = v_surgery.doctor_id AND telegram_enabled = true AND telegram_chat_id IS NOT NULL
        LOOP
            INSERT INTO quirofano.telegram_notifications (user_id, message)
            VALUES (v_user.id, v_alert_msg);
        END LOOP;
    END LOOP;
END;
$$;

-- 3. Function: Register Delay & Shift Schedule (The Brain)
CREATE OR REPLACE FUNCTION quirofano.register_surgery_delay(
    p_surgery_id UUID,
    p_delay_minutes INT,
    p_cleaning_minutes INT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_surgery RECORD;
    v_target_surgery RECORD;
    v_total_shift INT;
    v_new_time TIME;
    v_user RECORD;
    v_msg TEXT;
BEGIN
    -- Get current surgery details
    SELECT * INTO v_current_surgery FROM quirofano.surgeries WHERE id = p_surgery_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Surgery not found'; END IF;

    v_total_shift := p_delay_minutes + p_cleaning_minutes;

    -- Update current surgery status to 'delayed' if not already
    UPDATE quirofano.surgeries 
    SET status = 'delayed' 
    WHERE id = p_surgery_id AND status != 'delayed';

    -- Shift FUTURE surgeries in the same room for TODAY
    FOR v_target_surgery IN 
        SELECT * FROM quirofano.surgeries 
        WHERE operating_room_id = v_current_surgery.operating_room_id
        AND surgery_date = v_current_surgery.surgery_date
        AND start_time > v_current_surgery.start_time
        ORDER BY start_time ASC
    LOOP
        -- Calculate new time
        v_new_time := v_target_surgery.start_time + (v_total_shift || ' minutes')::INTERVAL;

        -- Update the surgery
        UPDATE quirofano.surgeries 
        SET start_time = v_new_time 
        WHERE id = v_target_surgery.id;

        -- Check if we need to notify the doctor (Logic: If doctor is DIFFERENT from current surgery)
        IF v_target_surgery.doctor_id IS DISTINCT FROM v_current_surgery.doctor_id THEN
            
            v_msg := format(
                '⚠️ Aviso Quirofano: La cirugía anterior se demoró %s min + %s min de limpieza (Total: %s min). Su nuevo horario estimado de inicio: %s.',
                p_delay_minutes,
                p_cleaning_minutes,
                v_total_shift,
                to_char(v_new_time, 'HH24:MI')
            );

            -- Find the User linked to this Doctor
            FOR v_user IN SELECT id FROM quirofano.users WHERE doctor_id = v_target_surgery.doctor_id AND telegram_enabled = true AND telegram_chat_id IS NOT NULL
            LOOP
                INSERT INTO quirofano.telegram_notifications (user_id, message)
                VALUES (v_user.id, v_msg);
            END LOOP;

            -- Find the User linked to the Anesthesiologist (if exists and different)
            IF v_target_surgery.anesthesiologist_id IS DISTINCT FROM v_current_surgery.anesthesiologist_id THEN
                 FOR v_user IN SELECT id FROM quirofano.users WHERE doctor_id = v_target_surgery.anesthesiologist_id AND telegram_enabled = true AND telegram_chat_id IS NOT NULL
                LOOP
                    INSERT INTO quirofano.telegram_notifications (user_id, message)
                    VALUES (v_user.id, v_msg);
                END LOOP;
            END IF;

        END IF;
    END LOOP;
END;
$$;

-- 4. Try to Enable pg_cron and Schedule Daily Job
-- Note: This might fail if the user doesn't have superuser permissions or if 'pg_cron' is not supported on their plan.
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    
    -- Schedule for 07:00 AM Argentina (UTC-3) -> 10:00 AM UTC
    -- '0 10 * * *' = At 10:00 UTC
    PERFORM cron.schedule('daily-morning-alerts', '0 10 * * *', 'SELECT quirofano.check_proactive_alerts()');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron could not be enabled or scheduled automatically. Please enable it manually in Dashboard > Database > Extensions.';
END
$$;
