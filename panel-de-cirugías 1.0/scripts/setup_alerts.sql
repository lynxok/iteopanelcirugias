-- Crear tabla de alertas del sistema
CREATE TABLE IF NOT EXISTS quirofano.system_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    patient_name TEXT,
    surgery_id UUID REFERENCES quirofano.surgeries(id) ON DELETE CASCADE,
    target_role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Active',
    date_generated TIMESTAMPTZ DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolved_by_id UUID REFERENCES quirofano.users(id)
);

-- Índices para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_alerts_surgery ON quirofano.system_alerts(surgery_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON quirofano.system_alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_role ON quirofano.system_alerts(target_role);
