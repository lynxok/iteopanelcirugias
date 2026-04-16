-- 1. Ensure 'active' column exists in doctors table
ALTER TABLE quirofano.doctors 
ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- 2. Verify and Enable RLS
ALTER TABLE quirofano.doctors ENABLE ROW LEVEL SECURITY;
ALTER TABLE quirofano.users ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for Doctors
-- Allow read for authenticated
DROP POLICY IF EXISTS "Enable read access for all users" ON quirofano.doctors;
CREATE POLICY "Enable read access for all users" ON quirofano.doctors
    FOR SELECT USING (auth.role() = 'authenticated');

-- Allow insert/update/delete for authenticated (or refine as needed)
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON quirofano.doctors;
CREATE POLICY "Enable insert for authenticated users" ON quirofano.doctors
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON quirofano.doctors;
CREATE POLICY "Enable update for authenticated users" ON quirofano.doctors
    FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON quirofano.doctors;
CREATE POLICY "Enable delete for authenticated users" ON quirofano.doctors
    FOR DELETE USING (auth.role() = 'authenticated');

-- 4. RLS Policies for Users (App Users)
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON quirofano.users;
CREATE POLICY "Enable all access for authenticated users" ON quirofano.users
    FOR ALL USING (auth.role() = 'authenticated');

-- 5. Reload Schema Cache
NOTIFY pgrst, 'reload config';
