# Base de Conocimiento del Proyecto: Coordinación Quirófano

Este documento mantiene un registro de decisiones técnicas, patrones y conocimientos críticos para asegurar el aprendizaje continuo y la persistencia de contexto.

## Decisiones Técnicas
- **[2026-02-02] Esquema de Base de Datos**: Las tablas principales `patients` y `surgeries` se encuentran en el esquema `quirofano` de Supabase, no en `public`. Es necesario especificar el esquema en consultas SQL directas de mantenimiento (ej: `ALTER TABLE quirofano.patients...`).
- **[2026-02-02] Columnas Faltantes Corregidas**: Se agregaron manualmente las columnas `medical_record_number`, `birth_date` a `patients` y `surgery_side`, `pre_op_notes` a `surgeries`.
- **[2026-01-30] Integración con Supabase**: Se ha migrado la persistencia de datos de mocks locales a Supabase. Se utiliza `@supabase/supabase-js`.
- **[2026-01-30] Estructura de Datos Relacional**: Las cirugías (`surgeries`) están vinculadas a `patients`, `doctors` y `operating_rooms` mediante IDs. Siempre usar joins al consultar para evitar datos incompletos.
- **[2026-01-30] Lógica de Monitor en Vivo**: El monitor quirúrgico se refresca cada 60 segundos automáticamente para reflejar cambios en tiempo real sin intervención del usuario.
- **[2026-01-30] Infraestructura de Auditoría**: Se ha implementado la tabla `quirofano.audit_logs`. Esta tabla es inmutable por convención (solo inserciones y lecturas). Se utiliza para registrar cambios de estado, creaciones y eliminaciones críticas.
- **[2026-02-10] Lógica de Monitor (Auto-Finish)**: Se cambió la lógica de finalización automática de "Solo Visual" a "Actualización Real en Base de Datos". Cuando una cirugía excede su tiempo estimado (+ buffer), el monitor actualiza el estado a `completed` en la DB para mantener consistencia con el Calendario.
- **[2026-02-10] Control de Usuario (Refresco Manual)**: Se añadió un botón "Refrescar" en el Calendario para permitir actualizaciones forzadas de datos sin recargar la página completa.
- **[2026-02-10] Versión 1.2.5**: Sistema de notificación de actualizaciones automáticas integrado. Mejora en validación de fechas con año máximo (2100) y mensajes de error detallados.
- **[2026-02-10] Versión 1.2.4**: Filtro de especialidades en selección de médicos (oculta anestesistas en campos de cirujano) y visibilidad de flechas de reordenamiento siempre activa en tablets.
- **[2026-02-10] Versión 1.2.3**: Corrección de desbordamiento en vista de Mes (filas flexibles) y mejoras de visibilidad inferior con padding adicional.
- **[2026-02-10] Versión 1.2.2**: Correcciones de interfaz: Ajuste de z-index en barra lateral (menú) para evitar solapamientos y corrección de desbordamiento en tarjetas de cirugía (mobile agenda).
- **[2026-02-10] Versión 1.2.1**: Refinamientos de interfaz: leyenda de reglas colapsable (contraída por defecto) y columna de horarios más fina en vista semanal para optimizar espacio.
- **[2026-02-10] Versión 1.2.0**: Incluye mejoras críticas en el guardado de cirugías (fix para rol Internación), nueva vista semanal del calendario responsiva con scroll horizontal.

## Patrones y Estructura
- **Mapeo de Validaciones (Kanban)**:
    - `ortho_validated` -> **Materiales** (Mat)
    - `admission_validated` -> **Estudios/Clínico** (Clin)
    - `or_validated` -> **Administrativo** (Adm)
- **Clasificación en Monitor**:
    - **Previous**: Última cirugía con `status = 'Finalizada'`.
    - **Current**: Cirugía con `status = 'En Curso'`.
    - **Next**: Primera cirugía con `status = 'Programada'` posterior a la actual.

## Comandos y Utilidades
- `npm run dev`: Inicia el servidor de desarrollo Vite.
- Archivo de cliente Supabase: `src/lib/supabase.ts`.

## Estado del Proyecto
- [x] Conexión de Calendario con Supabase.
- [x] Conexión de Planificación (Kanban) con Supabase.
- [x] Conexión de Monitor en Vivo con Supabase.
- [ ] Próximo: Revisar otros módulos como "Protocolos" o "Configuración" para estandarizar el uso de datos reales.

## Preferencias del Usuario
- **Idioma**: Siempre hablar en español.
- **Análisis de Impacto**: Por instrucción del usuario (2026-02-10), cada cambio debe ser verificado para asegurar que no afecte otras partes de la app. Reportar cualquier riesgo de impacto colateral.
- **Aprendizaje Continuo**: Mantener la habilidad documentada en `SKILL.md` actualizada con nuevas reglas de trabajo.
