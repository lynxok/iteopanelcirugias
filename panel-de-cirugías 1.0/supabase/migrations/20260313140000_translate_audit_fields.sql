-- Migración para aplicar traducción de campos en auditoría
-- Esta migración redefine la función log_audit_event con el mapeo al español.

CREATE OR REPLACE FUNCTION quirofano.log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID;
    _user_name TEXT := 'Sistema/Desconocido';
    _user_role TEXT := 'System';
    _user_avatar TEXT := '?';
    action_type TEXT;
    resource_name TEXT;
    resource_id TEXT;
    description TEXT := '';
    changes JSONB := '{}'::JSONB;
    old_data JSONB;
    new_data JSONB;
    key TEXT;
    val_old JSONB;
    val_new JSONB;
BEGIN
    current_user_id := auth.uid();
    IF current_user_id IS NOT NULL THEN
        SELECT name, role, avatar_url 
        INTO _user_name, _user_role, _user_avatar
        FROM quirofano.users 
        WHERE id = current_user_id;
        IF NOT FOUND THEN
             _user_name := 'Usuario Desconocido (' || current_user_id || ')';
        END IF;
    END IF;

    IF (TG_OP = 'INSERT') THEN
        action_type := 'CREATE';
        resource_id := NEW.id::TEXT;
        description := 'Creación de nuevo registro';
    ELSIF (TG_OP = 'UPDATE') THEN
        action_type := 'UPDATE';
        resource_id := NEW.id::TEXT;
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        
        FOR key IN SELECT jsonb_object_keys(old_data)
        LOOP
            IF key IN ('created_at', 'updated_at', 'meta', 'search_index', 'last_modified_by') THEN
                CONTINUE;
            END IF;
            val_old := old_data->key;
            val_new := new_data->key;
            IF val_old IS DISTINCT FROM val_new THEN
                changes := jsonb_set(changes, ARRAY[key], jsonb_build_object('old', val_old, 'new', val_new));
                DECLARE
                    display_name TEXT;
                BEGIN
                    display_name := CASE key
                        WHEN 'surgery_date' THEN 'Fecha Cirugía'
                        WHEN 'start_time' THEN 'Hora Inicio'
                        WHEN 'status' THEN 'Estado'
                        WHEN 'priority' THEN 'Prioridad'
                        WHEN 'operating_room_id' THEN 'Quirófano'
                        WHEN 'ortho_validated' THEN 'Materiales OK'
                        WHEN 'admission_validated' THEN 'Admisión OK'
                        WHEN 'or_validated' THEN 'Quirófano OK'
                        WHEN 'doctor_priority_validated' THEN 'Aval Urgencia'
                        WHEN 'procedure_name' THEN 'Procedimiento'
                        WHEN 'surgery_side' THEN 'Lado'
                        WHEN 'diagnosis' THEN 'Diagnóstico'
                        WHEN 'patient_available_from' THEN 'Disponible'
                        WHEN 'admin_confirmation' THEN 'Confirmación Admin'
                        WHEN 'patient_unable_to_attend' THEN 'Inasistencia'
                        WHEN 'document_number' THEN 'DNI'
                        WHEN 'full_name' THEN 'Nombre Completo'
                        WHEN 'birth_date' THEN 'Fecha Nacimiento'
                        WHEN 'phone' THEN 'Teléfono'
                        WHEN 'address' THEN 'Dirección'
                        WHEN 'locality' THEN 'Localidad'
                        WHEN 'province' THEN 'Provincia'
                        WHEN 'allergies' THEN 'Alergias'
                        WHEN 'dose' THEN 'Dosis'
                        WHEN 'unit' THEN 'Unidad'
                        WHEN 'administered_at' THEN 'Admin. el'
                        WHEN 'next_dose_at' THEN 'Siguiente Dosis'
                        WHEN 'ends_at' THEN 'Finaliza el'
                        WHEN 'is_active' THEN 'Activo'
                        WHEN 'room_id' THEN 'Habitación'
                        WHEN 'bed_code' THEN 'Cama'
                        ELSE key
                    END;
                    IF length(description) < 200 THEN
                        IF description = '' THEN
                            description := 'Actualización: ' || display_name;
                        ELSE
                            description := description || ', ' || display_name;
                        END IF;
                    END IF;
                END;
            END IF;
        END LOOP;
        IF changes = '{}'::JSONB THEN RETURN NULL; END IF;
    ELSIF (TG_OP = 'DELETE') THEN
        action_type := 'DELETE';
        resource_id := OLD.id::TEXT;
        description := 'Eliminación de registro';
    END IF;

    resource_name := TG_TABLE_NAME;
    INSERT INTO quirofano.audit_logs (
        user_name, user_role, user_avatar, action, resource, resource_id, description, meta, created_at
    ) VALUES (
        _user_name, _user_role, _user_avatar, action_type, resource_name, resource_id, description, changes, NOW()
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
