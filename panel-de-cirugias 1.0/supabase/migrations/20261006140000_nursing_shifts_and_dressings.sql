-- Migración: Módulo de Turnos de Enfermería, Curaciones y Planificación de Cobertura
-- Fecha: 2026-10-06

-- 0. Agregar campo can_manage_nursing_shifts a la tabla quirofano.users
ALTER TABLE quirofano.users ADD COLUMN IF NOT EXISTS can_manage_nursing_shifts BOOLEAN DEFAULT FALSE;

-- 1. Tabla de Cierres de Turno de Enfermería y Curaciones
CREATE TABLE IF NOT EXISTS quirofano.nursing_shift_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    shift TEXT NOT NULL CHECK (shift IN ('manana', 'tarde', 'noche')),
    nurse_id UUID REFERENCES quirofano.users(id) ON DELETE SET NULL,
    nurse_name TEXT NOT NULL,
    wound_dressings_count INTEGER NOT NULL DEFAULT 0 CHECK (wound_dressings_count >= 0),
    avg_minutes_per_dressing INTEGER NOT NULL DEFAULT 20 CHECK (avg_minutes_per_dressing > 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_nursing_shift_log UNIQUE (date, shift, nurse_id)
);

-- 2. Tabla de Planificación de Roster / Cobertura de Enfermería (Turnos, Francos, Vacaciones, Licencias)
CREATE TABLE IF NOT EXISTS quirofano.nursing_roster (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nurse_id UUID REFERENCES quirofano.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    shift TEXT NOT NULL CHECK (shift IN ('manana', 'tarde', 'noche')),
    status TEXT NOT NULL DEFAULT 'programado' CHECK (status IN ('programado', 'franco', 'vacaciones', 'licencia', 'refuerzo')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES quirofano.users(id) ON DELETE SET NULL,
    CONSTRAINT uq_nursing_roster_entry UNIQUE (nurse_id, date, shift)
);

-- 3. Tabla de Vacaciones / Ausencias Prolongadas de Enfermería
CREATE TABLE IF NOT EXISTS quirofano.nursing_absences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nurse_id UUID REFERENCES quirofano.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'vacaciones' CHECK (type IN ('vacaciones', 'licencia_medica', 'licencia_especial', 'otro')),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES quirofano.users(id) ON DELETE SET NULL,
    CONSTRAINT check_nursing_absence_dates CHECK (end_date >= start_date)
);

-- 4. Permisos y RLS
GRANT ALL ON quirofano.nursing_shift_logs TO authenticated;
GRANT ALL ON quirofano.nursing_roster TO authenticated;
GRANT ALL ON quirofano.nursing_absences TO authenticated;

ALTER TABLE quirofano.nursing_shift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE quirofano.nursing_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE quirofano.nursing_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lectura de logs de enfermeria para autenticados" ON quirofano.nursing_shift_logs;
CREATE POLICY "Lectura de logs de enfermeria para autenticados"
ON quirofano.nursing_shift_logs FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Escritura de logs de enfermeria para autenticados" ON quirofano.nursing_shift_logs;
CREATE POLICY "Escritura de logs de enfermeria para autenticados"
ON quirofano.nursing_shift_logs FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura de roster de enfermeria para autenticados" ON quirofano.nursing_roster;
CREATE POLICY "Lectura de roster de enfermeria para autenticados"
ON quirofano.nursing_roster FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Escritura de roster de enfermeria para autenticados" ON quirofano.nursing_roster;
CREATE POLICY "Escritura de roster de enfermeria para autenticados"
ON quirofano.nursing_roster FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Lectura de ausencias de enfermeria para autenticados" ON quirofano.nursing_absences;
CREATE POLICY "Lectura de ausencias de enfermeria para autenticados"
ON quirofano.nursing_absences FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "Escritura de ausencias de enfermeria para autenticados" ON quirofano.nursing_absences;
CREATE POLICY "Escritura de ausencias de enfermeria para autenticados"
ON quirofano.nursing_absences FOR ALL TO authenticated
USING (true) WITH CHECK (true);

-- 5. Parámetros institucionales en admin_settings (tiempo promedio por curación y umbral de activación)
INSERT INTO quirofano.admin_settings (key, value)
VALUES 
    ('nursing_avg_dressing_minutes', '20'),
    ('nursing_dressing_threshold', '20')
ON CONFLICT (key) DO NOTHING;
