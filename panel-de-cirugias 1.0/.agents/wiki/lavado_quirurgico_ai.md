# Especificación de Diseño y Arquitectura: Sistema de Auditoría de Lavado Quirúrgico con IA

> **Estado**: En Planificación / Propuesta de Arquitectura  
> **Área**: Control de Calidad Quirúrgica, Prevención de Infecciones (IA en Quirófano)  
> **Objetivo**: Auditoría estricta, trazabilidad y ranking de adherencia al lavado de manos quirúrgico mediante Computer Vision e Inteligencia Artificial en tiempo real.

---

## 1. Visión General del Sistema

El módulo de **Estación de Lavado Quirúrgico** supervisa y audita de forma 100% desatendida (*hands-free*) el cumplimiento del protocolo de lavado de manos y antebrazos de la OMS / CDC por parte de los cirujanos e instrumentadores antes de ingresar a quirófano.

```
                    ┌──────────────────────────────────────────────┐
                    │               CÁMARA / TABLET                │
                    └───────┬──────────────────────────────┬───────┘
                            │                              │
              (1) Reconocimiento Facial             (2) Detección de Lavado
              (Embeddings Perioculares)             (MediaPipe Pose/Hands/Flow)
                            │                              │
                            └──────────────┬───────────────┘
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │    MOTOR DE AUDITORÍA (Score & Reglas)       │
                    └──────────────────────┬───────────────────────┘
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │     SUPABASE + DASHBOARD DE CALIDAD          │
                    │    (Métricas, Trazabilidad y Ranking)        │
                    └──────────────────────────────────────────────┘
```

---

## 2. Reconocimiento Facial con EPP (Cofia / Barbijo bajo la barbilla)

### Desafío
El personal quirúrgico se lava con **cofia** (cubre frente y cabello), a veces con barbijo bajo el mentón o antiparras. El reconocimiento facial estándar basado en contorno craneal o frente completa falla en este entorno.

### Solución Técnica
1. **Región Periocular / Ojos / Puente Nasal**:
   - Modelos de embeddings faciales (ej. **ArcFace / InsightFace** o **FaceNet ONNX Runtime**) enfocados en el vector biométrico de la franja media del rostro.
2. **Enrolamiento Multi-Foto**:
   - Cada médico registra 3 fotos de referencia: (1) Rostro descubierto, (2) Con cofia quirúrgica, (3) Con cofia y barbijo bajo.
3. **Inferencia Asistida por Contexto de Agenda**:
   - Se cruza la probabilidad del rostro con las cirugías del día de la base de datos `quirofano.surgeries` para priorizar a los cirujanos/ayudantes que tienen cirugías programadas en esa franja horaria.

---

## 3. Motor de Visión y Auditoría de Lavado

### Detección de Fricción y Pasos
1. **MediaPipe Pose + MediaPipe Hands**:
   - Detección de puntos clave de brazos (muñecas, codos, hombros) y manos.
   - Evaluación postural: *¿Las manos se mantienen por encima del nivel de los codos durante el aclarado/escurrido?*
2. **Optical Flow / Densidad de Movimiento (Fallback anti-espuma)**:
   - Cuando el jabón/espuma blanca oculta los pliegues de los dedos, el flujo óptico cuantifica la fricción continua de las extremidades en la zona de la bacha.

### Algoritmo de Scoring (0 a 100 puntos)

| Criterio | Peso | Condición de Aprobación |
| :--- | :---: | :--- |
| **Tiempo Total Efectivo** | 40% | Quirúrgico: $\ge 120$ seg (100%), 90–119 seg (50%), $< 90$ seg (0% - Falla crítica). |
| **Continuidad de Fricción** | 25% | Fricción activa durante $\ge 85\%$ del tiempo total (sin pausas muertas). |
| **Inclusión de Antebrazos** | 20% | Fricción registrada en zona de antebrazo $\ge 20$ seg. |
| **Higiene Postural (Codos)** | 15% | Manos por encima del nivel de los codos durante el enjuague. |

---

## 4. Análisis de Hardware: ¿Cámara Estándar (RGB) vs LiDAR / 3D (RGB-D)?

### Comparativa Técnica

* **Cámara RGB Estándar (Recomendada para Piloto / Fase 1)**:
  - **Ventajas**: Bajo costo ($50–$100 USD), soporte web directo en navegadores/Electron, modelos MediaPipe optimizados en 3D estimativo por red neuronal.
  - **Consideración**: Puede verse afectada por reflejos intensos del acero inoxidable o espuma densa en dedos si no se calibra el umbral de movimiento.
* **Cámara con LiDAR / Profundidad RGB-D (Intel RealSense D435 / OAK-D / iPad Pro)**:
  - **Ventajas**: Inmune a reflejos de acero inoxidable, mide con precisión milimétrica la altura real manos vs codos (eje Z), detecta volumen físico de manos aunque estén cubiertas de espuma.
  - **Desventajas**: Mayor costo de hardware ($350–$500 USD), dispersión de luz infrarroja si caen gotas directas en la lente.

### Recomendación de Arquitectura
* **Fase 1 (Piloto)**: Desarrollar con cámara RGB estándar (webcam HD / gran angular) y modelos de IA en frontend/cliente.
* **Fase 2 (Producción Hospitalaria)**: Si las condiciones de iluminación o reflejos de la bacha lo requieren, incorporar sensor RGB-D (Intel RealSense).

---

## 5. Modelo de Datos Propuesto (Supabase)

```sql
-- Embeddings faciales para enrolamiento con EPP
CREATE TABLE quirofano.medicos_biometria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medico_id UUID NOT NULL REFERENCES quirofano.medicos(id) ON DELETE CASCADE,
    embedding_vector JSONB NOT NULL, -- Array de floats (128d / 512d)
    tipo_foto TEXT DEFAULT 'con_cofia', -- 'sin_cofia', 'con_cofia', 'con_barbijo'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Registro y auditoría de cada sesión de lavado
CREATE TABLE quirofano.auditoria_lavado_manos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medico_id UUID REFERENCES quirofano.medicos(id),
    cirugia_id UUID REFERENCES quirofano.surgeries(id),
    tipo_lavado TEXT DEFAULT 'quirurgico', -- 'quirurgico' | 'clinico'
    duracion_segundos INT NOT NULL,
    tiempo_efectivo_friccion INT NOT NULL,
    antebrazos_detectados BOOLEAN DEFAULT false,
    postura_codos_correcta BOOLEAN DEFAULT false,
    score_calidad INT NOT NULL, -- 0 a 100
    aprobado BOOLEAN NOT NULL,
    detalle_metricas JSONB, -- desglose de tiempos por zona
    created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 6. Módulos de Frontend a Desarrollar

1. **Pantalla "Estación Lavamanos" (Modo Kiosko)**:
   - Vista aséptica sin necesidad de tocar la pantalla.
   - Reconocimiento facial al pararse frente a la bacha.
   - Cronómetro visual circular con guía de color en tiempo real (Rojo $\rightarrow$ Ámbar $\rightarrow$ Verde).
   - Feedback sonoro/visual al completar el tiempo reglamentario.
2. **Dashboard de Calidad y Ranking (Dirección Médica / Infectología)**:
   - **Leaderboard de Adherencia**: Ranking de médicos con mayor y menor tasa de cumplimiento.
   - **Métricas de Frecuencia**: % de lavados con tiempo insuficiente por especialidad médica.
   - **Trazabilidad por Cirugía**: Verificación del lavado previo al inicio de cada acto quirúrgico.
