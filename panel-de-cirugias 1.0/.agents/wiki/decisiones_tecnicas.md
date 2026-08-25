# Decisiones Técnicas - Coordinación de Quirófano ITEO

## Entorno e Integraciones

### Alertas Proactivas y Notificaciones
*   **Sistema de Alertas**: Unifica el escaneo de cirugías futuras (hasta 21 días) y genera alertas según reglas de negocio (falta prótesis, falta autorización, etc.).
*   **Notificaciones Telegram**: Integración con Bot para envío de alertas críticas al celular.
    *   Requiere configurar `telegram_chat_id` en el perfil de usuario.
    *   El SuperAdmin tiene un interruptor global en Configuración para activar/desactivar el servicio.
    *   El token de Telegram se almacena de forma segura en Supabase y es consultado por la Edge Function `telegram-bot` en la nube.
*   **Validación Cruzada**: Las alertas persisten en base de datos (`system_alerts`) y tienen estado (Activa/Resuelta).

### Simulación de Roles
*   El **SuperAdmin** puede simular la experiencia visual de otros roles (Ortopedia, Médico, etc.) desde la barra de herramientas principal.

### Integración con OSER
*   **Navegación OSER en Dos Fases**:
    *   **Fase 1 (Headless)**: Playwright inicia sesión en segundo plano usando las credenciales seguras de OSER (`OSER_USER` y `OSER_PASSWORD` provistas por Electron desde `.env.local`), localiza la internación/NUC y extrae el estado de la sesión (`cookies`, `localStorage`) con `context.storage_state()`.
    *   **Fase 2 (Visible)**: Abre de inmediato una ventana visible de Chromium importando dicho estado, cargando directamente la ficha de detalle final del paciente.
*   **Sincronización de Anulaciones**: `scraper.py` analiza el cabezal `#container`, la fila `Cierre:` y la tabla `#estadosInternacion` buscando `"ANULA"`. `OserSyncContext.tsx` y `OserSyncModal.tsx` mapean este estado a `isAnnulledInOser`, actualizando el estado local en base de datos a `'cancelled'` y el estado OSER a `'ANULADA'`.
*   **Desactivación de Búfer de Python (Real-Time IPC)**: Se usa la variable de entorno `PYTHONUNBUFFERED: '1'` en todos los procesos lanzados desde `main.cjs` y se fuerza `flush=True` en los `print` de Python para que Electron reciba instantáneamente las notificaciones de estado (ej: `STATUS: OPENED`).

### App de Escritorio (Electron) y Distribución
*   **Descargas**: El botón "Descargar App Desktop" redirige dinámicamente al release más reciente de GitHub (`https://github.com/lynxok/iteopanelcirugias/releases/latest/download/PanelCirugias_ITEO_Setup.exe`) para evitar descargas corruptas.
*   **Auto-Configuración de Dependencias**: Al arrancar en caliente, `main.cjs` comprueba si Python, `playwright` y Chromium están instalados. Si falta alguno, `DependencyCheckerOverlay.tsx` los descarga e instala de forma silenciosa en segundo plano.
*   **Rutas de Recursos en Electron**: Se deben utilizar rutas relativas (sin barra `/` inicial, ej: `logo-iteo-azul.png` en lugar de `/logo-iteo-azul.png`) para evitar excepciones de carga de recursos locales `net::ERR_FILE_NOT_FOUND`.
*   **Impresión de Pulseras Térmicas**:
    *   Usa el canal IPC de Electron para consultar las impresoras de Windows.
    *   Permite seleccionar una impresora térmica y guardar el identificador en `localStorage`.
    *   Imprime silenciosamente forzando `marginType: 'none'`, `printBackground: true` y limitación de hojas `pageRanges: [{ from: 0, to: 0 }]` (evita impresión accidental de carillas en blanco o rotadas).
    *   **Prohibición de Doble Rotación (`landscape: true`) en Electron**: NO pasar la opción `landscape: true` a los `printOptions` de `webContents.print()` en Electron (`main.cjs`) cuando el lienzo HTML especifica un tamaño fijo mediante `@page { size: 280mm 30mm; margin: 0 !important; }`. Pasar `landscape: true` en Electron aplica una rotación secundaria de 90° sobre las dimensiones del rollo térmico (30mm), desplazando todo el texto y datos del paciente fuera de la tira impresa.
    *   **Formato CSS y Supresión de Márgenes**: La regla `@page` debe situarse obligatoriamente en el nivel raíz del bloque CSS especificando `size: 280mm 30mm;` (sin el modificador `landscape`) y `margin: 0 !important;` para que Chromium suprima encabezados y pies de página del sistema operativo.
    *   **Ajuste Vertical y Ascendentes de Texto (`line-height`)**: El nombre del paciente en `PatientPrintLabel.tsx` debe mantener un `line-height: 1.25` y padding interno vertical (`padding: 2mm 10mm` en el contenedor wrapper) para prevenir que la parte superior de las letras mayúsculas se corte contra los bordes físico-térmicos del rollo de 30mm.
    *   **REGLA ESTRICTA DE INTOCABILIDAD ESTÉTICA**: Queda estrictamente prohibido alterar la estética visual, tipografías, colores, disposición o diseño de la plantilla de pulseras de paciente (`PatientPrintLabel.tsx`) sin la solicitud explícita y previa del usuario.

### Servidor de Desarrollo y Paquetes
*   **Servidor Vite**: Iniciado con `npm run dev`.
*   **Gestor de Paquetes Exclusivo**: Se utiliza `npm` exclusivamente (`package-lock.json`). Evitar el uso de `pnpm` o `yarn` para no generar conflictos de dependencias en el espacio de trabajo.

### Integración con OBS Studio y Capturas de Pantalla
*   **Captura de Pantalla Instantánea**: Implementado el comando `TAKE_SCREENSHOT` vía canales Broadcast de Supabase Realtime. El controlador de fondo (`ObsBackgroundController.tsx`) consulta la escena activa a OBS WebSocket v5 (`GetProgramScene`) y solicita al proceso principal de Electron (`obs:get-screenshot-path` en `main.cjs`) la generación de un nombre sanitizado (`Captura_Paciente_Fecha.png`) y la creación del directorio del cirujano. La imagen se guarda mediante `SaveSourceScreenshot` de forma independiente a si hay o no una grabación de video en curso.
*   **Asistente de Solución de Problemas de Conexión**: En `ObsRecordingSection.tsx`, ante desconexiones de la PC de Quirófano (`sensors_off`), se ofrece la guía desplegable `¿Cómo solucionar?` que cubre los 5 puntos clave de verificación (App de escritorio activa, OBS Studio abierto, Quirófano asociado correcto, WebSocket habilitado en puerto `4455` y conectividad de red).
*   **Asignación de IP/Host en OBS WebSocket**: Para evitar que la IP cambie tras reiniciar la notebook por DHCP dinámico, cuando la aplicación corre en la misma notebook se debe configurar el Host/IP como `localhost` o `127.0.0.1`. Si se conecta desde otro dispositivo en la red local, se debe reservar la IP en el router por MAC address o asignar IP fija estática en la interfaz de red de Windows.

### Publicación de Releases en GitHub (Protocolo Obligatorio)
*   **Archivos Binarios Requeridos**: Para que las aplicaciones de escritorio de los usuarios y el módulo de actualización automática (`electron-updater`) funcionen correctamente, cada release de GitHub **DEBE CONTENER** los 3 artefactos generados en `release/`:
    1. `PanelCirugias_ITEO_Setup.exe` (Instalador NSIS ejecutable).
    2. `PanelCirugias_ITEO_Setup.exe.blockmap` (Bloques de actualización diferencial).
    3. `latest.yml` (Hash y manifiesto de versión).
*   **Secuencia de Comandos Estándar**:
    1. Actualizar versión en `package.json` y `public/version.json`.
    2. Actualizar notas en `CHANGELOG.md`, `historial_versiones.md` e `index.md`.
    3. Compilar instaladores: `npm run electron:build` (compila Vite y empaqueta NSIS en `release/`).
    4. Git commit y push a `main`.
    5. Crear release y subir binarios:
       ```bash
       gh release create vX.Y.Z --title "vX.Y.Z - Titulo" --notes "Notas del release..."
       gh release upload vX.Y.Z "release\PanelCirugias_ITEO_Setup.exe" "release\PanelCirugias_ITEO_Setup.exe.blockmap" "release\latest.yml" --clobber
       ```

### Plan de Seguridad, Ciberseguridad y Estado de Ramas

Para garantizar la estabilidad hospitalaria durante las auditorías de seguridad, el desarrollo se segmentó en ramas aisladas con scripts de rollback en 1 clic:

*   **Fase 1: Blindaje RLS y Autenticación Nativa (Rama `security/rls-auth-hardening`) - [COMPLETADO]**:
    *   Sincronización del 100% de las 67 cuentas de personal hacia `auth.users` con cifrado bcrypt. Trigger automático `trg_sync_user_to_auth` para altas y ediciones.
    *   Eliminación de políticas permisivas anónimas (`public ALL true`) en `patients`, `surgeries`, `users`, `surgery_documents`, `surgery_forms`, `surgery_materials`, `admin_settings`, `email_notifications` y `tecnico_manual_surgeries`.
    *   Refactorización de `AuthContext.tsx` y validación estricta de TLS en `main.cjs`.
    *   Rollback: `supabase/migrations/revert_security_hardening.sql`.

*   **Fase 2: Privacidad de Contraseñas y Desacople (Rama `security/credentials-and-passwords-protection`) - [COMPLETADO]**:
    *   Respaldo de contraseñas previas en la tabla protegida `quirofano.users_password_backup` con RLS restringido a SuperAdmin/Dirección.
    *   Enmascaramiento de la columna `password` en `quirofano.users` (`'PROTECTED_BCRYPT'`).
    *   Sincronización hacia `auth.users` y `auth.identities` asegurando consistencia de `id = user_id` para GoTrue email provider.
    *   Migración de cambio de credenciales en `Sidebar.tsx` a las APIs criptográficas nativas de Supabase Auth.
    *   Rollback: `supabase/migrations/revert_point2_credentials_protection.sql`.

*   **Fase 3: Protección de Service Role Key en Vault (Rama `security/webhook-service-role-protection`) - [COMPLETADO / ACTIVA]**:
    *   Almacenamiento cifrado de la clave de servicio en `supabase_vault` (`vault.decrypted_secrets`).
    *   Refactorización de `quirofano.email_notifications_webhook_custom()` con `SECURITY DEFINER` y lectura dinámica, eliminando tokens JWT quemados en funciones de Postgres.
    *   Rollback: `supabase/migrations/revert_point3_webhook_service_role.sql`.

*   **Puntos Pendientes para Retomar (Backlog de Seguridad)**:
    *   **Punto 4: Sanitización de IPC Handlers y Seguridad en Electron Desktop**:
        *   *Archivos involucrados:* [`main.cjs`](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/main.cjs), [`preload.cjs`](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/preload.cjs).
        *   *Objetivo:* Validar y sanitizar estrictamente todos los argumentos recibidos por los canales IPC (`obs:rename-video`, `obs:save-screenshot`, `save-file`, `save-pdf`, `run-oser-scraper`, `run-oser-writer-scraper`).
        *   *Medidas a implementar:*
            1. Prevenir *Path Traversal* asegurando que las rutas de destino de video y capturas se ubiquen dentro de carpetas permitidas (ej. `userData` o carpeta configurada por el usuario).
            2. Sanitizar caracteres especiales en nombres de médicos y pacientes antes de concatenar nombres de archivos en el sistema operativo.
            3. Desacoplar definitivamente las credenciales OSER de variables de entorno/código estático, exponiendo un modal de configuración de primer uso en `Settings.tsx` con almacenamiento seguro local en `safeStorage` (Windows DPAPI).
    *   **Punto 5: Endurecimiento de Control de Acceso por Roles (RBAC en Frontend)**:
        *   *Archivos involucrados:* [`App.tsx`](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/App.tsx), [`components/Sidebar.tsx`](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/components/Sidebar.tsx), [`pages/Billing.tsx`](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/pages/Billing.tsx), [`pages/Audit.tsx`](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/pages/Audit.tsx).
        *   *Objetivo:* Asegurar que las rutas sensibles (`/billing`, `/audit`, `/settings/email`, `/settings/users`) no solo estén protegidas a nivel de base de datos (RLS ya activo), sino que tampoco se rendericen ni permitan navegación manual en el router para roles operativos auxiliares (`Mucama`, `Residente`, `Proveedor`, `Tecnico`).
        *   *Medidas a implementar:*
            1. Envolver rutas en componentes `RoleProtectedRoute` que redirijan a `/unauthorized` o al dashboard principal si el rol no tiene privilegios.
            2. Ocultar del DOM los botones de exportación masiva de planillas contables para roles no administrativos.

### Módulos Clínicos y Administrativos Recientes

*   **Gestión de Guardias de Residentes (`ResidentShifts.tsx`)**:
    *   Habilitada la edición completa y eliminación de turnos de guardia asignados o pendientes para residentes con permiso `can_edit_shifts` y administradores.
    *   Se integraron acciones directas de edición en el panel `MyConsentsView`, el calendario mensual `ShiftsCalendarView` y el modal `LogShiftModal.tsx`.

*   **Filtros de Facturación y AOTER (`Billing.tsx`)**:
    *   **Filtro por Fecha Facturación**: Rango de fechas independiente mediante los estados `planillaBillingStartDate` y `planillaBillingEndDate` sobre el campo `fe_factur`.
    *   **Filtro por FE AOTER**: Rango de fechas independiente mediante los estados `planillaAoterStartDate` y `planillaAoterEndDate` sobre el campo `fe_aoter`, permitiendo auditar y conciliar entregas de documentación a la asociación traumatológica en tiempo real.
    *   **Plantilla de Documento Formal para Impresión (`#print-filtered-planilla`)**: Se implementó un portal de renderizado exclusivo `@media print` (`avoid-break`, hoja horizontal A4 landscape) que genera un reporte institucional membretado con logo ITEO, resumen de filtros aplicados, fecha de emisión, autor, desglose por paciente/profesional/cobertura y totales, evitando capturas de pantalla o distorsiones de interfaz.

*   **Exención Automática y Lógica de Cirugías Ambulatorias**:
    *   **Determinación de Modalidad Ambulatoria**: Una cirugía se evalúa como ambulatoria si cumple cualquiera de las condiciones: `isGuardia === true`, `surgery.is_ambulatory === true`, o si está agendada en un quirófano con `operating_room.is_ambulatory === true`.
    *   **Exención de Requisitos**: En `PatientSection.tsx` y `LogisticsSection.tsx` se omiten automáticamente las casillas de comprobación de Exámenes Pre-quirúrgicos, Firma de Consentimiento e Indicador de Cama/ART, reemplazándolos por divisores e insignias informativas de color violeta.
    *   **Persistencia en Supabase (`useSurgeryDetail.ts`)**: Al guardar una cirugía ambulatoria, el payload setea automáticamente `admission_validated: true`, `pre_op_exams: true` y `consent_signed: true`.
    *   **Solución a Error 400 en Edición de Quirófano (`useSettings.ts`)**: Se creó la columna `is_ambulatory` (boolean default false) en `quirofano.operating_rooms` y se desacopló la columna de clave primaria `id` del cuerpo del objeto `PATCH` al actualizar salas de quirófano, previniendo excepciones 400 Bad Request de PostgREST.

*   **Optimización de Carga y Consultas Concurrentes (`TecnicoPanel.tsx`)**:
    *   **Patrón `Promise.all` para Vistas Complejas**: En paneles que consolidan múltiples dominios de datos (usuarios, tarifas, guardias, cirugías, consentimientos, asistencias), se ejecutan las consultas independientes en paralelo en lugar de cascadas síncronas (`await` secuenciales), reduciendo el tiempo de respuesta inicial en más del 80%.
    *   **Unificación de Lecturas de Asistencia**: Los registros de `tecnico_attendance` del período seleccionado se solicitan una única vez y se reutilizan en memoria para el cómputo de horas mensuales, la verificación de ingresos para la regla del Turno Tarde y el listado de fichadas recientes de hoy.
    *   **Desacople de Servicios Externos**: Peticiones externas no clínicas (ej. determinación de IP pública mediante `api.ipify.org`) se ejecutan de forma asíncrona una sola vez al montar y no bloquean el ciclo de renderizado ni la carga de datos del quirófano.

### Protocolo de Pruebas Aisladas y Rollback Rápido (Volver Atrás)

Para cambios experimentales de arquitectura o UX que requieran validación previa antes de fusionarse a producción:
1. **Rama de Aislamiento Activa**: `feature/resilient-network-cache`
   * Módulo de monitoreo pasivo de red: `useNetworkStatus.ts`
   * Banner de alerta y reconexión: `NetworkStatusBanner.tsx`
   * Caché en memoria no bloqueante con TTL: `memoryCache.ts`
2. **Instrucciones para Descartar / Volver Atrás (Rollback 100%)**:
   Si se solicita revertir o descartar estos cambios, ejecutar:
   ```bash
   git checkout main
   git branch -D feature/resilient-network-cache
   ```
3. **Instrucciones para Aprobar y Fusionar a Producción**:
   Si los cambios son aprobados por el usuario:
   ```bash
   git checkout main
   git merge feature/resilient-network-cache
   ```


