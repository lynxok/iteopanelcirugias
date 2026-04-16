-- Final Schema Refinements for Notification Enhancements

-- 1. Ensure telegram_notifications has surgery_id for logging context
ALTER TABLE quirofano.telegram_notifications 
ADD COLUMN IF NOT EXISTS surgery_id UUID REFERENCES quirofano.surgeries(id) ON DELETE SET NULL;

-- 2. Ensure admin_settings has bcc_enabled (already added but for consistency in migrations)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='quirofano' AND table_name='admin_settings' AND column_name='bcc_enabled') THEN
        ALTER TABLE quirofano.admin_settings ADD COLUMN bcc_enabled BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 3. Ensure notification_preferences is in users (already added but for consistency)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='quirofano' AND table_name='users' AND column_name='notification_preferences') THEN
        ALTER TABLE quirofano.users ADD COLUMN notification_preferences JSONB DEFAULT '{"delays": true, "daily_summary": true, "status_changes": true}';
    END IF;
END $$;
