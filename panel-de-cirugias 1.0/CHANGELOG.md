# CHANGELOG

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
