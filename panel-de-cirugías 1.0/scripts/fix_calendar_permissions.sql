-- 1. Enable RLS on impacted tables
ALTER TABLE quirofano.surgery_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE quirofano.system_alerts ENABLE ROW LEVEL SECURITY;

-- 2. Policies for surgery_documents (Calendar needs this to check for missing docs)
DROP POLICY IF EXISTS "Enable read access for all users" ON quirofano.surgery_documents;
CREATE POLICY "Enable read access for all users" ON quirofano.surgery_documents
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable insert for authenticated users" ON quirofano.surgery_documents;
CREATE POLICY "Enable insert for authenticated users" ON quirofano.surgery_documents
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable delete for authenticated users" ON quirofano.surgery_documents;
CREATE POLICY "Enable delete for authenticated users" ON quirofano.surgery_documents
    FOR DELETE USING (auth.role() = 'authenticated');

-- 3. Policies for system_alerts (Header needs this)
DROP POLICY IF EXISTS "Enable read access for all users" ON quirofano.system_alerts;
CREATE POLICY "Enable read access for all users" ON quirofano.system_alerts
    FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Enable update for authenticated users" ON quirofano.system_alerts;
CREATE POLICY "Enable update for authenticated users" ON quirofano.system_alerts
    FOR UPDATE USING (auth.role() = 'authenticated');

-- 4. Reload API Cache
NOTIFY pgrst, 'reload config';
