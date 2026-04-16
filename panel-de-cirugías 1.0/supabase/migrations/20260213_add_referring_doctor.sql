-- Add referring_doctor_id to surgeries table
ALTER TABLE quirofano.surgeries
ADD COLUMN IF NOT EXISTS referring_doctor_id UUID REFERENCES quirofano.doctors(id);

-- Add comment for clarity
COMMENT ON COLUMN quirofano.surgeries.referring_doctor_id IS 'Reference to the doctor who referred the patient (Médico Derivante)';
