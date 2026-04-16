-- MIGRACIÓN PARA ALERTAS DE ORTOPEDIA
-- Ejecutar en el Editor SQL de Supabase

-- 1. Agregar la columna si no existe
ALTER TABLE quirofano.system_alerts 
ADD COLUMN IF NOT EXISTS target_vendor_id UUID REFERENCES quirofano.vendors(id);

-- 2. Crear un índice para optimizar el filtrado por proveedor
CREATE INDEX IF NOT EXISTS idx_alerts_vendor ON quirofano.system_alerts(target_vendor_id);

-- 3. (Opcional) Comentario para documentación
COMMENT ON COLUMN quirofano.system_alerts.target_vendor_id IS 'ID del proveedor de ortopedia al que va dirigida la alerta (si es específica).';
