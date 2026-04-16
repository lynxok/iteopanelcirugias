-- Hospitalization and Nursing Module Schema
-- Created on: 2026-03-12

-- 0. Ensure schema usage permissions
GRANT USAGE ON SCHEMA quirofano TO authenticated;
GRANT USAGE ON SCHEMA quirofano TO anon;
GRANT ALL ON ALL TABLES IN SCHEMA quirofano TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA quirofano TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA quirofano TO authenticated;

-- Ensure RLS can see the schema items
ALTER DEFAULT PRIVILEGES IN SCHEMA quirofano GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA quirofano GRANT ALL ON SEQUENCES TO authenticated;

-- 1. Rooms Table
CREATE TABLE IF NOT EXISTS quirofano.hospital_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    floor TEXT,
    layout_x INTEGER DEFAULT 0,
    layout_y INTEGER DEFAULT 0,
    layout_w INTEGER DEFAULT 1, -- Grid units or pixels
    layout_h INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Beds Table
CREATE TABLE IF NOT EXISTS quirofano.hospital_beds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES quirofano.hospital_rooms(id) ON DELETE CASCADE,
    bed_code TEXT UNIQUE NOT NULL, -- Format: ROOM-BED (e.g., 101-A)
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'cleaning_pending', 'maintenance')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Admissions Table (Internaciones)
CREATE TABLE IF NOT EXISTS quirofano.hospital_admissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_id UUID REFERENCES quirofano.patients(id) ON DELETE CASCADE,
    bed_id UUID REFERENCES quirofano.hospital_beds(id) ON DELETE SET NULL,
    check_in TIMESTAMPTZ DEFAULT NOW(),
    check_out TIMESTAMPTZ, -- Released by Nurse
    ready_at TIMESTAMPTZ, -- Set when status goes from cleaning_pending to available
    medications TEXT,
    allergies TEXT,
    observations TEXT,
    est_discharge TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Status History for Analytics
CREATE TABLE IF NOT EXISTS quirofano.hospital_bed_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bed_id UUID REFERENCES quirofano.hospital_beds(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    changed_by TEXT, -- User name or ID
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. RLS Policies
ALTER TABLE quirofano.hospital_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE quirofano.hospital_beds ENABLE ROW LEVEL SECURITY;
ALTER TABLE quirofano.hospital_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quirofano.hospital_bed_history ENABLE ROW LEVEL SECURITY;

-- Ensure usage on extensions for UUID generation
GRANT USAGE ON SCHEMA extensions TO public;
GRANT USAGE ON SCHEMA extensions TO anon;
GRANT USAGE ON SCHEMA quirofano TO public;
GRANT USAGE ON SCHEMA quirofano TO anon;

-- Granular permissions for public users
GRANT ALL ON ALL TABLES IN SCHEMA quirofano TO public;
GRANT ALL ON ALL SEQUENCES IN SCHEMA quirofano TO public;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA quirofano TO public;

-- CLEANUP: Exhaustive Drop of all previous naming conventions
-- Rooms
DROP POLICY IF EXISTS "Allow authenticated read rooms" ON quirofano.hospital_rooms;
DROP POLICY IF EXISTS "Allow authenticated manage rooms" ON quirofano.hospital_rooms;
DROP POLICY IF EXISTS "Allow authenticated select rooms" ON quirofano.hospital_rooms;
DROP POLICY IF EXISTS "Allow authenticated insert rooms" ON quirofano.hospital_rooms;
DROP POLICY IF EXISTS "Allow authenticated update rooms" ON quirofano.hospital_rooms;
DROP POLICY IF EXISTS "Allow authenticated delete rooms" ON quirofano.hospital_rooms;

-- Beds
DROP POLICY IF EXISTS "Allow authenticated read beds" ON quirofano.hospital_beds;
DROP POLICY IF EXISTS "Allow authenticated manage beds" ON quirofano.hospital_beds;
DROP POLICY IF EXISTS "Allow authenticated select beds" ON quirofano.hospital_beds;
DROP POLICY IF EXISTS "Allow authenticated insert beds" ON quirofano.hospital_beds;
DROP POLICY IF EXISTS "Allow authenticated update beds" ON quirofano.hospital_beds;
DROP POLICY IF EXISTS "Allow authenticated delete beds" ON quirofano.hospital_beds;

-- Admissions
DROP POLICY IF EXISTS "Allow authenticated manage admissions" ON quirofano.hospital_admissions;
DROP POLICY IF EXISTS "Allow authenticated select admissions" ON quirofano.hospital_admissions;
DROP POLICY IF EXISTS "Allow authenticated insert admissions" ON quirofano.hospital_admissions;
DROP POLICY IF EXISTS "Allow authenticated update admissions" ON quirofano.hospital_admissions;
DROP POLICY IF EXISTS "Allow authenticated delete admissions" ON quirofano.hospital_admissions;

-- History
DROP POLICY IF EXISTS "Allow authenticated manage history" ON quirofano.hospital_bed_history;
DROP POLICY IF EXISTS "Allow authenticated select history" ON quirofano.hospital_bed_history;
DROP POLICY IF EXISTS "Allow authenticated insert history" ON quirofano.hospital_bed_history;

-- NEW: Drop the public policies we are about to create for cleanup
DROP POLICY IF EXISTS "Public select rooms" ON quirofano.hospital_rooms;
DROP POLICY IF EXISTS "Public insert rooms" ON quirofano.hospital_rooms;
DROP POLICY IF EXISTS "Public update rooms" ON quirofano.hospital_rooms;
DROP POLICY IF EXISTS "Public delete rooms" ON quirofano.hospital_rooms;

DROP POLICY IF EXISTS "Public select beds" ON quirofano.hospital_beds;
DROP POLICY IF EXISTS "Public insert beds" ON quirofano.hospital_beds;
DROP POLICY IF EXISTS "Public update beds" ON quirofano.hospital_beds;
DROP POLICY IF EXISTS "Public delete beds" ON quirofano.hospital_beds;

DROP POLICY IF EXISTS "Public select admissions" ON quirofano.hospital_admissions;
DROP POLICY IF EXISTS "Public insert admissions" ON quirofano.hospital_admissions;
DROP POLICY IF EXISTS "Public update admissions" ON quirofano.hospital_admissions;
DROP POLICY IF EXISTS "Public delete admissions" ON quirofano.hospital_admissions;

DROP POLICY IF EXISTS "Public select history" ON quirofano.hospital_bed_history;
DROP POLICY IF EXISTS "Public insert history" ON quirofano.hospital_bed_history;

-- CREATE NEW GRANULAR POLICIES (Matching the Drops above)

-- Rooms
CREATE POLICY "Public select rooms" ON quirofano.hospital_rooms FOR SELECT TO public USING (true);
CREATE POLICY "Public insert rooms" ON quirofano.hospital_rooms FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update rooms" ON quirofano.hospital_rooms FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public delete rooms" ON quirofano.hospital_rooms FOR DELETE TO public USING (true);

-- Beds
CREATE POLICY "Public select beds" ON quirofano.hospital_beds FOR SELECT TO public USING (true);
CREATE POLICY "Public insert beds" ON quirofano.hospital_beds FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update beds" ON quirofano.hospital_beds FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public delete beds" ON quirofano.hospital_beds FOR DELETE TO public USING (true);

-- Admissions
CREATE POLICY "Public select admissions" ON quirofano.hospital_admissions FOR SELECT TO public USING (true);
CREATE POLICY "Public insert admissions" ON quirofano.hospital_admissions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Public update admissions" ON quirofano.hospital_admissions FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Public delete admissions" ON quirofano.hospital_admissions FOR DELETE TO public USING (true);

-- History
CREATE POLICY "Public select history" ON quirofano.hospital_bed_history FOR SELECT TO public USING (true);
CREATE POLICY "Public insert history" ON quirofano.hospital_bed_history FOR INSERT TO public WITH CHECK (true);

-- 6. Indexes for Analytics
CREATE INDEX IF NOT EXISTS idx_admission_bed ON quirofano.hospital_admissions(bed_id);
CREATE INDEX IF NOT EXISTS idx_bed_status ON quirofano.hospital_beds(status);
CREATE INDEX IF NOT EXISTS idx_bed_history_dates ON quirofano.hospital_bed_history(started_at, ended_at);

-- 7. Test Data (Verify SELECT works with real data)
-- Ensure we don't have duplicates from previous failed runs
DELETE FROM quirofano.hospital_rooms WHERE name = 'Habitación 100';
INSERT INTO quirofano.hospital_rooms (name, floor) 
VALUES ('Habitación 100', 'PB');
