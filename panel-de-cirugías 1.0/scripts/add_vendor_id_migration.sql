-- Add vendor_id column to surgeries table in 'quirofano' schema
ALTER TABLE quirofano.surgeries 
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES quirofano.vendors(id);

-- Optional: Add index for performance
CREATE INDEX IF NOT EXISTS idx_surgeries_vendor_id ON quirofano.surgeries(vendor_id);
