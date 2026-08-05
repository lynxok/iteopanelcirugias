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

### Publicación de Releases en GitHub
### Módulos Clínicos y Administrativos Recientes

*   **Gestión de Guardias de Residentes (`ResidentShifts.tsx`)**:
    *   Habilitada la edición completa y eliminación de turnos de guardia asignados o pendientes para residentes con permiso `can_edit_shifts` y administradores.
    *   Se integraron acciones directas de edición en el panel `MyConsentsView`, el calendario mensual `ShiftsCalendarView` y el modal `LogShiftModal.tsx`.

*   **Filtro por Fecha de Facturación (`Billing.tsx`)**:
    *   Implementado filtrado independiente por rango de **Fecha Facturación** (`fe_factur`) mediante los estados `planillaBillingStartDate` y `planillaBillingEndDate`.
    *   Convive dinámicamente con el filtro de fecha de práctica en las vistas de **Estadísticas** y **Planilla de Internaciones**.

*   **Exención Automática y Lógica de Cirugías Ambulatorias**:
    *   **Determinación de Modalidad Ambulatoria**: Una cirugía se evalúa como ambulatoria si cumple cualquiera de las condiciones: `isGuardia === true`, `surgery.is_ambulatory === true`, o si está agendada en un quirófano con `operating_room.is_ambulatory === true`.
    *   **Exención de Requisitos**: En `PatientSection.tsx` y `LogisticsSection.tsx` se omiten automáticamente las casillas de comprobación de Exámenes Pre-quirúrgicos, Firma de Consentimiento e Indicador de Cama/ART, reemplazándolos por divisores e insignias informativas de color violeta.
    *   **Persistencia en Supabase (`useSurgeryDetail.ts`)**: Al guardar una cirugía ambulatoria, el payload setea automáticamente `admission_validated: true`, `pre_op_exams: true` y `consent_signed: true`.
    *   **Solución a Error 400 en Edición de Quirófano (`useSettings.ts`)**: Se creó la columna `is_ambulatory` (boolean default false) en `quirofano.operating_rooms` y se desacopló la columna de clave primaria `id` del cuerpo del objeto `PATCH` al actualizar salas de quirófano, previniendo excepciones 400 Bad Request de PostgREST.

