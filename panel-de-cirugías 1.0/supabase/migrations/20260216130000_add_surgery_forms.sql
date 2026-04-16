-- Migration: Add Ficha de Cirugía (Surgery Forms) Tables and Permissions
-- Created: 2026-02-16

-- 1. Add permission to users table
ALTER TABLE quirofano.users 
ADD COLUMN IF NOT EXISTS can_fill_forms BOOLEAN DEFAULT false;

-- 2. Create Surgery Forms table
CREATE TABLE IF NOT EXISTS quirofano.surgery_forms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    surgery_id UUID REFERENCES quirofano.surgeries(id) ON DELETE CASCADE,
    ayudante_1 TEXT,
    ayudante_2 TEXT,
    cardiologo TEXT,
    instrumentadora TEXT,
    anestesia_inicio TIME, -- HIA
    anestesia_fin TIME,    -- HFA
    cirugia_inicio TIME,   -- HCC (Pre-filled from actual_start_time)
    cirugia_fin TIME,      -- HFC (Pre-filled from actual_end_time)
    anatomia_patologica TEXT,
    cultivo TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create Surgery Form Items (Medicamentos / Insumos)
CREATE TABLE IF NOT EXISTS quirofano.surgery_form_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    form_id UUID REFERENCES quirofano.surgery_forms(id) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('anesthesia', 'surgery')),
    name TEXT NOT NULL,
    unit TEXT,
    quantity NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE quirofano.surgery_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE quirofano.surgery_form_items ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies (Authenticated users can manage forms)
-- Note: Further restrictions could be added based on can_fill_forms, 
-- but for simplicity we'll start with all authenticated users.
DROP POLICY IF EXISTS "Enable all for authenticated users" ON quirofano.surgery_forms;
CREATE POLICY "Enable all for authenticated users" ON quirofano.surgery_forms
FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for authenticated users" ON quirofano.surgery_form_items;
CREATE POLICY "Enable all for authenticated users" ON quirofano.surgery_form_items
FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. Grant Permissions
GRANT ALL ON quirofano.surgery_forms TO authenticated, service_role;
GRANT ALL ON quirofano.surgery_form_items TO authenticated, service_role;

-- 7. Add comments for clarity
COMMENT ON COLUMN quirofano.surgery_forms.anestesia_inicio IS 'Hora Inicio Anestesia (HIA)';
COMMENT ON COLUMN quirofano.surgery_forms.anestesia_fin IS 'Hora Fin Anestesia (HFA)';
COMMENT ON COLUMN quirofano.surgery_forms.cirugia_inicio IS 'Hora Inicio Cirugía (HCC)';
COMMENT ON COLUMN quirofano.surgery_forms.cirugia_fin IS 'Hora Fin Cirugía (HFC)';
