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
    *   Imprime silenciosamente forzando `marginType: 'none'`, `printBackground: true`, `landscape: true` y limitación de hojas `pageRanges: [{ from: 0, to: 0 }]` (evita impresión accidental de carillas en blanco o rotadas).
    *   **Formato CSS y Supresión de Márgenes**: La regla `@page` debe situarse obligatoriamente en el nivel raíz del bloque CSS (fuera de `@media print`) especificando `size: 280mm 30mm landscape;` y `margin: 0 !important;`. Si se anida dentro de `@media print`, Chromium la ignora e imprime automáticamente cabeceras (`CONSOLA DE CONFIGURACION`) y pies de página (`sistema...`) del sistema operativo.
    *   Usa `printWindow.loadFile()` con la opción de hash SPA para evitar el error de seguridad `Not allowed to load local resource`.

### Servidor de Desarrollo y Paquetes
*   **Servidor Vite**: Iniciado con `npm run dev`.
*   **Gestor de Paquetes Exclusivo**: Se utiliza `npm` exclusivamente (`package-lock.json`). Evitar el uso de `pnpm` o `yarn` para no generar conflictos de dependencias en el espacio de trabajo.

### Integración con OBS Studio y Capturas de Pantalla
*   **Captura de Pantalla Instantánea**: Implementado el comando `TAKE_SCREENSHOT` vía canales Broadcast de Supabase Realtime. El controlador de fondo (`ObsBackgroundController.tsx`) consulta la escena activa a OBS WebSocket v5 (`GetProgramScene`) y solicita al proceso principal de Electron (`obs:get-screenshot-path` en `main.cjs`) la generación de un nombre sanitizado (`Captura_Paciente_Fecha.png`) y la creación del directorio del cirujano. La imagen se guarda mediante `SaveSourceScreenshot` de forma independiente a si hay o no una grabación de video en curso.
*   **Asistente de Solución de Problemas de Conexión**: En `ObsRecordingSection.tsx`, ante desconexiones de la PC de Quirófano (`sensors_off`), se ofrece la guía desplegable `¿Cómo solucionar?` que cubre los 5 puntos clave de verificación (App de escritorio activa, OBS Studio abierto, Quirófano asociado correcto, WebSocket habilitado en puerto `4455` y conectividad de red).
*   **Asignación de IP/Host en OBS WebSocket**: Para evitar que la IP cambie tras reiniciar la notebook por DHCP dinámico, cuando la aplicación corre en la misma notebook se debe configurar el Host/IP como `localhost` o `127.0.0.1`. Si se conecta desde otro dispositivo en la red local, se debe reservar la IP en el router por MAC address o asignar IP fija estática en la interfaz de red de Windows.

### Publicación de Releases en GitHub
*   **Gestión de Tokens en CLI (`gh`)**: Si el comando `gh release create` falla con error `HTTP 401` debido a una variable `GITHUB_TOKEN` ambiental obsoleta o placeholder, se debe limpiar la variable en la sesión de shell (`$env:GITHUB_TOKEN=""`) para forzar a GitHub CLI a utilizar las credenciales válidas persistidas en el llavero local del sistema (cuenta `lynxok`).

