-- Script de Simulación de Datos para Facturación (Enriquecido y Corregido)
-- ITEO - 13/03/2026

DO $$
DECLARE
    v_patient_id UUID;
    v_doctor_id UUID;
    v_anest_id UUID;
    v_bed_id UUID;
    v_admission_id UUID;
    v_surgery_id UUID;
    v_surgery_form_id UUID;
BEGIN
    -- 1. LIMPIEZA EN CASCADA (Evita errores de FK)
    -- Buscamos al paciente de prueba si existe
    SELECT id INTO v_patient_id FROM quirofano.patients WHERE document_number = '99.888.777';

    IF v_patient_id IS NOT NULL THEN
        -- Borrar logs de medicación
        DELETE FROM quirofano.hospital_medication_logs WHERE admission_id IN (SELECT id FROM quirofano.hospital_admissions WHERE patient_id = v_patient_id);
        
        -- Borrar items de cirugía y formularios
        DELETE FROM quirofano.surgery_form_items WHERE form_id IN (
            SELECT id FROM quirofano.surgery_forms WHERE surgery_id IN (
                SELECT id FROM quirofano.surgeries WHERE patient_id = v_patient_id
            )
        );
        DELETE FROM quirofano.surgery_forms WHERE surgery_id IN (SELECT id FROM quirofano.surgeries WHERE patient_id = v_patient_id);
        
        -- Borrar cirugías e internaciones
        DELETE FROM quirofano.surgeries WHERE patient_id = v_patient_id;
        DELETE FROM quirofano.hospital_admissions WHERE patient_id = v_patient_id;
        
        -- Finalmente borrar al paciente
        DELETE FROM quirofano.patients WHERE id = v_patient_id;
    END IF;

    -- 2. Obtener médicos de prueba
    SELECT id INTO v_doctor_id FROM quirofano.doctors LIMIT 1;
    SELECT id INTO v_anest_id FROM quirofano.doctors OFFSET 1 LIMIT 1;
    
    -- 3. Obtener una cama disponible
    SELECT id INTO v_bed_id FROM quirofano.hospital_beds WHERE status = 'available' LIMIT 1;

    -- 4. Crear Paciente Simulado con Cobertura (Prepaga)
    INSERT INTO quirofano.patients (full_name, document_number, insurance_name, insurance_number)
    VALUES ('JUAN PEREZ SIMULADO', '99.888.777', 'OSDE 410', '1-555666-02')
    RETURNING id INTO v_patient_id;

    -- Crear Internación Finalizada (2 días)
    INSERT INTO quirofano.hospital_admissions (
        patient_id, bed_id, check_in, check_out, billing_status
    ) VALUES (
        v_patient_id, v_bed_id, 
        NOW() - INTERVAL '30 hours', 
        NOW() - INTERVAL '4 hours', 
        'pendiente'
    ) RETURNING id INTO v_admission_id;

    -- Crear Cirugía vinculada con datos detallados
    INSERT INTO quirofano.surgeries (
        patient_id, doctor_id, anesthesiologist_id, surgery_date, start_time, procedure_name, status
    ) VALUES (
        v_patient_id, v_doctor_id, v_anest_id, 
        (NOW() - INTERVAL '28 hours')::DATE, 
        '08:00', 'ARTROPLASTIA DE CADERA (SIMULADA)', 'completed'
    ) RETURNING id INTO v_surgery_id;

    -- Crear Ficha Técnica con Equipo Completo
    INSERT INTO quirofano.surgery_forms (
        surgery_id, 
        ayudante_1, ayudante_2, instrumentadora,
        anestesia_inicio, anestesia_fin, procedimiento_efectuado
    ) VALUES (
        v_surgery_id, 
        'DR. RICARDO GOMEZ (1° AYUDANTE)', 'DRA. MARINA LOPEZ (2° AYUDANTE)', 'LIC. BEATRIZ MARTINEZ (INSTRUMENTADORA)',
        '07:45', '11:15', 'ARTROPLASTIA TOTAL DE CADERA DERECHA CON PRÓTESIS IMPORTADA Y CEMENTACIÓN.'
    ) RETURNING id INTO v_surgery_form_id;

    -- Agregar Insumos detallados
    INSERT INTO quirofano.surgery_form_items (form_id, type, name, unit, quantity)
    VALUES 
    (v_surgery_form_id, 'anesthesia', 'PROPOFOL 1% x 20ml', 'amp', 2),
    (v_surgery_form_id, 'anesthesia', 'FENTANILO 0.05mg x 5ml', 'amp', 3),
    (v_surgery_form_id, 'anesthesia', 'REMIFENTANILO 2mg', 'frasco', 1),
    (v_surgery_form_id, 'surgery', 'PROTESIS DE CADERA IMPORTADA (STEM/HEAD)', 'unidad', 1),
    (v_surgery_form_id, 'surgery', 'CEMENTO OSEO CON ANTIBIOTICO (40gr)', 'unidad', 2),
    (v_surgery_form_id, 'surgery', 'CLAVOS MECANICOS 3.5mm x 14mm', 'unidad', 4),
    (v_surgery_form_id, 'surgery', 'GASAS ESTERILES 10x10 (PAQUETE X 10)', 'unidad', 15),
    (v_surgery_form_id, 'surgery', 'SUTURA VICRYL 2-0 (AGUJA CT-1)', 'unidad', 3);

    -- 5. Agregar medicamentos en internación
    INSERT INTO quirofano.hospital_medication_logs (admission_id, medication_name, dose, unit, administered_at, administered_by)
    VALUES 
    (v_admission_id, 'DIPIRONA 1gr INY', '1', 'amp', NOW() - INTERVAL '20 hours', 'ENF. SOSA'),
    (v_admission_id, 'MORFINA 2mg SC', '2', 'mg', NOW() - INTERVAL '15 hours', 'ENF. SOSA'),
    (v_admission_id, 'CEFALOTINA 1gr EV', '1', 'frasco', NOW() - INTERVAL '10 hours', 'ENF. SOSA'),
    (v_admission_id, 'ENOXAPARINA 40mg SC', '40', 'mg', NOW() - INTERVAL '6 hours', 'ENF. LOPEZ');

END $$;
