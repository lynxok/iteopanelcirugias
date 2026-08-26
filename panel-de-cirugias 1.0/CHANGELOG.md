# CHANGELOG

## v3.10.108 (2026-08-26)
- **Dashboard de Resultados (Drill-Down de Cirugías Contempladas y Diferencia)**:
    * **Valores Interactivos de Volumen y Ocupación**: En [ResultsDashboard.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/pages/ResultsDashboard.tsx), los números de *Cirugías Realizadas* y *Cirugías Programadas* (en la tarjeta de Volumen Quirúrgico y en la tarjeta KPI superior) ahora son interactivos con cursor, efectos hover y clic directo.
    * **Modal de Desglose Completo**: Al hacer clic, se abre un modal con el listado detallado de todas las cirugías contempladas en el período seleccionado, organizadas en tres pestañas: *Todas las Programadas*, *Realizadas* y *Diferencia / No Concretadas*.
    * **Identificador de Diferencia (Planificadas vs Realizadas)**: Botón y pestaña específica `Δ no realizadas` que aísla de inmediato las cirugías que no se completaron, desglosando cuántas fueron canceladas/suspendidas (con su motivo) y cuántas quedaron programadas sin finalizar en agenda.
    * **Buscador en Tiempo Real y Exportación a Excel**: Incluye filtro instantáneo por paciente, médico o procedimiento, y un botón para exportar el listado analizado directamente a archivo `.xlsx`.
- **Seguridad y Robustez (RBAC e IPC)**:
    * **Protección de Rutas Frontend con RBAC**: Componente [RoleProtectedRoute.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/components/RoleProtectedRoute.tsx) que valida permisos en tiempo de ejecución para `/settings`, `/admin`, `/billing`, `/audit` y `/alerts-history` con caché en memoria.
    * **Sanitización de Handlers IPC en Electron**: Protección contra Path Traversal en `main.cjs` para logs y respaldos locales.

## v3.10.107 (2026-08-26)
- **Módulo de Auditoría (Enriquecimiento de Tarjetas y Búsqueda)**:
    * **Identificación Completa de Paciente y Práctica**: En [Audit.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/pages/Audit.tsx), cada tarjeta de auditoría ahora resuelve y muestra en lote una insignia visual destacada con el **Nombre completo del Paciente**, **DNI** y la **Práctica Quirúrgica** asociada al evento.
    * **Exportación CSV Extendida**: La exportación de reportes CSV incluye ahora las columnas explícitas `Paciente`, `DNI` y `Practica`.

## v3.10.106 (2026-08-25)
- **Soporte Anti-Caché y Actualización Automática en iPhone / Web / PWA**:
    * **Cabeceras Anti-Caché en HTML**: Incorporados meta tags `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache` y `Expires: 0` en [index.html](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/index.html), impidiendo que Safari / iOS mantenga versiones obsoletas al abrir la app desde la pantalla de inicio.
    * **Detector Automático de Versión Web**: En [UpdateNotification.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/components/UpdateNotification.tsx), se implementó un detector en segundo plano que consulta los hashes del servidor al iniciar, periódicamente (cada 5 min) y al reanudar la app (`visibilitychange`), mostrando un banner interactivo *"¡Nueva versión disponible! [Actualizar]"*.
    * **Botones de Recarga Limpia**: Añadido botón de refresco rápido (`refresh`) en la barra superior móvil de [App.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/App.tsx) y botón *"Recargar / Actualizar App"* en el modal de perfil de [Sidebar.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/components/Sidebar.tsx) que vacía cachés locales y recarga limpiamente.

## v3.10.105 (2026-08-25)
- **Navegación Móvil en Ajustes (Panel de Control)**:
    * **Patrón Maestro-Detalle Adaptativo**: En dispositivos móviles, la pantalla de Ajustes ahora muestra un menú limpio de categorías con indicadores (`chevron_right`). Al seleccionar cualquier opción (Usuarios, Médicos, Medicamentos, Formularios, etc.), se oculta el menú lateral y se muestra la sección a pantalla completa.
    * **Barra de Retorno Superior**: Agregada una barra superior en móvil con el botón **`← Menú de Ajustes`** y el nombre de la sección activa para regresar inmediatamente al listado de opciones sin perder el estado.
    * **Vista de Escritorio Intacta**: Se mantiene el diseño de dos columnas (menú lateral a la izquierda y panel de contenido a la derecha) en pantallas de escritorio.

## v3.10.104 (2026-08-24)
- **Guardias de Residentes y Control de Categorías**:
    * **Vigencia Histórica de Niveles de Residencia**: Los ascensos o cambios de categoría (ej: de R1 a R2 en agosto) ahora se calculan exclusivamente a partir del mes de vigencia seleccionado hacia adelante, conservando intactas las metas y cumplimientos de los meses anteriores.
    * **Cálculo Dinámico en Dashboard de Guardias**: En [ResidentShifts.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/pages/ResidentShifts.tsx), el reporte mensual aplica las metas de guardias (24hs y 12hs) correspondientes a la categoría que el residente tenía en el mes consultado.
    * **Selector de Vigencia e Historial en Configuración de Usuarios**: En [UserModal.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/components/settings/modals/UserModal.tsx), se incorporó el selector de mes de vigencia y la visualización interactiva del historial cronológico de hitos de categoría.

## v3.10.103 (2026-08-24)
- **Rendimiento y Menú Lateral**:
    - **Ocultamiento de Centro de Alertas**: Removida la sección y botón de "Centro de Alertas" del menú lateral principal para optimizar la interfaz y evitar elementos en desuso.
    - **Optimización de Consultas en Red y Base de Datos**: Desactivado el polling cíclico (`fetchAlertCount` cada 60s) en el componente `Sidebar`, reduciendo significativamente la carga de consultas sobre `system_alerts` en Supabase y mejorando la fluidez del cliente.

## v3.10.102 (2026-08-20)
- **Módulo Facturación (Filtros e Impresión Formal)**:
    - **Filtro por Fecha AOTER (FE AOTER)**: Incorporado el selector de rango de fechas *Desde* y *Hasta* para filtrar sobre `fe_aoter` en la pestaña Planilla de [Billing.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/pages/Billing.tsx), con soporte reactivo y combinable con fechas de práctica y facturación.
    - **Impresión de Planilla Filtrada como Documento**: Agregado el botón *"Imprimir Listado"* en la barra de herramientas de la planilla, generando una plantilla formal con membrete institucional, resumen de filtros aplicados, fecha de emisión, totales tabulados y optimización para impresión A4/PDF (`@media print`).

## v3.10.101 (2026-08-20)
- **Panel de Técnicos (Responsividad Móvil y Web)**:
    - **Eliminación de Doble Scrollbar**: Eliminado el `overflow-y-auto` y `min-h-screen` anidado en el contenedor de `TecnicoPanel.tsx`, permitiendo un scroll natural y sin cortes a través del contenedor principal de la aplicación.
    - **Aislamiento Horizontal de Tablas**: Agregado `overflow-x-auto` con ancho mínimo controlado (`min-w-[950px]`) para que las tablas de cirugías no ensanchen ni distorsionen la vista en pantallas móviles.
    - **Tarjeta de Cierre y Liquidación Total Totalmente Adaptable**: La tarjeta inferior ahora adapta sus columnas, badges y botones al 100% en pantallas móviles y desktop sin cortar texto ni salirse del viewport.

## v3.10.100 (2026-08-20)
- **Panel de Técnicos (Rediseño de Cierre Mensual)**:
    - **Rediseño Integral de la Tarjeta de Liquidación**: Rediseñada la tarjeta inferior con estructura espaciosa en dos columnas, badge de estado, pills con el desglose parcial de cirugías, guardias y horas de asistencia, y caja destacada de Total a Liquidar.

## v3.10.99 (2026-08-20)
- **Panel de Técnicos (Diseño y Liquidación)**:
    - **Formato Monetario Argentino**: Formateo estricto a 2 decimales (`es-AR`) para el Monto Total a Liquidar y todos los subtotales, eliminando centavos fraccionarios con múltiples dígitos.
    - **Diseño del Panel de Consentimiento**: Corregido el padding superior (`pt-7`) y el espaciado del banner inferior de Liquidación Total para evitar solapamientos con la barra superior de acento. Expandido el padding inferior de la vista a `pb-36`.

## v3.10.98 (2026-08-20)
- **Liquidación de Técnicos e Instrumentadores**:
    - **Corrección de Fórmula al 50%**: Corregido el cálculo de honorarios de cirugías para turnos tarde y coparticipadas, dividiendo de forma directa el Monto QX Total (Tarifa Nomenclador + Tarifa Tiempo QX) al 50% (`totalQx / 2`) y eliminando la división previa duplicada sobre la duración.

## v3.10.97 (2026-08-20)
- **Planificación y Flujo Quirúrgico**:
    - **Filtro de Cirugías Canceladas**: Se excluyen explícitamente las cirugías canceladas (`status: 'cancelled'`) de los bloques de planificación activa (`authorizedPatients`, `readyToSchedule`, `unscheduledNew`, `materialBlockers`, `clinicalBlockers`, `otherBlockers`), evitando que figuren en "OSER sin aprobar material" o secciones de agendado pendiente.
    - **Detalle de Cirugía**: El badge superior de "Estado y Registro" ahora indica "Cancelada" en rojo claro cuando la cirugía ha sido cancelada definitivamente.

## v3.10.94 (2026-08-18)
- **Gestión de Técnicos (Tarifas y Liquidación)**:
    - **Edición Rápida en Liquidación de Cirugías**: Habilitado el modal interactivo de carga y edición directa de tarifas de práctica desde la tabla de liquidación para usuarios con rol `SuperAdmin`, `Direccion` y `Administrativo Direccion`.
    - **Trazabilidad y Auditoría de Tarifas**: Incorporado en la pestaña *Tarifas y Ajustes* el indicador en tiempo real de la última fecha/hora de edición y el usuario autor para todos los campos globales (hora, guardia, IP WiFi, correo de cierre) y para cada práctica del nomenclador, persistiendo `updated_at`, `updated_by` y `updated_by_name` en la base de datos.
    - **Experiencia de Usuario**: El botón "Cargar Precio" / "Editar" ahora abre directamente la ventana emergente con foco automático para guardar y recalcular inmediatamente los honorarios.

## v3.10.93 (2026-08-13)
- **Cirugías Ambulatorias**:
    - **Validación de Prequirúrgicos**: Se confirma y mantiene la regla de flexibilización por la cual las cirugías ambulatorias o agendadas en quirófano ambulatorio no requieren la fecha de prequirúrgicos para su carga y aprobación clínica.

## v3.10.92 (2026-08-10)
- **Gestión de Técnicos**:
    - **Validación de Ficha Técnica**: Incorporado el rastreo explícito de la instrumentadora en `surgery_forms.instrumentadora`, imputando las cirugías a su planilla mensual e indicando advertencias en ámbar cuando no pertenece al turno tarde ni a la guardia.
    - **Reglas Horarias de Guardia y Turnos**: Ajustadas las franjas horarias de días hábiles. Las cirugías iniciadas antes de las 06:00 AM o después de las 19:00 HS se asignan a la guardia nocturna. El turno mañana (06:00 a 15:00 hs) no imputa automáticamente a guardia.
    - **Catálogo de Nomenclador y Tarifas**: Pre-cargado el listado completo del nomenclador OSER/AOTER en la pestaña *Tarifas y Ajustes*, con estado `Sin Precio ($0)`, contador de casos realizados, buscador en tiempo real y selector de ordenamiento (Más frecuentes primero, menos frecuentes, código o tarifa).

## v3.10.87 (2026-08-04)
- **Control de Grabación OBS Studio**:
    - **Solución de error en Captura de Imagen**: Corregido el fallo `"Your request type is not valid"` al intentar tomar capturas de pantalla desde el panel de control remoto de OBS.
    - **Compatibilidad con Protocolo OBS WebSocket v5**: Se actualizaron las solicitudes en `ObsBackgroundController.tsx` reemplazando llamadas obsoletas por `GetCurrentProgramScene` y `GetSourceScreenshot`.
    - **Guardado Nativo**: Implementado el manejador IPC `obs:save-screenshot` en `main.cjs` para escribir la captura Base64 comprimida directamente en el disco duro local dentro de la carpeta asignada al cirujano.

## v3.10.31 (2026-07-08)
- **Sincronización OSER**:
    - **Ignorado de Historial**: Se omiten del listado de discrepancias aquellas prácticas de OSER que no existen en la App y cuyo estado es inactivo/no-autorizable (ej. "Rechazada", "Anulada", "No autorizada").
    - **Visualización de Motivos**: Se agregaron badges coloreados con íconos en el encabezado de cada tarjeta de cirugía en el modal de auditoría, indicando de forma explícita las razones (Cambio de fecha, Nueva práctica, Cambio de estado, Sin avances, Cerrada, Anulada) por las que se muestra en el listado.

## v3.10.30 (2026-07-08)
- **Monitor en Vivo (Colapso de Quirófanos Vacíos)**:
    - Se implementó el colapso visual automático en vista desktop para quirófanos sin cirugías en el día (sin cirugías finalizadas, en curso ni siguientes).
    - Los quirófanos colapsados se muestran como columnas delgadas con texto en vertical. Al hacer clic se expanden de forma manual.
    - Se agregó un botón de colapso manual (`chevron_left`) en el encabezado de los quirófanos vacíos que han sido expandidos.
    - Distribución dinámica mediante CSS Flexbox (`flex-grow`), adaptándose automáticamente al espacio disponible en pantalla.

## v3.10.29 (2026-07-07)
- **Resultados y Dashboard (Filtros por Tarjeta)**:
    - Se agregaron controles de filtro independientes para las tarjetas de Volumen, Motivos de Suspensión, Operaciones por Cirujano, Inteligencia Predictiva y Casuística.
    - Soporte para selección de periodos predefinidos (Esta Semana, Este Mes, Este Trimestre, Este Año) y Rango Personalizado.
- **Historial de Alertas (Ortopedias)**:
    - Se limitó el filtrado de alertas para el rol `Ortopedia` de modo que solo vean las correspondientes a su proveedor (`vendorId`), a menos que tengan el permiso `can_view_all_vendors`.
- **Proceso Principal de Electron (main.cjs)**:
    - Puerto de desarrollo modificado a `3005`.
    - Corrección en la impresión de pulseras en producción, utilizando `loadFile` con hash en lugar de `loadURL` con protocolo de archivo, evitando fallas de enrutamiento interno.

## v3.10.25 (2026-06-29)
- **Control de Accesos para Configuración de Guardias**:
    - **Permiso en Configuración**: Se agregó "Guardias (Calendario)" (`on_duty`) como un módulo configurable en la tabla de control de accesos (Permisos por Rol).
    - **Visibilidad Dinámica**: Se reemplazó la restricción fija al rol `SuperAdmin` en el calendario, permitiendo ahora que cualquier rol habilitado con el permiso `on_duty` pueda ver la columna lateral, el botón para configurar médicos de guardia semanal, y los indicadores diarios de guardia en el calendario mensual.

## v3.10.24 (2026-06-29)
- **Visualización de Cirugías sin Quirófano**:
    - **Nueva pestaña en Vista Diaria**: Se agregó la pestaña "Sin Quirófano" en la barra de selección de quirófanos de la vista diaria.
    - **Soporte de Filtro**: Permite visualizar y reordenar todas las cirugías que tienen fecha y hora agendada pero no cuentan con un quirófano asignado (`operating_room_id: null`), evitando que queden invisibles en la agenda diaria.

## v3.10.23 (2026-06-29)
- **Control de NUCs Duplicados**:
    - **Validación en Edición y Creación**: Se extendió la regla de validación de número de NUC para que se aplique tanto al crear una cirugía como al editar una existente.
    - **Filtrado de Historial**: El sistema ahora solo busca y bloquea si el NUC duplicado corresponde a otra cirugía **activa** (excluyendo la misma que se está editando y cirugías con estado *Completada*, *Cancelada* o *Suspendida*), permitiendo así que un paciente tenga múltiples cirugías a lo largo del tiempo pero no de forma simultánea en estado activo.

## v3.10.21 (2026-06-29)
- **Correcciones en el Calendario**:
    - **Alineación de Grilla**: Se agregó `min-w-0` a las celdas del calendario y los eventos para evitar la deformación de las columnas del grid (como el Sábado 27) provocada por contenidos con textos e íconos largos.
    - **TypeScript**: Se corrigió un error de variable no definida (`dateStr`) en la vista semanal.

## v3.10.16 (2026-06-24)
- **Corrección en Simulación de Residentes**:
    - **Visualización de Camas**: Al simular a un médico residente (especialidad "Residencia" o "Residente") desde una cuenta administradora, ahora se muestra correctamente la lista completa de pacientes en cama, en lugar de filtrar por el ID del médico.

## v3.10.15 (2026-06-24)
- **Indicaciones S.O.S y Observaciones en Medicación**:
    - **Esquema de Medicación**: Se agregó un checkbox `¿Es S.O.S (si es necesario)?` y un campo de `Observaciones` al programar un esquema de medicamentos.
    - **Guardado y Visualización**: Estos campos se guardan en la base de datos y se muestran con badges de color y recuadros de texto formateado en el panel.

## v3.10.14 (2026-06-24)
- **Filtro de "Mis Pacientes" por especialidad y rol**:
    - **Clínicos y Residentes**: Los usuarios con especialidad "Clínico" o rol "Residente" ahora visualizan a **todos** los pacientes internados (en cama) en el listado "Mis Pacientes" de su panel.
    - **Médicos de otras especialidades**: Siguen visualizando únicamente a los pacientes que ellos mismos han operado.

## v3.10.13 (2026-06-24)
- **Impresión de Firmas y Acceso a Ficha**:
    - **Firma de Cirujano Oculta en Impresión**: Al imprimir la ficha quirúrgica, se oculta el recuadro de la firma del médico cirujano y se centra el bloque del anestesista de forma automática.
    - **Acceso a Ficha de Cirugía**: Se habilitó la vista de la ficha para médicos, residentes, dirección y enfermería desde el resumen del calendario y desde la vista de detalle.
    - **Restricción de Solo Lectura**: Se garantiza que la ficha sea de solo lectura para todos los roles, exceptuando a los Técnicos y Superadmins.
    - **Polyfill de Buffer**: Se solucionó el error `Buffer is not defined` en navegadores inyectando un polyfill al inicio del index para `@react-pdf/renderer`.

## v3.10.12 (2026-06-24)
- **Modo Visor para Enfermería y Médicos**:
    - Se implementó un control de acceso estricto en la ficha de cirugía (`SurgeryDetail`).
    - Los usuarios con rol de **Enfermería** y **Médico** ahora visualizan la ficha exclusivamente en modo de solo lectura (visor), impidiendo cualquier edición de campos, subida/eliminación de documentos o confirmación de cambios.

## v3.10.8 (2026-06-23)
- **Corrección en Script de Apertura OSER (open_oser.py)**:
    - **Creación Automática de Directorios**: Se agregó la creación automática del directorio de sesión (`base_dir`) si no existe en la máquina cliente. Esto soluciona el error `Errno 2: No such file or directory` al intentar guardar el estado de sesión (`oser_session_state.json`) en computadoras que no tengan previamente creada la carpeta `ITEO_Oser_Sync` en `AppData\Local`.

## v3.10.7 (2026-06-23)
- **Corrección en Sincronización OSER**:
    - **Prioridad de Búsqueda de Pendientes**: Se reordenó la secuencia de búsqueda de contingencia (fallback) del scraper de OSER. Ahora, si una internación no se encuentra en estado "Abiertas", se busca primero en el estado "Pendientes" antes de buscar en "Cerradas". Esto evita que internaciones activas en estado pendiente (por ejemplo, con ingreso no registrado aún) sean detectadas erróneamente como "Cerradas".

## v3.10.3 (2026-06-22)
- **Gestión de Guardias de Residentes**:
    - **Carga Continua**: Ahora la asignación y eliminación de guardias de residentes se realiza localmente dentro del modal sin provocar cierres inesperados ni refrescar la pantalla completa tras cada acción.
    - **Refresco al Cerrar**: La pantalla del calendario mensual se actualiza de forma automática recién cuando se cierra el modal de asignación de guardias.

## v3.9.5 (2026-06-18)
- **Gestión Avanzada de Guardias (Instrumentadores y Anestesistas)**:
    - **Nuevos Perfiles Habilitados**: Ahora es posible designar si un **Técnico (Instrumentador)** o un **Anestesista** realiza guardias desde su panel de configuración de usuario/médico.
    - **Panel de Configuración en Calendario**: Se habilitaron menús desplegables dedicados para "Instrumentador General" y "Anestesista General" en el panel lateral de "Guardia de la Semana".
    - **Excepciones por Día**: Al igual que con los cirujanos, se pueden configurar sobreescrituras diarias individuales para instrumentadores y anestesistas.
    - **Visualización Integral**: Las vistas mensual y semanal del calendario muestran ahora las tres figuras de guardia (Médico en rosa, Instrumentador en verde y Anestesista en morado) para una rápida identificación de la cobertura del equipo quirúrgico.

## v3.9.4 (2026-06-18)
- **Correcciones en App de Escritorio (Electron) e Integración con OSER**:
    - **Solución al Bloqueo del Botón "Ver OSER"**: Se desactivó el búfer de salida de Python agregando la variable de entorno `PYTHONUNBUFFERED: '1'` al iniciar los procesos y forzando el vaciado de flujo (flush) en los prints de `open_oser.py`. Ahora, el botón "Ver OSER" se vuelve a habilitar de forma instantánea al abrir la ventana del portal OSER.
    - **Corrección en Rutas de Logos en Electron**: Se cambiaron las rutas de imágenes con barra inclinada inicial (`/logo-iteo-azul.png` y `/logo-iteo.png`) por rutas relativas en `App.tsx`, `Login.tsx`, `SurgeryForm.tsx` y `SurgeryPDF.tsx`, solucionando el error `net::ERR_FILE_NOT_FOUND` al cargar los logos bajo el protocolo local `file://` en la aplicación de escritorio.

## v3.9.3 (2026-06-17)
- **Correcciones en Facturación e Impresión**:
    - **Solución a Bloqueo de Impresión**: Se reemplazaron llamadas directas de `window.print()` por el puente de impresión IPC de Electron (`ready-to-print`), evitando que la app se tilde al imprimir en computadoras cliente.
    - **Filtro de Fecha Robustecido**: Se ajustó la comparación del rango de fechas de ingreso en la planilla de internaciones para comparar únicamente strings en formato `YYYY-MM-DD`, resolviendo discrepancias horarias y de zona horaria.
    - **Estructura del Componente**: Corregido error de sintaxis y falta de declaración del componente `Billing` que impedía la compilación de producción.

## v3.8.44 (2026-06-12)
- **Actualización de Compilación y Distribución**:
    - Se incrementó la versión a v3.8.44 en la configuración del proyecto.
    - Se generó un nuevo paquete de distribución web (`dist/`) optimizado para producción.
    - Se compiló e implementó la release ejecutable para escritorio de Windows (`release/PanelCirugias_ITEO_Setup.exe`).

## v3.8.43 (2026-06-11)
- **Corrección de Imagen de Logo en Pulseras**:
    - Se corrigió la ruta de la imagen en `PatientPrintLabel.tsx` reemplazando el nombre de archivo con espacios (`/logo iteo azul.png`) por la ruta real con guiones (`/logo-iteo-azul.png`), solucionando el error de carga del logo que causaba que se imprimiera el texto alternativo "Logo ITEO" en la pulsera.

## v3.8.42 (2026-06-11)
- **Corrección de Cabeceras/Pies de página en Impresión de Pulseras**:
    - **Ocultación Completa de Textos del OS (como "Consola de configuración" o "sistema...")**: Se implementó una doble protección agregando la propiedad heredada `marginsType: 1` a las opciones de impresión silenciosa y manual en Electron, en combinación con el formato moderno `margins: { marginType: 'none' }`.
    - **Control del Título del Documento**: Se fuerza dinámicamente `document.title = " "` en el renderizado de la pulsera (`PatientPrintLabel.tsx`). Esto asegura que, incluso si el driver de la impresora fuerza la impresión de cabeceras, el título esté vacío y no ensucie la cinta.
    - **Logs de Diagnóstico de Impresión**: Se agregaron registros de consola en el proceso principal de Electron que muestran el título y la URL exacta del remitente al recibir el evento de impresión (`ready-to-print`), facilitando futuras auditorías.

## v3.8.41 (2026-06-11)
- **Limitación de Páginas por Defecto**:
    - Se configuró la opción `pageRanges: [{ from: 0, to: 0 }]` en la llamada de impresión de Electron.
    - Esto hace que el cuadro de diálogo de Windows preseleccione de forma predeterminada imprimir solo la primera página (Página 1), evitando impresiones accidentales de páginas en blanco.

## v3.8.40 (2026-06-11)
- **Configuración de Impresora de Pulseras Térmicas**:
    - **Pestaña de Selección de Impresora**: Se añadió una nueva pestaña llamada "Impresoras" en la sección de Configuración (visible únicamente en la versión Desktop/Electron) que lee las impresoras instaladas en el sistema.
    - **Impresión Silenciosa Directa**: Al elegir una impresora de la lista, la aplicación enviará el trabajo de impresión en segundo plano directamente a ese dispositivo sin abrir cuadros de diálogo intermedios.
    - **Optimización de Formato y Remoción de Basura**: Se fuerza el modo sin márgenes (`marginType: 'none'`), lo que desactiva de raíz la impresión de cabeceras y pies de página (como "Consola de configuración" o la URL del archivo local) que distorsionaban el formato de la pulsera.
    - **Modo Manual**: Si no se selecciona ninguna impresora preferida, se utiliza el diálogo clásico de Windows como respaldo.

## v3.8.34 (2026-06-08)
- **Gestión de Matrículas para Médicos y Residentes**:
    - **Registro de Matrícula**: Se añadió el campo "Número de Matrícula" en el formulario de creación y edición de usuarios, disponible exclusivamente para los roles de **Médico** y **Residente**.
    - **Base de Datos**: Se incorporó el campo `license_number` a la tabla de usuarios en la base de datos de Supabase.
    - **Visualización**: Se muestra el indicador `M.N. [matrícula]` debajo del correo electrónico de los usuarios en la vista de lista (tanto para escritorio como para móviles).

## v3.8.24 (2026-06-04)
- **Sincronización de Anulaciones OSER**:
    - **Diferenciación de Cirugías Anuladas**: El sincronizador ahora detecta si una cirugía cerrada en OSER fue debido a una anulación. Al sincronizar, actualiza el estado local a "CANCELADA" (`status = 'cancelled'`) y el de OSER a "ANULADA", en lugar de marcarse erróneamente como "REALIZADA / COMPLETADA".
    - **Mejoras Visuales**: Añadidos badges (`ANULADA EN OSER` en rojo con icono de cancelación) y banners de advertencia específicos en el modal de discrepancias.

## v3.8.18 (2026-06-01)
- **Optimización de Sincronización/Auditoría OSER**:
    - **Precisión de Fecha Programada**: Ahora el extractor de datos lee la fecha programada directamente desde la tabla `#floatIzquierda > table > tbody` del portal OSER, garantizando exactitud tanto en la sincronización normal como en el módulo de auditoría de cirugías pasadas.
    - **Respaldo Robusto**: Se mantiene un sistema de fallback basado en expresiones regulares para evitar fallos si el DOM del portal sufre variaciones.

## v2.3.8 (2026-04-24)
- **Corrección de Sincronización Quirúrgica**:
    - **Calendario**: Se implementó un filtrado robusto para ocultar cirugías canceladas (Baja Definitiva) de la agenda principal y del sidebar, eliminando las cirugías "fantasmas".
    - **Gestión de Suspensiones**: Se habilitó para el rol de **Internación** la capacidad de realizar suspensiones y bajas definitivas directamente desde el listado general, unificando permisos con la ficha de detalle.
    - **Consistencia Visual**: Se agregó la opción de "Baja Definitiva" en todos los módulos de suspensión para asegurar que las cirugías que no se operarán sean removidas de la planificación activa.


## v1.1.20 (2026-02-09)
- **Correcciones para Tablet y Drag & Drop**:
    - **Optimización de Monitor**: Se ajustó el diseño para mejorar la visibilidad en tablets en orientación horizontal (landscape), incluyendo scroll funcional y reducción de rellenos innecesarios.
    - **Soporte Táctil en Calendario**: Se implementó un polyfill de toque para habilitar la funcionalidad de arrastrar y soltar (Drag & Drop) nativa en dispositivos móviles y tablets.
    - **Robustez de Datos**: Se mejoró la gestión de datos en el Monitor para manejar correctamente casos donde los pacientes o médicos son devueltos como arreglos por la base de datos.

## v1.1.19 (2026-02-09)
- **Horarios de Inicio de Quirófano Configurables**:
    - Ahora es posible configurar una hora de inicio personalizada para cada quirófano desde la sección de Ajustes.
    - El calendario utiliza automáticamente esta hora para la primera cirugía del día y para recalcular los horarios al reordenar cirugías, permitiendo una gestión más flexible de la jornada quirúrgica.

## v1.1.18 (2026-02-06)
- **Buscador en Modal de Agendamiento**:
    - Se incorporó una barra de búsqueda en el modal "Agendar / Reprogramar" del calendario. Ahora es posible filtrar rápidamente las cirugías disponibles por nombre del paciente, procedimiento o médico, agilizando el proceso de asignación de turnos.

## v1.1.17 (2026-02-06)
- **Mejora Visual de Estados**:
    - Se agregó un indicador de **"FECHA RESERVADA"** para cirugías que tienen fecha pero cuya validación aún está pendiente. Esto permite identificar rápidamente casos como el de Germano Lia Beatríz, que ya tienen un lugar en el calendario pero requieren atención administrativa.

## v1.1.16 (2026-02-05)
- **Correcciones de Errores y Logs**:
    - **Solución a Subida de Archivos**: Se corrigió un error en la base de datos que impedía subir documentos ("Key is not present in table users"). Ahora se vinculan correctamente con el usuario actual.
    - **Mejora en Logs**: Se optimizó el registro de errores para que, en caso de fallo, muestre el mensaje real del error en lugar de "object Object", facilitando el diagnóstico futuro.

## v1.1.15 (2026-02-04)
- **Correcciones de Base de Datos**:
    - Se actualizó la restricción de seguridad (`constraint`) en la base de datos que impedía guardar cirugías con el nuevo estado "A la espera de fecha" (`waiting_date`).

## v1.1.14 (2026-02-04)
- **Correcciones**:
    - Se eliminó el mensaje de error `null` en los logs de auditoría al agendar desde el calendario.
    - Se quitó el bloqueo de fecha de autorización también en la vista de Calendario (para ser consistente con el Detalle).

## v1.1.13 (2026-02-04)
- **Alertas y Flexibilidad**:
    - Se eliminó el bloqueo para agendar cirugías sin fecha de autorización.
    - Nueva **Alerta Crítica URGENTE** a 3 días del evento si falta la autorización.
    - Registro automático de responsabilidad ("En gestión por") al consultar detalles de una alerta.

## v1.1.12 (2026-02-04)
- **Corrección de Discrepancias Visuales**:
    - Implementada "Promoción Visual" en Dashboard, Listado y Monitores. Esto asegura que pacientes con validaciones completas se vean como "Programadas" o "A la espera de fecha" incluso si su estado en la base de datos es antiguo.
    - Sincronización del buffer de 10 minutos en el Monitor público.

## v1.1.11 (2026-02-04)
- **Refinamiento de lógica de estados**:
    - Implementado estado `waiting_date` (A la espera de fecha).
    - Flexibilización de validación de Internación (ya no requiere fecha).
    - Auto-validación para rol Técnico al asignar fecha de cirugía.
    - Reseteo automático de validación de Quirófano en reprogramaciones y suspensiones.

## v1.1.10 (2026-02-04)
- **Correcciones de Auto-Finalización**: 
    - Se redujo el tiempo de espera (buffer) de 45 a **10 minutos** en todo el sistema.
    - Se restauró la funcionalidad de auto-finalización en el Listado General añadiendo los campos faltantes en la consulta de datos (`estimated_duration`).

## v1.1.9 (2026-02-04)
- **UI**: El campo "¿Lleva Prótesis?" ahora es visible siempre, incluso al crear una nueva solicitud de cirugía.

## v1.1.8 (2026-02-04)
- **Refinamiento de Prótesis**: Se eliminó el tildado automático del checkbox "¿Lleva Prótesis?" al seleccionar la obra social.
- **Validación de Consistencia**: Se agregó un aviso (modal) al guardar si se marcó que lleva prótesis pero no se han cargado materiales, para prevenir errores de carga.

## v1.1.7 (2026-02-04)
- **Validación de Ortopedia**: Se flexibilizó la lógica de validación; ahora solo es obligatoria si hay materiales cargados en la lista (marcar "¿Lleva Prótesis?" sin materiales ya no bloquea la programación).
- **UI**: Se movió la pregunta de "¿Lleva Prótesis?" a la izquierda, junto al título de la sección de materiales, para mejorar la visibilidad y el flujo de carga.

## v1.1.6 (2026-02-04)
- **Resultados (Drill-down)**: Implementada la funcionalidad de desglose de cirugías por médico. Al hacer clic en una fila de la tabla de profesionales, se abre un modal con el detalle de las cirugías contabilizadas (Fecha, Paciente, Procedimiento y Estado).

## v1.1.5 (2026-02-04)
- **Resultados**: Corregido error en los gráficos y tablas de la sección de Resultados. Las estadísticas de cirugías completadas por quirófano y por médico ahora se muestran correctamente al alinearse con los estados de la base de datos.

## v1.1.4 (2026-02-04)
- **Seguridad**: Corregidas políticas de RLS para `audit_logs` y `system_errors`. Las auditorías ahora se registran correctamente aun sin Supabase Auth.

## v1.1.3 (2026-02-04)
- **UI**: Se ocultó el ID de cirugía y el DNI debajo del nombre de los pacientes en el Dashboard y SurgeryList.
- **Correcciones de Visualización**:
    - Se unificó la lógica de "Auto-Inicio Visual" para incluir cirugías en estado de validación pendiente que ya cuentan con horario asignado.
    - Esto asegura que las cirugías que han comenzado en la práctica se reflejen correctamente como "En Curso" en el Dashboard y Monitor.

## v1.1.1 (2026-02-04)
- **Correcciones para Internación y Emergencias**:
    - Se corrigió la detección de "Nueva Cirugía" para el perfil de Internación (ruta `/#/nueva-cirugia`).
    - Se eliminó la obligación de completar fecha, hora y duración para el perfil de Internación, delegando la programación al Técnico.
    - Se flexibilizó la validación de fecha de autorización para cirugías con prioridad **Emergencia**.

## v1.1.0 (2026-02-04)
- **Seguridad y Permisos**:
    - Se solucionó el error de "permiso denegado" al cargar documentación. Se aplicaron permisos (GRANTS) correctos en el esquema `quirofano`.
- **Reglas de Negocio**:
    - **Restricción de Autorización**: Se implementó una validación que impide pasar una cirugía a estado "Programada" si no cuenta con fecha de autorización.
    - **Validación Temporal**: El sistema ahora bloquea el agendamiento si la fecha de la cirugía es anterior a la fecha de autorización.
    - **Consistencia en Calendario**: Las mismas validaciones se aplican al arrastrar cirugías (Drag & Drop) en la agenda.
- **Robustez del Sistema**:
    - **Auditoría Resiliente**: Se modificó el registro de auditoría para que sea no bloqueante, evitando que errores menores en los logs detengan la operativa principal.
    - **Silent Error Logging**: Se implementó un sistema de captura de errores silenciosos con un visor exclusivo para SuperAdmins (`/error-logs`).


## v1.0.10 (2026-02-03)
- **Mejoras Visuales**:
    - **Indicadores de Estado**: Se rediseñaron las etiquetas de estado en el Dashboard y Ortopedia. Ahora usan un estilo "pill" moderno con colores suaves, bordes sutiles y puntos indicadores (dots) para mejorar la legibilidad y estética.
    - **Animaciones**: Agregado efecto pulsante en estados activos.

## v1.0.9 (2026-02-03)
- **Corrección Crítica**:
    - **Persistencia de Estados**: Se solucionó un error que impedía guardar el estado "Completado" o "En Progreso" en las cirugías, lo que causaba que volvieran a su estado anterior al refrescar. El error se debía a un intento de actualizar un campo de fecha (`end_time`) no válido.

## v1.0.8 (2026-02-03)
- **Mejoras**:
    - **iOS**: Se agregó el icono de inicio para iPhone/iPad (Apple Touch Icon). Ahora al "Agregar a pantalla de inicio", se verá el logo de ITEO (la cruz).
    - **Monitor**: Se ajustó el Monitor para que funcione como una pantalla independiente (sin menú lateral) para evitar errores visuales en el botón de colapsar.

## v1.0.7 (2026-02-03)
- **Mejoras**:
    - **Monitor de Quirófano**: Se optimizó la visualización para que, cuando solo hay un quirófano activo, este ocupe el ancho completo de la pantalla, aprovechando mejor el espacio.

## v1.0.6 (2026-02-03)
- **Correcciones**:
    - Se arregló la lógica del **Calendario** para que las cirugías de días anteriores que quedaron como "Programadas" pasen automáticamente a "Realizadas" (color violeta) al abrir la agenda.

## v1.0.5 (2026-02-03)
- **UI/UX**:
    - Se reemplazó el **Favicon** por el nuevo diseño solicitado (Cruz ITEO).

## v1.0.4 (2026-02-03)
- **UI/UX**:
    - Se actualizó el **Favicon** del sitio utilizando el logo oficial de ITEO (azul).

## v1.0.3 (2026-02-03)
- **Correcciones**:
    - Se solucionó el error en navegadores donde intentar navegar a una ruta con espacios causaba pantalla en blanco (Fix crítico de navegación).
    - Se arregló el evento `onChange` faltante en el buscador de pacientes de "Nueva Cirugía".
- **Mejoras**:
    - **Auditoría Detallada**:
        - Se implementó el registro detallado de cambios (Diffs) en la edición de cirugías.
        - Se mejoró la visualización en la pantalla de Auditoría (`/audit`) para mostrar qué campos cambiaron específicamente.
        - Se habilitó la búsqueda por Nombre de Paciente y DNI en el historial de auditoría.

## v1.0.2 (2026-02-03)
- **Mejoras**:
    - Corrección de rutas de navegación.
    - Build de producción inicial estable.
