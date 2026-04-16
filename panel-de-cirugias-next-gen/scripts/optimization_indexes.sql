-- ÍNDICES PARA OPTIMIZACIÓN DE RENDIMIENTO
-- Estos índices mejoran la velocidad de las consultas de filtrado, ordenamiento y unión de tablas.

-- 1. Operaciones Quirúrgicas (Consultas más pesadas)
CREATE INDEX IF NOT EXISTS idx_surgeries_date ON quirofano.surgeries(surgery_date);
CREATE INDEX IF NOT EXISTS idx_surgeries_status ON quirofano.surgeries(status);
CREATE INDEX IF NOT EXISTS idx_surgeries_doctor_id ON quirofano.surgeries(doctor_id);
CREATE INDEX IF NOT EXISTS idx_surgeries_created_at ON quirofano.surgeries(created_at DESC);

-- 2. Pacientes (Búsqueda por DNI/Documento)
CREATE INDEX IF NOT EXISTS idx_patients_document_number ON quirofano.patients(document_number);

-- 3. Documentos y Materiales (Búsquedas por ID de cirugía para el detalle)
CREATE INDEX IF NOT EXISTS idx_surgery_documents_surgery_id ON quirofano.surgery_documents(surgery_id);
CREATE INDEX IF NOT EXISTS idx_surgery_materials_surgery_id ON quirofano.surgery_materials(surgery_id);

-- 4. Otros (Opcional, para reportes y auditoría)
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_id ON quirofano.audit_logs(resource_id);
