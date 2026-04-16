-- Add notification_preferences column to users table if it doesn't exist
ALTER TABLE quirofano.users 
ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"delays": true, "daily_summary": true, "status_changes": true}';
