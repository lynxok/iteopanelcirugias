-- Billing Module Enhancements
-- Created on: 2026-03-13

-- 1. Add billing columns to hospital_admissions
ALTER TABLE quirofano.hospital_admissions 
ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'pendiente' CHECK (billing_status IN ('pendiente', 'facturado')),
ADD COLUMN IF NOT EXISTS billed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS billed_by TEXT;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_admission_billing_status ON quirofano.hospital_admissions(billing_status);

-- 3. Update permissions (redundant but safe)
GRANT ALL ON quirofano.hospital_admissions TO authenticated;
GRANT ALL ON quirofano.hospital_admissions TO anon;
GRANT ALL ON quirofano.hospital_admissions TO public;
