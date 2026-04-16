-- Fix Vademecum visibility: Add RLS policy for reading catalog items
ALTER TABLE quirofano.catalog_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for authenticated users" ON quirofano.catalog_items;

CREATE POLICY "Enable read access for authenticated users" ON quirofano.catalog_items
FOR SELECT TO authenticated USING (true);
