-- SQL para habilitar la Gestión Profesional de Documentos

-- 1. Crear tabla de documentos (si no existe) o agregar columna 'category'
CREATE TABLE IF NOT EXISTS quirofano.surgery_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surgery_id UUID NOT NULL REFERENCES quirofano.surgeries(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    file_path TEXT NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Agregar columna category si no existe
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_schema='quirofano' 
                   AND table_name='surgery_documents' 
                   AND column_name='category') THEN
        ALTER TABLE quirofano.surgery_documents ADD COLUMN category TEXT DEFAULT 'other';
    END IF;
END $$;

-- 2. Asegurar que el bucket 'documents' exista
-- Nota: Esto suele hacerse desde la consola de Supabase, 
-- pero aquí están las políticas RLS sugeridas:

/*
-- Política: Permitir lectura pública (o restringida por rol)
CREATE POLICY "Documentos visibles por usuarios autenticados" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- Política: Permitir subida a usuarios autenticados
CREATE POLICY "Permitir subida de documentos" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- Política: Permitir eliminación al propietario o admin
CREATE POLICY "Permitir borrar documentos" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'documents' AND auth.role() = 'authenticated');
*/
