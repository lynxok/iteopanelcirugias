# Historial de Versiones - Coordinación de Quirófano ITEO

Este documento registra los cambios de versiones documentados anteriormente en el archivo monolítico `KNOWLEDGE.md`.

## Versiones Recientes

*   **v3.10.74 [2026-07-31]**: Lanzada la versión **v3.10.74**. Implementado el filtrado de exclusividad para la **Oficina ART** en el `AdminDashboard.tsx` (restringiendo la vista únicamente a cirugías de aseguradoras ART) y añadida la casilla interactiva **"Paciente Notificado"** con registro de auditoría (`paciente_notificado`, `paciente_notificado_por`, `paciente_notificado_at`).
*   **v3.10.73 [2026-07-31]**: Lanzada la versión **v3.10.73**. Generada nueva compilación y publicado release en GitHub para solucionar problemas en el proceso de actualización e instalación de la v3.10.72.
*   **v3.10.71 [2026-07-30]**: Lanzada la versión **v3.10.71**. Incluidas prácticas ambulatorias (`is_guardia = true`) en la planilla de facturación (`Billing.tsx`) sin requerir estado `completed`. Verificado el permiso de modificación de cirugías para el rol `Administrativo de Guardias` sobre sus propias cirugías cargadas (`created_by_role`).
*   **v3.10.70 [2026-07-29]**: Lanzada la versión **v3.10.70**. Implementada la nueva sección "Gestión de Técnicos" (`TecnicoPanel.tsx`) para control de asistencia de fichadas, liquidación de cirugías y guardias. Se incluyeron múltiples mejoras sobre esta sección: soporte de IPs balanceadas separadas por comas, unificación lógica del Reloj e Historial de fichadas en base a `selectedTecnicoId` para supervisión de SuperAdmins, adición de reloj digital en vivo, y solución a bugs de mapeo de sesión y configuración (`has_tecnico_section_access` y `is_turno_tarde`) en `fetchUsers` y `AuthContext` para garantizar persistencia y acceso correcto.
*   **v3.10.69 [2026-07-27]**: Habilitada la edición condicional de cirugías para el rol `Administrativo de Guardias` mediante la columna `created_by_role` en la tabla `quirofano.surgeries`. Habilitado el campo de fecha de autorización para la cobertura "Particular" en el detalle de la cirugía.
*   **v3.10.64 [2026-07-23]**: Lanzada la versión **v3.10.64**. Congelación del título de la ventana de impresión a un espacio en blanco y prevención de cambios dinámicos del título para evitar cabeceras en el diálogo nativo de Windows.
*   **v3.10.63 [2026-07-22]**: Lanzada la versión **v3.10.63**. Corrección en la impresión de pulseras identificatorias térmicas (extracción de `@page` al nivel raíz de CSS para eliminar bordes, cabecera 'Consola de configuración' y pie 'sistema...', e incorporación de `landscape: true` en Electron). Ajuste en la Ficha Técnica de Cirugía (`SurgeryForm`): si el horario de Fin de Anestesia (`hfa`) es posterior a Fin de Cirugía (`hfc`), Fin de Cirugía adopta automáticamente el horario de anestesia.
*   **v3.10.62 [2026-07-22]**: Agregada la funcionalidad para tomar capturas de pantalla de la señal/escena activa en OBS Studio a través del botón "Tomar Foto". Funciona de forma remota e independiente de si la grabación está activa, en pausa o detenida. Las imágenes se guardan directamente en el directorio del médico/cirujano.
*   **v3.10.61 [2026-07-20]**: Solución del error crítico de precarga de chunks/módulos (`Importing a module script failed.`) mediante la implementación del cargador resiliente `lazyWithRetry` en `App.tsx` para recargar la aplicación automáticamente ante cambios de compilación en el servidor.
*   **v3.10.60 [2026-07-16]**: Traslado del puente de fondo `ObsBackgroundController` a la raíz de `App.tsx` (fuera del layout de autenticación). Permite que el control remoto de OBS funcione de forma inmediata al encender la PC, **incluso si la app está en la pantalla de Login sin iniciar sesión**.
*   **v3.10.59 [2026-07-16]**: Implementado soporte para **System Tray (Bandeja de Sistema)** y **Auto-Launch (Inicio con Windows)** configurables en `main.cjs`. Se agregó una consola de diagnóstico en tiempo real en la pestaña de ajustes `ObsConfigTab.tsx` que muestra los logs guardados en `localStorage`.
*   **v3.10.58 [2026-07-16]**: Solucionado fallo ocasional de renombrado de video (`EBUSY` / archivo bloqueado) al detener la grabación introduciendo una lógica de reintentos asíncronos con retardo (`delay = 500ms`, hasta 10 intentos) en `main.cjs` para dar tiempo a que OBS cierre el archivo.
*   **v3.10.57 [2026-07-16]**: Agregados los escuchas de eventos nativos de OBS (`ConnectionClosed` y `ConnectionError`) en `ObsBackgroundController.tsx` para detectar pérdidas del socket y auto-reconectar cada 5 segundos de forma silenciosa. Se añadió detección en caliente de cambios en `localStorage` (IP, puerto, clave, y sala) para reconectar el bridge en vivo sin necesidad de reiniciar la aplicación.
*   **v3.10.56 [2026-07-16]**: Reinstalación limpia forzada de la dependencia `electron-updater` para corregir corrupción de sintaxis JSON generada por conflictos de sincronización de OneDrive en `node_modules` local.
*   **v3.10.55 [2026-07-16]**: Corregido mapeo de estados de pausa y reanudación usando `outputState` de OBS WebSocket v5 (`OBS_WEBSOCKET_OUTPUT_PAUSED`), sincronizando además la duración de tiempo exacta mediante la llamada `GetRecordStatus` de OBS.
*   **v3.10.54 [2026-07-16]**: Corregido paso de datos de paciente y médico desde el cliente web de la tablet al enviar el comando de inicio de grabación.
*   **v3.10.53 [2026-07-15]**: Desacoplamiento de la grabación de la Ficha Técnica. El puente de control de OBS se reubicó en un componente global de fondo (`ObsBackgroundController.tsx`) y se configuró `backgroundThrottling: false` en la ventana principal de Electron para evitar la suspensión de latidos y sockets cuando la ventana se minimiza o pierde el foco.
*   **v3.10.39 [2026-07-14]**: Deshabilitada la verificación de firmas digitales (`verifyUpdateCodeSignature = false`) en `electron-updater` para permitir la instalación automática y exitosa de las actualizaciones no firmadas en Windows sin quedarse bloqueado al 100% de la descarga.
*   **v3.10.38 [2026-07-14]**: Corregido bug en sincronización OSER que reutilizaba el NUC de una cirugía finalizada anterior para el mismo paciente si la cirugía activa no tenía NUC registrado. También se forzó la visualización del nombre del paciente en mayúsculas dentro del modal de auditoría de sincronizaciones.
*   **v3.10.37 [2026-07-14]**: Corregido indicador de "Muestra Total" en la tarjeta de Casuística por Procedimiento para calcular dinámicamente la suma de eventos de las prácticas filtradas (locales/globales) en lugar de mostrar siempre la métrica global del período principal.
*   **v3.10.36 [2026-07-14]**: Implementada la normalización alfanumérica y extracción flexible de códigos de procedimientos en `ResultsDashboard.tsx` (Casuística e Inteligencia Predictiva) para unificar la acumulación de datos históricos tanto de formatos estándar `[Código] Descripción` como alternativos `Código: Descripción` (provenientes de OSER / Texto Libre).
*   **v3.10.35 [2026-07-13]**: Cifrado local de credenciales OSER mediante la API `safeStorage` de Electron con un esquema de fallback transparente para migrar automáticamente instalaciones activas sin interrupción de servicio.
*   **v3.10.34 [2026-07-13]**: Solucionado bug en `ResultsDashboard.tsx` que contaba erróneamente todas las cirugías sin hora de finalización (pendientes/programadas) como "Realizadas" debido a una evaluación invertida en `hasRealEndTime` (`!s.actual_end_time` en lugar de `!!s.actual_end_time`).
*   **v3.10.33 [2026-07-13]**: Corrección del subcomponente `OserButtonsSection` en `PatientSection.tsx` restaurando el bloque `return` del JSX para restablecer los botones de "Registrar Ingreso" e "Imprimir Compromiso" que no se mostraban.
*   **v3.10.32 [2026-07-10]**: Lanzamiento de la fase de recopilación y motor predictivo de ocupación de camas de internación. Integración de estadísticas Postgres de estancia por procedimiento, tab de Ajustes `BedStatsTab.tsx` para SuperAdmins con estado de recopilación de muestras y restricción preventiva de asignación de camas en `HospitalizationMap.tsx` si no se cuenta con al menos 10 casos válidos.
*   **v3.10.31 [2026-07-08]**: Optimización de Sincronizador OSER (se omiten del listado de discrepancias aquellas prácticas que no están en la App y cuyo estado en OSER es inactivo/no-autorizable como Rechazada/Anulada/No autorizada) e incorporación de motivos explícitos de discrepancia con etiquetas de colores e íconos en el encabezado de las tarjetas del modal de auditoría.
*   **v3.10.30 [2026-07-08]**: Monitor en Vivo (Colapso de Quirófanos Vacíos): se implementó el colapso visual automático en vista desktop para quirófanos sin cirugías en el día.
*   **v3.10.29 [2026-07-07]**: Resultados y Dashboard (Filtros por Tarjeta) independientes, limitación de visualización de alertas de ortopedias por proveedor y corrección en rutas de impresión de pulseras.
*   **v3.10.29 [2026-06-30]**: Autocompletado de camas basado en alta de internación cruzada y hora de inicio real en quirófano. Gestión de nivel de residencia (R1-R4), control de metas mensuales de guardias y registro interactivo de guardias para residentes con validación de descanso de 16 horas. Correcciones de system fields 404 y drag touch crash.
*   **v3.10.28 [2026-06-29]**: Unificación de lógica de conteo de cirugías finalizadas y desgloses interactivos clicables en el Dashboard.
*   **v3.10.27 [2026-06-29]**: Validación cruzada automática por alta de internación en el calendario.
*   **v3.10.26 [2026-06-29]**: Restricción de campos dinámica en ficha de cirugía basada en la tabla `public.system_fields` administrable visualmente por SuperAdmin.
*   **v3.10.25 [2026-06-29]**: Permiso `on_duty` en control de accesos de guardias semanales.
*   **v3.10.24 [2026-06-29]**: Visualización de cirugías sin quirófano asignado en la vista diaria mediante pestaña "Sin Quirófano".
*   **v3.10.23 [2026-06-29]**: Control de NUCs duplicados y validación en edición de cirugías activas.
*   **v3.10.22 [2026-06-29]**: Diagnóstico de permisos y corrección de sobrecarga en base de datos eliminando la variante antigua de la función `save_admin_setting` de 2 parámetros en PostgreSQL.
*   **v3.10.21 [2026-06-29]**: Solución a deformación de ancho de celdas en grid mensual (`MonthView`) aplicando `min-w-0` y corrección de bug de compilación de TypeScript en `WeekView` usando `getLocalStr(date)`.
*   **v3.10.12 [2026-06-24]**: Modo Visor para Enfermería y Médicos (campos deshabilitados).
*   **v3.10.11 [2026-06-23]**: Corrección de carga de recursos locales en impresión de pulsera cambiando `loadURL()` por `loadFile()` con hash SPA en Electron.
*   **v3.10.10 [2026-06-23]**: Rediseño de Centro de Ayuda (`Help.tsx`) y distinción cromática celeste/cian (`bg-cyan-500`) con icono parpadeante (`🚨`) para cirugías de guardia en calendario.
*   **v3.10.8 [2026-06-23]**: Creación automática de directorios en `open_oser.py` para la sesión si no existe.
*   **v3.10.4 [2026-06-22]**: Auditoría completa de sincronizaciones OSER (`public.sync_requests`), logs automáticos en `quirofano.audit_logs`, búsqueda avanzada de auditoría por NUC y renderizado de diffs visuales (`old` -> `new`).
*   **v3.9.5 [2026-06-18]**: Gestión avanzada de guardias semanales incluyendo Instrumentadores y Anestesistas generales con excepciones diarias en calendario.
*   **v3.9.4 [2026-06-18]**: Desactivación del búfer de Python para transmisión en tiempo real de IPC a Electron, y rutas relativas de logos de ITEO para evitar errores `net::ERR_FILE_NOT_FOUND`.
*   **v3.9.1 [2026-06-17]**: Acceso visual directo al portal OSER en dos fases (Playwright headless para login y Chromium visible para interacción del usuario).
*   **v3.8.43 a v3.8.40 [2026-06-11]**: Correcciones de impresión de pulseras térmicas (títulos vacíos, logos, márgenes tipo none y limitación de rango de hojas).
*   **v3.8.35 [2026-06-09]**: Auto-instalador de dependencias en caliente (Python, playwright, chromium) con pantalla bloqueante `DependencyCheckerOverlay.tsx`.

---

## Historial Antiguo (Ingresos Previos)

*   **v1.2.5 [2026-02-10]**: Notificación de actualizaciones integrada y validación de año máximo (2100).
*   **v1.2.4 a v1.2.0 [2026-02-10]**: Refinamientos de calendario responsive, menú lateral colapsable, correcciones de visualización en landscape móvil (alto menor a 550px) e interactores.
*   **v1.0.32 [2026-02-15]**: Unificación de reglas de Alertas en `AlertsHistory`.
*   **v1.0.31 [2026-02-15]**: Simulación de usuario en Centro de Alertas.
*   **v1.0.30 [2026-02-15]**: Optimización Mobile en Settings.
*   **v1.0.29 [2026-02-13]**: Campo "Médico Derivante" y módulo de "Análisis de Derivaciones".
