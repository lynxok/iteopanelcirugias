# Base de Datos - Coordinación de Quirófano ITEO

## Esquema y Conectividad

*   **Esquema `quirofano`**: El sistema opera de manera casi exclusiva sobre el esquema personalizado `quirofano` de Supabase (no sobre el esquema predeterminado `public`).
    *   **IMPORTANTE**: Para cualquier consulta SQL directa o script de migración, se debe especificar siempre el prefijo del esquema (ej. `SELECT * FROM quirofano.surgeries;`).
    *   El archivo de cliente Supabase en el frontend se ubica en `src/lib/supabase.ts`.
*   **Proyecto Activo de Supabase**: El ID del proyecto activo de Supabase en producción es `wbguwmbwutvhqsirtjps` (nombre del proyecto: "Control de personal").
*   **Conexiones Especiales**: Se utiliza un cliente de conexión secundario (`supabasePublic`) para leer la tabla `system_fields` ubicada en el esquema `public`, previniendo errores 404 al buscarla dentro del esquema `quirofano`.

## Estructura Relacional de Tablas Clave

Las tablas principales en el esquema `quirofano` son:
*   `patients`: Datos de pacientes. Contiene campos manuales agregados: `medical_record_number`, `birth_date` e `insurance_name` (sincronizada automáticamente desde la cirugía).
*   `surgeries`: Cirugías programadas. Se vincula mediante llaves foráneas a `patients`, `doctors` y `operating_rooms`.
    *   Columnas agregadas: `surgery_side`, `pre_op_notes`, `original_start_time` (para auditoría de cambio horario), `nuc` (migrada desde el nivel del paciente al nivel de la cirugía para permitir NUCs independientes en ingresos históricos), `created_by_role` (para registrar el rol creador de la cirugía y condicionar permisos de edición), `paciente_notificado` / `paciente_notificado_por` / `paciente_notificado_at` (marcado exclusivo para la gestión de la Oficina ART), `pedido_autorizacion_art` / `pedido_autorizacion_art_por` / `pedido_autorizacion_art_at` (marcado y registro de usuario para solicitud de autorización ART), e `is_ambulatory` (boolean, marca si la cirugía individual es de modalidad ambulatoria).
*   `doctors`: Listado de médicos profesionales.
*   `operating_rooms`: Quirófanos disponibles. Columna agregada: `is_ambulatory` (boolean, marca si el quirófano está destinado a cirugías ambulatorias de forma predeterminada).
*   `users`: Tabla personalizada de datos de usuarios autenticados.
    *   Campos añadidos: `resident_level` (para guardar R1, R2, R3, R4) y `can_view_all_vendors` (para proveedores de ortopedia habilitados a ver cirugías de otras empresas).
*   `audit_logs`: Tabla inmutable utilizada para registrar cambios críticos de estados, creaciones y eliminaciones (`old` -> `new`).

## Row Level Security (RLS)
El RLS está habilitado y es altamente restrictivo en todas las tablas sensibles del esquema `quirofano`:
*   `quirofano.admin_settings`: Lectura a usuarios autenticados, escritura exclusiva restringida a `SuperAdmin`, `Direccion` y `Administrador`.
*   `quirofano.patients`, `quirofano.surgeries`, `quirofano.users`: Solo usuarios autenticados (`authenticated`). Se eliminaron todas las políticas públicas anónimas (`Public Access`).
*   `quirofano.surgery_documents`, `quirofano.surgery_forms`, `quirofano.surgery_form_items`, `quirofano.surgery_materials`: Solo usuarios autenticados.
*   `quirofano.hospital_rooms`, `quirofano.hospital_beds`, `quirofano.hospital_admissions`, `quirofano.hospital_bed_history`: Solo usuarios autenticados.
*   `quirofano.email_notifications`, `quirofano.tecnico_manual_surgeries`: RLS activado, acceso exclusivo a usuarios autenticados.
*   `quirofano.operating_rooms`, `quirofano.coverages`, `quirofano.catalog_items`, `quirofano.cie10_catalog`: Lectura (`SELECT`) pública para carga de nombres y catálogos, escritura (`INSERT`/`UPDATE`/`DELETE`) restringida a usuarios autenticados.
*   `quirofano.practice_bed_occupancy_stats`: Almacena el recuento y promedios/medianas de días de cama recolectados por procedimiento quirúrgico.

## Automatización por Triggers de Postgres
*   **Auditoría Dinámica (`audit_triggers.sql`)**: Se ejecutan triggers automáticos a nivel de base de datos en las tablas `surgeries`, `patients`, `materials`, `users` y `doctors`. Registran automáticamente en `quirofano.audit_logs` cualquier modificación en cualquier columna detallando el objeto JSONB con el cambio.
*   **Sincronización Bidireccional de Usuarios (`sync_user_to_auth()`)**: Trigger mejorado (`AFTER INSERT OR UPDATE ON quirofano.users`) que sincroniza automáticamente tanto altas como modificaciones de correos, roles y contraseñas (cifradas mediante `crypt(password, gen_salt('bf', 10))`) hacia `auth.users` y `auth.identities`.
*   **Inicialización del Horario Original (`quirofano.set_original_surgery_date`)**: Trigger encargado de inicializar el valor de la columna `original_start_time` cuando una cirugía es guardada por primera vez.
*   **Recálculo de Estadísticas de Camas (`trg_admission_checkout_bed_occupancy`)**: Trigger en `quirofano.hospital_admissions` que se dispara al establecer `check_out` de una internación, recalculando y actualizando las estadísticas de días de cama del procedimiento asociado.

## Ajustes e Historial SQL
*   **Blindaje de Seguridad RLS y Sincronización Auth (24/08/2026)**:
    *   Sincronización completa de los 67 usuarios de `quirofano.users` hacia `auth.users` con contraseñas encriptadas en bcrypt.
    *   Eliminadas todas las políticas públicas anónimas (`public ALL true`) en `patients`, `surgeries`, `users`, `surgery_documents`, `surgery_forms`, `surgery_form_items`, `surgery_materials`, `system_alerts`, `system_errors` y `admin_settings`.
    *   Activado RLS en `email_notifications` y `tecnico_manual_surgeries`.
    *   Script de aplicación: `supabase/migrations/apply_security_hardening.sql`.
    *   Script de rollback inmediato: `supabase/migrations/revert_security_hardening.sql`.
*   **Resolución de Ambigüedad de Función**: Se purgó la base de datos eliminando la variante antigua de la función `save_admin_setting` de 2 parámetros (`DROP FUNCTION quirofano.save_admin_setting(p_key text, p_value text);`), quedando únicamente la de 4 parámetros con valores por defecto.
*   **Estadísticas de Ocupación (10/07/2026)**: Creación de la tabla `practice_bed_occupancy_stats`, función de agregación analítica de estancias `recalculate_practice_bed_occupancy_stats` (excluyendo outliers mayores a 30 días) y su respectivo trigger automático de alta.
*   **Gestión de Técnicos (28/07/2026)**:
    *   Campos añadidos a `quirofano.users`: `is_turno_tarde` (boolean, indica si es técnico fijo) y `has_tecnico_section_access` (boolean, permite visualización del panel).
    *   Tabla `quirofano.tecnico_rates`: Almacena tarifas de horas, guardias, IP de la clínica y tarifas por práctica del nomenclador. Incluye columnas `updated_at`, `updated_by` y `updated_by_name` para trazabilidad y auditoría de ediciones.
    *   Tabla `quirofano.tecnico_attendance`: Almacena registros de fichadas/asistencia (Check-In, Break-Out, Break-In, Check-Out) y la dirección IP.
    *   Tabla `quirofano.tecnico_monthly_consents`: Registra las firmas mensuales de conformidad de los técnicos sobre el período liquidado.
    *   Tabla `quirofano.tecnico_manual_surgeries`: Almacena cirugías agregadas manualmente o co-asignadas a técnicos. Columnas: `id`, `user_id`, `surgery_id`, `status` ('pending' | 'approved' | 'rejected'), `validated_at`, `validated_by`, `validated_by_name`, `created_by`, `created_by_name`, `created_by_role` y `notes`.
