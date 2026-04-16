-- Script exhaustivo para agregar columnas faltantes en el esquema 'quirofano'

-- 1. Tabla 'surgeries'
ALTER TABLE quirofano.surgeries 
ADD COLUMN IF NOT EXISTS authorization_date date,
ADD COLUMN IF NOT EXISTS medical_coverage text,
ADD COLUMN IF NOT EXISTS requires_prosthesis boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS vendor_id uuid, -- Asumiendo que vendor_id es UUID (como suele ser en Supabase), si es text cambialo a text
ADD COLUMN IF NOT EXISTS anesthesia_type text,
ADD COLUMN IF NOT EXISTS pre_op_exams boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pre_op_date date,
ADD COLUMN IF NOT EXISTS consent_signed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS surgery_side text,
ADD COLUMN IF NOT EXISTS pre_op_notes text,
ADD COLUMN IF NOT EXISTS ortho_validated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS admission_validated boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS or_validated boolean DEFAULT false;

-- 2. Tabla 'patients' (por si acaso faltó alguna de antes)
ALTER TABLE quirofano.patients 
ADD COLUMN IF NOT EXISTS medical_record_number text,
ADD COLUMN IF NOT EXISTS birth_date date;

-- Recargar caché de esquema (Importante para que la API detecte los cambios)
NOTIFY pgrst, 'reload config';
