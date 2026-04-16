-- Función para registrar eventos de auditoría (DEBUG: SIN EXCEPTION BLOCK)
CREATE OR REPLACE FUNCTION quirofano.log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID;
    user_info RECORD;
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
    -- Obtener el ID del usuario actual (si existe)
    current_user_id := auth.uid();

    -- Buscar información del usuario
    IF current_user_id IS NOT NULL THEN
        SELECT * INTO user_info FROM quirofano.users WHERE id = current_user_id;
    END IF;

    -- Determinar tipo de acción y recurso
    IF (TG_OP = 'INSERT') THEN
         -- ... (Insert logic logic same as before)
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
            IF key IN ('created_at', 'updated_at', 'meta', 'search_index') THEN
                CONTINUE;
            END IF;
            
            val_old := old_data->key;
            val_new := new_data->key;
            
            IF val_old IS DISTINCT FROM val_new THEN
                changes := jsonb_set(changes, ARRAY[key], jsonb_build_object('old', val_old, 'new', val_new));
                
                IF length(description) < 200 THEN
                    IF description = '' THEN
                        description := 'Actualización: ' || key;
                    ELSE
                        description := description || ', ' || key;
                    END IF;
                END IF;
            END IF;
        END LOOP;
        
        IF changes = '{}'::JSONB THEN
            RETURN NULL;
        END IF;

    ELSIF (TG_OP = 'DELETE') THEN
        action_type := 'DELETE';
        resource_id := OLD.id::TEXT;
        description := 'Eliminación de registro';
    END IF;

    resource_name := TG_TABLE_NAME;

    INSERT INTO quirofano.audit_logs (
        user_name,
        user_role,
        user_avatar,
        action,
        resource,
        resource_id,
        description,
        meta,
        created_at
    ) VALUES (
        COALESCE(user_info.name, 'Sistema/Desconocido'),
        COALESCE(user_info.role, 'System'),
        COALESCE(user_info.avatar_url, '?'),
        action_type,
        resource_name,
        resource_id,
        description,
        changes, 
        NOW()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
