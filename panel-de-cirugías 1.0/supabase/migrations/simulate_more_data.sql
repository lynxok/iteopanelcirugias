-- Script de Simulación de Datos Enriquecidos (v1.1.59)
-- ITEO - 14/03/2026

DO $$
DECLARE
    v_doctor_id UUID;
    v_anest_id UUID;
    v_bed_1 UUID;
    v_bed_2 UUID;
    v_bed_3 UUID;
    
    -- IDs para Caso 1 (Maria - Complejo)
    v_p1_id UUID;
    v_a1_id UUID;
    v_s1_id UUID;
    v_f1_id UUID;

    -- IDs para Caso 2 (Carlos - Rápido)
    v_p2_id UUID;
    v_a2_id UUID;
    v_s2_id UUID;
    v_f2_id UUID;

    -- IDs para Caso 3 (Ana - Clínico)
    v_p3_id UUID;
    v_a3_id UUID;
BEGIN
    -- 1. LIMPIEZA DE DATOS PREVIA (Ordenada por dependencias para evitar errores de Foreign Key)
    -- Obtenemos IDs de los pacientes de prueba si existen
    CREATE TEMP TABLE tmp_test_patients AS 
    SELECT id FROM quirofano.patients WHERE document_number IN ('11.222.333', '22.333.444', '33.444.555');

    -- Borramos en cascada manual
    -- a) Items de ficha de cirugía
    DELETE FROM quirofano.surgery_form_items WHERE form_id IN (
        SELECT id FROM quirofano.surgery_forms WHERE surgery_id IN (
            SELECT id FROM quirofano.surgeries WHERE patient_id IN (SELECT id FROM tmp_test_patients)
        )
    );

    -- b) Fichas de cirugía
    DELETE FROM quirofano.surgery_forms WHERE surgery_id IN (
        SELECT id FROM quirofano.surgeries WHERE patient_id IN (SELECT id FROM tmp_test_patients)
    );

    -- c) Medicación de internación
    DELETE FROM quirofano.hospital_medication_logs WHERE admission_id IN (
        SELECT id FROM quirofano.hospital_admissions WHERE patient_id IN (SELECT id FROM tmp_test_patients)
    );

    -- d) Cirugías
    DELETE FROM quirofano.surgeries WHERE patient_id IN (SELECT id FROM tmp_test_patients);

    -- e) Internaciones
    DELETE FROM quirofano.hospital_admissions WHERE patient_id IN (SELECT id FROM tmp_test_patients);

    -- f) Pacientes
    DELETE FROM quirofano.patients WHERE id IN (SELECT id FROM tmp_test_patients);

    DROP TABLE tmp_test_patients;

    -- 2. ASEGURAR MÉDICOS
    SELECT id INTO v_doctor_id FROM quirofano.doctors WHERE full_name = 'DR. ALEJANDRO MAGNO' LIMIT 1;
    IF v_doctor_id IS NULL THEN
        INSERT INTO quirofano.doctors (full_name, specialty, active)
        VALUES ('DR. ALEJANDRO MAGNO', 'Cirugía Cardiovascular', true)
        RETURNING id INTO v_doctor_id;
    END IF;

    SELECT id INTO v_anest_id FROM quirofano.doctors WHERE full_name = 'DR. ROBERTO GOMEZ' LIMIT 1;
    IF v_anest_id IS NULL THEN
        INSERT INTO quirofano.doctors (full_name, specialty, active)
        VALUES ('DR. ROBERTO GOMEZ', 'Anestesiología', true)
        RETURNING id INTO v_anest_id;
    END IF;
    
    -- 3. OBTENER CAMAS
    SELECT id INTO v_bed_1 FROM quirofano.hospital_beds WHERE status = 'available' LIMIT 1;
    SELECT id INTO v_bed_2 FROM quirofano.hospital_beds WHERE status = 'available' OFFSET 1 LIMIT 1;
    SELECT id INTO v_bed_3 FROM quirofano.hospital_beds WHERE status = 'available' OFFSET 2 LIMIT 1;

    IF v_bed_1 IS NULL THEN SELECT id INTO v_bed_1 FROM quirofano.hospital_beds LIMIT 1; END IF;
    IF v_bed_2 IS NULL THEN SELECT id INTO v_bed_2 FROM quirofano.hospital_beds OFFSET 1 LIMIT 1; END IF;
    IF v_bed_3 IS NULL THEN SELECT id INTO v_bed_3 FROM quirofano.hospital_beds OFFSET 2 LIMIT 1; END IF;

    ---------------------------------------------------------------------------
    -- CASO 1: MARIA GARCIA - REEMPLAZO VALVULAR (COMPLEJO)
    ---------------------------------------------------------------------------
    INSERT INTO quirofano.patients (full_name, document_number, insurance_name, insurance_number)
    VALUES ('MARIA GARCIA', '11.222.333', 'SWISS MEDICAL', 'SM-998877-01')
    RETURNING id INTO v_p1_id;

    INSERT INTO quirofano.hospital_admissions (patient_id, bed_id, check_in, check_out, billing_status, observations)
    VALUES (v_p1_id, v_bed_1, NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 hours', 'pendiente', 'Post-operatorio de reemplazo valvular. Evolución favorable.')
    RETURNING id INTO v_a1_id;

    INSERT INTO quirofano.surgeries (patient_id, doctor_id, anesthesiologist_id, surgery_date, start_time, procedure_name, status)
    VALUES (v_p1_id, v_doctor_id, v_anest_id, (NOW() - INTERVAL '4 days')::DATE, '07:30', 'REEMPLAZO DE VALVULA AORTICA (SIMULADO)', 'completed')
    RETURNING id INTO v_s1_id;

    INSERT INTO quirofano.surgery_forms (surgery_id, ayudante_1, ayudante_2, instrumentadora, procedimiento_efectuado)
    VALUES (v_s1_id, 'DR. PABLO ZURITA', 'DRA. ELENA SANCHEZ', 'LIC. CARMEN PAZ', 'REEMPLAZO VALVULAR AORTICO BIOPROTESICO BAJO CIRCULACION EXTRACORPOREA.')
    RETURNING id INTO v_f1_id;

    INSERT INTO quirofano.surgery_form_items (form_id, type, name, unit, quantity)
    VALUES 
    (v_f1_id, 'anesthesia', 'SEVOFLURANO 250ml', 'frasco', 1),
    (v_f1_id, 'surgery', 'VALVULA AORTICA BIOPROTESICA #21', 'unidad', 1),
    (v_f1_id, 'surgery', 'CANULA ARTERIAL 22Fr', 'unidad', 1),
    (v_f1_id, 'surgery', 'SET DE CIRCULACION EXTRACORPOREA', 'unidad', 1),
    (v_f1_id, 'surgery', 'SURGICEL FIBRILLAR 2x4', 'unidad', 2);

    INSERT INTO quirofano.hospital_medication_logs (admission_id, medication_name, dose, unit, administered_at, administered_by)
    VALUES 
    (v_a1_id, 'CEFAZOLINA 2gr', '1', 'frasco', NOW() - INTERVAL '4 days', 'ENF. RIVERO'),
    (v_a1_id, 'AMIODARONA 150mg', '1', 'amp', NOW() - INTERVAL '3 days', 'ENF. RIVERO'),
    (v_a1_id, 'FUROSEMIDA 20mg', '1', 'amp', NOW() - INTERVAL '2 days', 'ENF. SOSA'),
    (v_a1_id, 'ASPIRINA 100mg', '1', 'comp', NOW() - INTERVAL '1 day', 'ENF. SOSA');

    ---------------------------------------------------------------------------
    -- CASO 2: CARLOS LOPEZ - COLECISTECTOMIA (RAPIDO)
    ---------------------------------------------------------------------------
    INSERT INTO quirofano.patients (full_name, document_number, insurance_name, insurance_number)
    VALUES ('CARLOS LOPEZ', '22.333.444', 'GALENO ORO', 'G-1234567-00')
    RETURNING id INTO v_p2_id;

    INSERT INTO quirofano.hospital_admissions (patient_id, bed_id, check_in, check_out, billing_status)
    VALUES (v_p2_id, v_bed_2, NOW() - INTERVAL '24 hours', NOW() - INTERVAL '1 hour', 'pendiente')
    RETURNING id INTO v_a2_id;

    INSERT INTO quirofano.surgeries (patient_id, doctor_id, anesthesiologist_id, surgery_date, start_time, procedure_name, status)
    VALUES (v_p2_id, v_doctor_id, v_anest_id, (NOW() - INTERVAL '20 hours')::DATE, '14:00', 'COLECISTECTOMIA LAPAROSCOPICA (SIMULADA)', 'completed')
    RETURNING id INTO v_s2_id;

    INSERT INTO quirofano.surgery_forms (surgery_id, ayudante_1, instrumentadora, procedimiento_efectuado)
    VALUES (v_s2_id, 'DR. JORGE BATLLE', 'LIC. MARTA ESTEVEZ', 'COLECISTECTOMIA POR LAPAROSCOPIA SIN COMPLICACIONES.')
    RETURNING id INTO v_f2_id;

    INSERT INTO quirofano.surgery_form_items (form_id, type, name, unit, quantity)
    VALUES 
    (v_f2_id, 'surgery', 'TROCAR DESCARTABLE 10mm', 'unidad', 1),
    (v_f2_id, 'surgery', 'TROCAR DESCARTABLE 5mm', 'unidad', 2),
    (v_f2_id, 'surgery', 'CLIPS DE TITANIO (CARGA X 6)', 'unidad', 1),
    (v_f2_id, 'surgery', 'BOLSA DE EXTRACCION DE ORGANOS', 'unidad', 1);

    ---------------------------------------------------------------------------
    -- CASO 3: ANA MARTINEZ - CLINICO (SIN CIRUGIA)
    ---------------------------------------------------------------------------
    INSERT INTO quirofano.patients (full_name, document_number, insurance_name, insurance_number)
    VALUES ('ANA MARTINEZ', '33.444.555', 'PARTICULAR', NULL)
    RETURNING id INTO v_p3_id;

    INSERT INTO quirofano.hospital_admissions (patient_id, bed_id, check_in, check_out, billing_status, observations)
    VALUES (v_p3_id, v_bed_3, NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 hours', 'pendiente', 'Ingreso por Neumonía de comunidad. Tratamiento ATB completo.')
    RETURNING id INTO v_a3_id;

    INSERT INTO quirofano.hospital_medication_logs (admission_id, medication_name, dose, unit, administered_at, administered_by)
    VALUES 
    (v_a3_id, 'AMOXICILINA/CLAVULANICO 1.2gr', '1', 'frasco', NOW() - INTERVAL '60 hours', 'ENF. GOMEZ'),
    (v_a3_id, 'NEBULIZACION C/SALBUTAMOL', '1', 'dosis', NOW() - INTERVAL '48 hours', 'ENF. GOMEZ'),
    (v_a3_id, 'AMOXICILINA/CLAVULANICO 1.2gr', '1', 'frasco', NOW() - INTERVAL '36 hours', 'ENF. GOMEZ'),
    (v_a3_id, 'NEBULIZACION C/SALBUTAMOL', '1', 'dosis', NOW() - INTERVAL '24 hours', 'ENF. LOPEZ'),
    (v_a3_id, 'AMOXICILINA/CLAVULANICO 1.2gr', '1', 'frasco', NOW() - INTERVAL '12 hours', 'ENF. LOPEZ');

END $$;
