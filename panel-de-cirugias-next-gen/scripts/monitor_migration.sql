-- 1. Update Surgery Status Check Constraint (if exists) or just allows new values
-- Note: If you have a check constraint on 'status', you need to drop and recreate it.
-- Assuming standard text column, but let's be safe.

ALTER TABLE quirofano.surgeries 
DROP CONSTRAINT IF EXISTS surgeries_status_check;

ALTER TABLE quirofano.surgeries 
ADD CONSTRAINT surgeries_status_check 
CHECK (status IN ('pending', 'scheduled', 'in_or', 'in_progress', 'delayed', 'recovery', 'completed', 'cancelled', 'suspended', 'pending_validation'));

-- 1b. Add columns for tracking actual times (for efficiency metrics)
ALTER TABLE quirofano.surgeries 
ADD COLUMN IF NOT EXISTS actual_start_time TIMESTAMP WITH TIME ZONE;

ALTER TABLE quirofano.surgeries 
ADD COLUMN IF NOT EXISTS actual_end_time TIMESTAMP WITH TIME ZONE;

-- 2. Create Notifications Table
CREATE TABLE IF NOT EXISTS quirofano.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Or link to a users table if you use custom one
    -- If using your 'users' table in public/quirofano schema:
    -- user_id UUID REFERENCES quirofano.users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index for faster queries by user
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON quirofano.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON quirofano.notifications(read);

-- 3. Enable RLS
ALTER TABLE quirofano.notifications ENABLE ROW LEVEL SECURITY;

-- 4. Policies
-- Users can see their own notifications
CREATE POLICY "Users can view own notifications" 
ON quirofano.notifications FOR SELECT 
USING (auth.uid() = user_id);

-- System/Admins can insert notifications (broad policy for now, refine as needed)
CREATE POLICY "System/Admins can insert notifications" 
ON quirofano.notifications FOR INSERT 
WITH CHECK (true);

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications" 
ON quirofano.notifications FOR UPDATE 
USING (auth.uid() = user_id);
