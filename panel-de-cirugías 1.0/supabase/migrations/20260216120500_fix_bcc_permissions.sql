-- Fix for BCC Error (PGRST204: Missing Column)
-- This migration ensures the column exists and PostgREST can see it by granting permissions.

-- 1. Ensure the quirofano schema is accessible
GRANT USAGE ON SCHEMA quirofano TO authenticated, anon, service_role;

-- 2. Ensure bcc_enabled exists in admin_settings
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema='quirofano' 
                   AND table_name='admin_settings' 
                   AND column_name='bcc_enabled') THEN
        ALTER TABLE quirofano.admin_settings ADD COLUMN bcc_enabled BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 3. Grant table permissions
GRANT SELECT, UPDATE, INSERT ON quirofano.admin_settings TO authenticated, service_role;
GRANT SELECT ON quirofano.admin_settings TO anon;

-- 4. Enable RLS if not already enabled (and set a permissive policy for testing if needed)
ALTER TABLE quirofano.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all for authenticated users" ON quirofano.admin_settings;
CREATE POLICY "Enable all for authenticated users" ON quirofano.admin_settings
FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- 5. Force specific column grant (sometimes required for PostgREST cache)
GRANT ALL (bcc_enabled) ON quirofano.admin_settings TO authenticated, service_role;

-- 6. Trigger a schema reload by making a no-op change if necessary (PostgREST usually reloads on DDL)
COMMENT ON COLUMN quirofano.admin_settings.bcc_enabled IS 'Toggle for Modo Espía (BCC)';
