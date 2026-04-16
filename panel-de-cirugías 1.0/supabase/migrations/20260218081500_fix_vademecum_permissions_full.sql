-- COMPREHENSIVE FIX FOR VADEMECUM VISIBILITY

-- 1. Grant usage on the schema to authenticated users
GRANT USAGE ON SCHEMA quirofano TO authenticated;
GRANT USAGE ON SCHEMA quirofano TO anon; -- Just in case testing without login

-- 2. Grant SELECT permission on the table to authenticated users
GRANT SELECT ON quirofano.catalog_items TO authenticated;
GRANT SELECT ON quirofano.catalog_items TO service_role;

-- 3. Reset RLS Policies
ALTER TABLE quirofano.catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON quirofano.catalog_items;
DROP POLICY IF EXISTS "Enable all access for service role" ON quirofano.catalog_items;

-- Policy for Authenticated Users (Read Only)
CREATE POLICY "Enable read access for authenticated users" ON quirofano.catalog_items
FOR SELECT TO authenticated USING (true);

-- Policy for Service Role (Full Access)
CREATE POLICY "Enable all access for service role" ON quirofano.catalog_items
FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. EMERGENCY OPTION (Uncomment if above fails)
-- If it STILL doesn't work, verify by disabling RLS completely:
-- ALTER TABLE quirofano.catalog_items DISABLE ROW LEVEL SECURITY;
