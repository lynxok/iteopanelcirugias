-- 1. Drop the existing foreign key constraint
ALTER TABLE quirofano.telegram_notifications
DROP CONSTRAINT IF EXISTS telegram_notifications_user_id_fkey;

-- 2. Add the correct foreign key constraint to quirofano.users
ALTER TABLE quirofano.telegram_notifications
ADD CONSTRAINT telegram_notifications_user_id_fkey
FOREIGN KEY (user_id) REFERENCES quirofano.users(id)
ON DELETE CASCADE;

-- 3. Verify the fix (Optional, just logging)
DO $$
BEGIN
    RAISE NOTICE 'Foreign key updated to reference quirofano.users(id)';
END $$;
