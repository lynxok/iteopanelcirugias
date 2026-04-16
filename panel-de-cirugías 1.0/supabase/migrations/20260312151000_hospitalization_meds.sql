-- 1. Medication Logs Table
CREATE TABLE IF NOT EXISTS quirofano.hospital_medication_logs (
    id uuid DEFAULT extensions.uuid_generate_v4() PRIMARY KEY,
    admission_id uuid REFERENCES quirofano.hospital_admissions(id) ON DELETE CASCADE,
    medication_name text NOT NULL,
    dose numeric NOT NULL,
    unit text NOT NULL, -- mg, ml, units, comp, etc.
    administered_at timestamp with time zone DEFAULT now(),
    next_dose_at timestamp with time zone,
    administered_by text,
    created_at timestamp with time zone DEFAULT now()
);

-- 2. Permissions
GRANT ALL ON quirofano.hospital_medication_logs TO authenticated;
GRANT ALL ON quirofano.hospital_medication_logs TO anon;
GRANT ALL ON quirofano.hospital_medication_logs TO public;

-- 3. RLS
ALTER TABLE quirofano.hospital_medication_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select meds" ON quirofano.hospital_medication_logs;
DROP POLICY IF EXISTS "Public insert meds" ON quirofano.hospital_medication_logs;
DROP POLICY IF EXISTS "Public update meds" ON quirofano.hospital_medication_logs;
DROP POLICY IF EXISTS "Public delete meds" ON quirofano.hospital_medication_logs;

CREATE POLICY "Public select meds" ON quirofano.hospital_medication_logs FOR SELECT TO public USING (true);
CREATE POLICY "Public insert meds" ON quirofano.hospital_medication_logs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update meds" ON quirofano.hospital_medication_logs FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public delete meds" ON quirofano.hospital_medication_logs FOR DELETE TO public USING (true);

-- 4. Sample Medications (Optional - using catalog_items is better)
-- Inserting a few common medications into catalog_items if they don't exist
INSERT INTO quirofano.catalog_items (name, category)
VALUES 
('Dipirona', 'medication'),
('Diclofenac', 'medication'),
('Morfina', 'medication'),
('Amoxicilina', 'medication'),
('Omeprazol', 'medication'),
('Dexametasona', 'medication'),
('Paracetamol', 'medication')
ON CONFLICT (name) DO NOTHING;
