-- 1. Create Patient
INSERT INTO quirofano.patients (id, full_name, document_number)
VALUES ('00000000-0000-0000-0000-000000000999', 'PACIENTE DE PRUEBA TELEGRAM', '99999999')
ON CONFLICT (id) DO UPDATE SET document_number = EXCLUDED.document_number;

-- 2. Create Critical Surgery (Correct DB Status: 'scheduled')
-- The frontend shows 'Programada', but the DB stores 'scheduled'
INSERT INTO quirofano.surgeries (
    patient_id, 
    surgery_date, 
    procedure_name, 
    status, 
    medical_coverage
)
VALUES (
    '00000000-0000-0000-0000-000000000999', 
    (CURRENT_DATE + 1), 
    'PRUEBA DE ALERTA', 
    'scheduled', 
    'OSDE'
);
