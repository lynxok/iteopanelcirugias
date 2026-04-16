-- 1. Add BCC Toggle to Admin Settings
ALTER TABLE quirofano.admin_settings 
ADD COLUMN IF NOT EXISTS bcc_enabled BOOLEAN DEFAULT false;

-- 2. Add Notification Preferences to Users (JSONB allows flexibility for future alerts)
ALTER TABLE quirofano.users 
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"delays": true, "daily_summary": true, "status_changes": true}';

-- 3. Function: Handle BCC Logic (Trigger)
CREATE OR REPLACE FUNCTION quirofano.handle_telegram_bcc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bcc_enabled BOOLEAN;
    v_superadmin_id UUID;
BEGIN
    -- Check if BCC is enabled globally
    SELECT bcc_enabled INTO v_bcc_enabled FROM quirofano.admin_settings LIMIT 1;
    
    -- If disabled, exit
    IF v_bcc_enabled IS NOT TRUE THEN
        RETURN NEW;
    END IF;

    -- Find SuperAdmin ID (Ignacio Valente) - Hardcoded for reliability as requested, or fetch via role
    -- Ideally fetch by role, but for this specific request we know the target is the "SuperAdmin"
    -- Let's fetch the specific user 'Ignacio Valente' via ID or the first SuperAdmin with Telegram
    SELECT id INTO v_superadmin_id 
    FROM quirofano.users 
    WHERE role = 'superadmin' 
    AND telegram_chat_id IS NOT NULL 
    LIMIT 1;

    -- If no SuperAdmin found or the message is ALREADY for the SuperAdmin, exit
    IF v_superadmin_id IS NULL OR NEW.user_id = v_superadmin_id THEN
        RETURN NEW;
    END IF;

    -- Insert Copy
    INSERT INTO quirofano.telegram_notifications (user_id, message, status)
    VALUES (v_superadmin_id, format('🔒 [BCC] Copia de alera para %s: %s', NEW.user_id, NEW.message), 'pending');

    RETURN NEW;
END;
$$;

-- 4. Trigger: Create BCC on Insert
DROP TRIGGER IF EXISTS tr_telegram_bcc ON quirofano.telegram_notifications;
CREATE TRIGGER tr_telegram_bcc
AFTER INSERT ON quirofano.telegram_notifications
FOR EACH ROW
EXECUTE FUNCTION quirofano.handle_telegram_bcc();


-- 5. Update Alert Functions to Respect Preferences --

-- A. Update Proactive Alerts (Daily Summary)
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
    -- Check Prosthesis (< 7 days)
    FOR v_surgery IN 
        SELECT s.id, s.surgery_date, p.full_name, s.procedure_name, d.id as doctor_id
        FROM quirofano.surgeries s
        JOIN quirofano.patients p ON s.patient_id = p.id
        JOIN quirofano.doctors d ON s.doctor_id = d.id
        WHERE s.status = 'scheduled'
        AND s.ortho_validated = false
        AND s.surgery_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '7 days')
        AND s.requires_prosthesis = true 
    LOOP
        v_alert_msg := format('⚠️ ALERTA: Cirugía de %s (%s) sin validación de Ortopedia.', v_surgery.full_name, v_surgery.procedure_name);
        
        -- System Alert
        INSERT INTO quirofano.system_alerts (type, message, surgery_id, created_at)
        VALUES ('prosthesis', v_alert_msg, v_surgery.id, NOW()) ON CONFLICT DO NOTHING;

        -- Notify Users (Check Preferences!)
        FOR v_user IN SELECT id FROM quirofano.users 
                      WHERE doctor_id = v_surgery.doctor_id 
                      AND telegram_enabled = true 
                      AND telegram_chat_id IS NOT NULL
                      AND (notification_preferences->>'daily_summary')::boolean IS NOT FALSE -- Default True
        LOOP
            INSERT INTO quirofano.telegram_notifications (user_id, message) VALUES (v_user.id, v_alert_msg);
        END LOOP;
    END LOOP;

    -- Check Authorizations (< 3 days)
    FOR v_surgery IN 
        SELECT s.id, s.surgery_date, p.full_name, s.procedure_name, d.id as doctor_id
        FROM quirofano.surgeries s
        JOIN quirofano.patients p ON s.patient_id = p.id
        JOIN quirofano.doctors d ON s.doctor_id = d.id
        WHERE s.status = 'scheduled'
        AND s.admission_validated = false
        AND s.surgery_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '3 days')
    LOOP
        v_alert_msg := format('⚠️ URGENTE: Cirugía de %s sin autorización.', v_surgery.full_name);
         
        INSERT INTO quirofano.system_alerts (type, message, surgery_id, created_at)
        VALUES ('authorization', v_alert_msg, v_surgery.id, NOW()) ON CONFLICT DO NOTHING;

        FOR v_user IN SELECT id FROM quirofano.users 
                      WHERE doctor_id = v_surgery.doctor_id 
                      AND telegram_enabled = true 
                      AND telegram_chat_id IS NOT NULL
                      AND (notification_preferences->>'daily_summary')::boolean IS NOT FALSE
        LOOP
            INSERT INTO quirofano.telegram_notifications (user_id, message) VALUES (v_user.id, v_alert_msg);
        END LOOP;
    END LOOP;
END;
$$;

-- B. Update Surgery Delay (Delays)
CREATE OR REPLACE FUNCTION quirofano.register_surgery_delay(
    p_surgery_id UUID,
    p_delay_minutes INTEGER,
    p_cleaning_minutes INTEGER,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_surgery RECORD;
    v_affected_surgeries RECORD;
    v_new_start_time TIME;
    v_new_end_time TIME;
    v_doctor_user_id UUID;
    v_msg TEXT;
BEGIN
    -- 1. Get Surgery Info
    SELECT * INTO v_surgery FROM quirofano.surgeries WHERE id = p_surgery_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Surgery not found'); END IF;

    -- 2. Update Current Surgery (End Time = Old End + Delay + Cleaning)
    -- Logic: We extend the *duration* effectively.
    -- New End Time = Old End + Delay + Cleaning
    v_new_end_time := v_surgery.end_time + (p_delay_minutes || ' minutes')::ACTION + (p_cleaning_minutes || ' minutes')::INTERVAL;
    
    UPDATE quirofano.surgeries 
    SET end_time = v_new_end_time,
        notes = coalesce(notes, '') || format(' [Demora: %s min + %s min limpieza: %s]', p_delay_minutes, p_cleaning_minutes, p_reason)
    WHERE id = p_surgery_id;

    -- 3. Shift Subsequent Surgeries in same Operating Room
    FOR v_affected_surgeries IN 
        SELECT s.id, s.start_time, s.end_time, d.full_name as doctor_name, d.id as doctor_id, p.full_name as patient_name
        FROM quirofano.surgeries s
        JOIN quirofano.doctors d ON s.doctor_id = d.id
        JOIN quirofano.patients p ON s.patient_id = p.id
        WHERE s.operating_room_id = v_surgery.operating_room_id
        AND s.surgery_date = v_surgery.surgery_date
        AND s.start_time >= v_surgery.end_time -- Starts after the original end time of the delayed one
        AND s.id <> v_surgery.id
        ORDER BY s.start_time ASC
    LOOP
        -- Calculate Shift
        -- Shift = Delay + Cleaning
        v_new_start_time := v_affected_surgeries.start_time + (p_delay_minutes || ' minutes')::INTERVAL + (p_cleaning_minutes || ' minutes')::INTERVAL;
        v_new_end_time := v_affected_surgeries.end_time + (p_delay_minutes || ' minutes')::INTERVAL + (p_cleaning_minutes || ' minutes')::INTERVAL;

        -- Update
        UPDATE quirofano.surgeries
        SET start_time = v_new_start_time, end_time = v_new_end_time
        WHERE id = v_affected_surgeries.id;

        -- 4. Notify Doctor (Check Preferences!)
        -- Check if doctor is different from the one causing delay (optional, but good practice)
        IF v_affected_surgeries.doctor_id <> v_surgery.doctor_id THEN
             v_msg := format('⚠️ ATENCIÓN: Su cirugía de %s se ha demorado %s min. Nuevo horario estimado: %s.', 
                             v_affected_surgeries.patient_name, (p_delay_minutes + p_cleaning_minutes), to_char(v_new_start_time, 'HH24:MI'));

             FOR v_doctor_user_id IN 
                SELECT id FROM quirofano.users 
                WHERE doctor_id = v_affected_surgeries.doctor_id 
                AND telegram_enabled = true 
                AND telegram_chat_id IS NOT NULL
                AND (notification_preferences->>'delays')::boolean IS NOT FALSE -- Default True
             LOOP
                INSERT INTO quirofano.telegram_notifications (user_id, message)
                VALUES (v_doctor_user_id, v_msg);
             END LOOP;
        END IF;

    END LOOP;

    RETURN jsonb_build_object('success', true);
END;
$$;
