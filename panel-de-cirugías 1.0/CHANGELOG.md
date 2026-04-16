# CHANGELOG

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
