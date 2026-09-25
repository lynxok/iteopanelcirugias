# 🔬 I+D (Investigación y Desarrollo) - Innovación Quirúrgica

Bienvenido a la sección de **I+D (Investigación y Desarrollo)** de Coordinación de Quirófano ITEO. Aquí se documentan las pruebas de concepto, propuestas de innovación, investigación aplicada de Inteligencia Artificial y tecnologías emergentes evaluadas para el ecosistema quirúrgico.

---

## 📑 Índice de Proyectos de I+D

### 1. [Auditoría de Lavado Quirúrgico con IA](file:///.agents/wiki/lavado_quirurgico_ai.md)
*   **Estado**: En Planificación / Arquitectura
*   **Enfoque**: Computer Vision (MediaPipe + Optical Flow), Biometría Periocular con EPP (cofia/barbijo), Sensores RGB vs LiDAR/RGB-D (Intel RealSense).
*   **Objetivo**: Auditoría 100% desatendida del protocolo de lavado de manos de la OMS, trazabilidad por cirugía y ranking/leaderboard de adherencia para Dirección Médica y Control de Infecciones.

---

## 🎯 Criterios para Proyectos de I+D en ITEO

1. **Alineación Clínica e Institucional**: Todo desarrollo experimental debe impactar directamente en la **Seguridad del Paciente**, la **Eficiencia Operativa** o la **Trazabilidad Institucional**.
2. **Evaluación de Hardware y Factibilidad**: Análisis riguroso de costos, disponibilidad de hardware hospitalario (grado médico vs dispositivos comerciales) y ergonomía clínica (aséptico / manos libres).
3. **Privacidad y Seguridad de Datos (HIPAA / GDPR / Ley de Protección de Datos)**: Todo procesamiento biométrico o de visión debe privilegiar la inferencia local (on-device / edge) antes del envío de datos a servidores externos.
4. **Metodología de Validación**:
   - **Fase 1**: Definición de Arquitectura y Viabilidad Teórica.
   - **Fase 2**: Prototipo / PoC en entorno controlado con cámara estándar.
   - **Fase 3**: Prueba Piloto en quirófano real con feedback de profesionales.
   - **Fase 4**: Paso a Producción e integración en el código principal.
