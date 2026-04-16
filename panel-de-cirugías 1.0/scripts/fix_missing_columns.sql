-- Intento 1: Usar nombre simple (sin 'public.')
-- Si falla, comenta estas líneas y prueba las de abajo
DO $$
BEGIN
    -- Agregar columnas a 'patients' si existe
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'patients') THEN
        ALTER TABLE patients 
        ADD COLUMN IF NOT EXISTS medical_record_number text,
        ADD COLUMN IF NOT EXISTS birth_date date;
    END IF;

    -- Agregar columnas a 'surgeries' si existe
    IF EXISTS (SELECT FROM pg_tables WHERE tablename = 'surgeries') THEN
        ALTER TABLE surgeries
        ADD COLUMN IF NOT EXISTS surgery_side text,
        ADD COLUMN IF NOT EXISTS pre_op_notes text;
    END IF;
END $$;

-- Crear índice de manera segura
CREATE INDEX IF NOT EXISTS idx_patients_medical_record_number ON patients(medical_record_number);

-- Recargar caché
NOTIFY pgrst, 'reload config';

-- DEBUG: Listar todas las tablas para ver si 'patients' existe y cómo se llama
SELECT schemaname, tablename 
FROM pg_tables 
WHERE tablename IN ('patients', 'surgeries', 'Patients', 'Surgeries');
