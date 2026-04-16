-- Fix Vademecum visibility for app without Supabase Auth
-- The app uses custom auth, so requests are 'anon'. 
-- We need to allow anon access to catalog_items.

ALTER TABLE quirofano.catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON quirofano.catalog_items;

CREATE POLICY "Enable read access for all users" ON quirofano.catalog_items
FOR SELECT TO anon, authenticated, service_role USING (true);
