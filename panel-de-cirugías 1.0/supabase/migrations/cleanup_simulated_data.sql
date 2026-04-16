-- Script de Limpieza de Datos Simulados
-- ITEO - 13/03/2026

DO $$
DECLARE
    v_patient_id UUID;
BEGIN
    -- 1. Buscar y eliminar registros vinculados a 'JUAN PEREZ SIMULADO'
    FOR v_patient_id IN SELECT id FROM quirofano.patients WHERE document_number = '99.888.777' OR full_name = 'JUAN PEREZ SIMULADO'
    LOOP
        -- Eliminar ítems de ficha técnica
        DELETE FROM quirofano.surgery_form_items WHERE form_id IN (SELECT id FROM quirofano.surgery_forms WHERE surgery_id IN (SELECT id FROM quirofano.surgeries WHERE patient_id = v_patient_id));
        -- Eliminar fichas técnicas
        DELETE FROM quirofano.surgery_forms WHERE surgery_id IN (SELECT id FROM quirofano.surgeries WHERE patient_id = v_patient_id);
        -- Eliminar logs de medicación (cascada manual si no está en DB)
        DELETE FROM quirofano.hospital_medication_logs WHERE admission_id IN (SELECT id FROM quirofano.hospital_admissions WHERE patient_id = v_patient_id);
        
        -- Eliminar admisiones
        DELETE FROM quirofano.hospital_admissions WHERE patient_id = v_patient_id;
        
        -- Eliminar fichas técnicas
        DELETE FROM quirofano.surgery_forms WHERE surgery_id IN (SELECT id FROM quirofano.surgeries WHERE patient_id = v_patient_id);
        
        -- Eliminar cirugías
        DELETE FROM quirofano.surgeries WHERE patient_id = v_patient_id;
        
        -- Eliminar paciente
        DELETE FROM quirofano.patients WHERE id = v_patient_id;
    END LOOP;

    -- 2. Buscar y eliminar registros vinculados a 'MARIA SOSA SIMULADA'
    FOR v_patient_id IN SELECT id FROM quirofano.patients WHERE document_number = '99.111.222' OR full_name = 'MARIA SOSA SIMULADA'
    LOOP
        DELETE FROM quirofano.hospital_medication_logs WHERE admission_id IN (SELECT id FROM quirofano.hospital_admissions WHERE patient_id = v_patient_id);
        DELETE FROM quirofano.hospital_admissions WHERE patient_id = v_patient_id;
        DELETE FROM quirofano.patients WHERE id = v_patient_id;
    END LOOP;

    RAISE NOTICE 'Limpieza de datos simulados completada.';
END $$;
