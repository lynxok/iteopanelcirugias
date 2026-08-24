# Reglas de Negocio - Coordinación de Quirófano ITEO

## Estados y Validación de Cirugías

### Mapeo de Validaciones en Kanban
Las columnas del Kanban de Planificación se mapean a los siguientes campos booleanos en base de datos:
*   `ortho_validated` -> **Materiales** (Mat)
*   `admission_validated` -> **Estudios/Clínico** (Clin)
*   `or_validated` -> **Administrativo** (Adm)

### Transiciones y Nuevos Estados
*   **Estado "A la espera de fecha" (`waiting_date`)**: Se asigna a cirugías que cuentan con la validación de Ortopedia e Internación pero aún no tienen fecha programada.
*   **Validación Flexibilizada**:
    *   Internación puede validar su sección basándose solo en los pre-quirúrgicos y el consentimiento (sin requerir fecha cargada).
    *   Se permite programar cirugías sin requerir la fecha de autorización médica.
*   **Validación Quirófano Automática**: Al asignar una fecha de cirugía, el sistema tilda de forma automática la "Validación Quirófano" si el rol del usuario conectado es Técnico.
*   **Reseteo de Seguridad**: La "Validación Quirófano" se destilda automáticamente si la cirugía pasa a estado suspendido o reprogramado para forzar una nueva revisión.
*   **Procedimiento 'A DEFINIR' (`[00.00.00] A DEFINIR`)**: Se habilita como ítem comodín por defecto en el selector de nomenclador para solicitudes donde el médico aún no especificó el código o práctica. **Restricción de agendado**: Toda cirugía cuyo procedimiento sea o contenga `"A DEFINIR"` (o código `00.00.00`) tiene estrictamente bloqueado el agendado en el calendario (drag & drop o asignación de fecha/horario/quirófano), requiriendo que se especifique el procedimiento real antes de poder programarla.
*   **Cirugías Canceladas (`cancelled`)**: Se recuperan en el calendario para su consulta histórica. No se muestran como programadas en la grilla regular ni se listan en el panel de cirugías pendientes. En su lugar, cada día del calendario muestra un botón "Canceladas (X)" que abre un modal con el listado detallado y permite visualizar su ficha quirúrgica.
    *   **Exclusión Estricta en Flujo de Planificación**: Toda cirugía con estado `cancelled` queda estrictamente excluida de todos los bloques de agendado y planificación activa del tablero Kanban (`authorizedPatients`, `readyToSchedule`, `unscheduledNew`, `materialBlockers`, `clinicalBlockers`, `otherBlockers`), evitando que figure en grupos activos como *"OSER sin aprobar material"* aunque tenga fecha de autorización cargada.
    *   **Identificación Visual en Detalle**: En el encabezado del detalle quirúrgico (`SurgeryHeader`), cuando la cirugía se encuentra cancelada, el badge de **"ESTADO Y REGISTRO"** muestra de forma inequívoca el rótulo **"Cancelada"** en color rojo suave, en concordancia con el banner de cancelación definitiva.

### Organización de Flujo Pre-Quirúrgico (Planificación)
*   **Sección `OSER sin aprobar material`**: Agrupa en un bloque dedicado aquellas cirugías que cuentan con fecha de autorización (OSER) y **requieren prótesis/materiales**, pero cuya validación por parte de la ortopedia se encuentra **pendiente** (`materialStatus !== 'OK'`). Las cirugías que no requieren materiales quedan excluidas automáticamente de este grupo.
*   **Sección `OSER material aprobado (Capital)`**: Agrupa en un bloque dedicado las cirugías con fecha de autorización (OSER) asignadas a **Ortopedia Capital** cuya validación de materiales ya ha sido **aprobada/confirmada** (`materialStatus === 'OK'`).
*   **Vista Opcional "Ranking" (4 Columnas)**: Permite alternar mediante un botón en el header de Planificación entre la vista de flujo tradicional y una estructura de 4 columnas (`Urgencias y Emergencias`, `OSER`, `Prepagas`, `ART y Particulares`). 
    *   **Robustez Multi-Dispositivo**: Se previenen fallos de renderizado en tablets y móviles garantizando el acceso seguro al objeto de quirófano (`orGroup?.is_ambulatory`) y restaurando los handlers de acción de tarjetas suspendidas (`handleCancelSurgery`).
    *   **Columna Urgencias y Emergencias**: Agrupa todas las cirugías no electivas (`priority === 'Urgente' || 'Alta'`) independientemente de su cobertura médica, mostrándolas con prioridad máxima sin requerir filtro previo de autorización.
    *   **Leyenda de Colores Explicativa**: Incluye en la barra superior una guía visual interactiva con los significados de colores: **Fondo/Borde Naranja** (OSER sin material aprobado), **Borde Lateral Rojo** (Prioridad Urgente/Alta), **Borde Lateral Azul** (Prioridad Normal), y Badges de estado (**OK / Verde** = Validado, **Pend / Amarillo** = Pendiente, **Falta / Rojo** = Faltante).
    *   **Badges de Cobertura**: Cada tarjeta muestra en su cuerpo la cobertura específica registrada (ej: `ART - Prevención`, `Particular`, `Swiss Medical`, `OSDE`, etc.).
    *   **Resalte Naranja en OSER**: Toda cirugía de OSER que requiera material y su estado de ortopedia esté pendiente (`materialStatus !== 'OK'`) se resalta visualmente en la tarjeta con **fondo y borde naranja** para su rápida identificación.
    *   **Visibilidad por defecto**: Muestra únicamente las cirugías activas/autorizadas (y urgencias). Se excluyen estrictamente de la lista base del Ranking (`rankingBase`) las cirugías canceladas (`status === 'cancelled'`) y suspendidas (`status === 'suspended'`). Al realizar una búsqueda en la barra superior, incluye de forma automática las cirugías activas no autorizadas.
    *   **Pestaña Exclusiva "Pendientes Ortopedia" (SuperAdmin / Ortopedia Capital)**:
    *   **Acceso Restringido**: Accesible de forma exclusiva para usuarios con rol `SuperAdmin` o usuarios de `Ortopedia` vinculados al proveedor **"Capital"**.
    *   **Filtro Específico de Cirugías**: Agrupa únicamente aquellas solicitudes que requieren material, cuya aprobación por parte de la ortopedia se encuentra pendiente (`materialStatus !== 'OK'`), y cuyo proveedor asignado sea **"Capital"** O su cobertura/obra social sea **"OSER"**.
    *   **Subsecciones Independientes**: Presenta los registros organizados en 3 secciones bien delimitadas:
        1. **Cirugías Activas Pendientes de Aprobación**: Solicitudes activas/programadas/en espera ordenadas de mayor a menor según los días en espera.
        2. **Cirugías Suspendidas Pendientes de Aprobación**: Subsección independiente destacada en tono ámbar para cirugías suspendidas.
        3. **Cirugías Canceladas**: Subsección independiente destacada en tono rojo para cirugías canceladas con material pendiente.
    *   **Contador / Badge de Días en Espera**: En las tarjetas de paciente de estas cirugías se renderiza un badge violeta animado que calcula y muestra dinámicamente la cantidad de días transcurridos desde que se dio de alta la solicitud (`created_at`). Ejemplo: `Esperando ortopedia: X días`.
*   **Prioridad en OSER y Prepagas**: 1° Autorizadas con material OK / No requiere material, 2° Autorizadas con material pendiente, 3° No Autorizadas.
    *   **Desempate de prioridad**: Se ordena cronológicamente por fecha de creación de la solicitud (`created_at` ascendente, las solicitudes más antiguas arriba de todo).
    *   **Orden en ART y Particulares**: Directo por fecha de creación (`created_at` ascendente).
*   **Cirugías Ambulatorias**: Una cirugía se considera ambulatoria si el switch **"Modalidad Ambulatoria"** (`is_ambulatory`) está activo en su Ficha Clínica o si está agendada en un quirófano configurado como ambulatorio (`operating_room.is_ambulatory`). Las cirugías de guardia (`isGuardia`) **no se marcan automáticamente como ambulatorias**, permitiendo requerir internación si el cuadro clínico lo exige. Cuando una cirugía es ambulatoria, el sistema omite automáticamente los requerimientos y bloqueos de guardado de **Exámenes Pre-quirúrgicos** (sin exigir la fecha de realización de pre-quirúrgicos), **Firma de Consentimiento Informado** y **Validación Cama/ART**, mostrando avisos informativos y computando la validación clínica como completada (`OK`).

### Lógica de Finalización y Auto-Inicio
*   **Auto-Inicio**: Si una cirugía con horario asignado se encuentra en estado "Pendiente" a la hora de comienzo programada, el sistema la muestra como "En Curso" en tiempo real.
*   **Auto-Finalización**:
    *   El monitor en vivo cambia el estado de la cirugía a `completed` en la base de datos cuando excede su tiempo estimado más un **buffer de 10 minutos**.
    *   **Auto-Completado de Cirugías Ambulatorias (Exclusivo Ambulatorias)**: El controlador de segundo plano (`AmbulatoryAutoCompleter`) verifica periódicamente y autocompleta (`status = 'completed'`) todas las cirugías pasadas (`surgery_date < fecha_actual`) que sean **estrictamente ambulatorias** (`is_ambulatory = true` o asignadas a quirófano ambulatorio) y que no hayan sido marcadas previamente como canceladas o suspendidas.
    *   **Auto-Completado por Alta Cruzada**: Una cirugía se considera finalizada si el paciente registra un alta de internación (`hospital_admissions.check_out` no nulo) en un rango de ±2 días sobre la fecha de la cirugía, siempre y cuando la cirugía cuente con un horario de inicio real en quirófano (`actual_start_time`). Esto previene completados prematuros de cirugías futuras si la cama se desocupa antes de tiempo.

## Gestión de Alertas Críticas

### Alertas de Autorización Faltante
*   Se dispara una alerta de severidad **CRÍTICA** si faltan **3 días o menos** para la fecha de la cirugía y aún no se ha cargado su fecha de autorización.
*   **Registro de Responsabilidad**: Cuando un usuario hace clic en "Ver Detalles" sobre una alerta en el historial, el sistema graba automáticamente su nombre de usuario en el campo "En gestión por" de la base de datos.

### Alerta de Horario Modificado en el Mismo Día
*   **Regla de Persistencia**: El "Visto de Internación" (`internacion_notified` e `internacion_notified_by`) **solo se borra/destilda si la reprogramación implica un cambio de fecha (día)**. Si solo se reprograma la hora dentro del mismo día, el visto permanece.
*   Si se detecta un cambio horario en el mismo día respecto a `original_start_time`, la UI del calendario muestra un **reloj naranja parpadeante** con el tooltip descriptivo `"Horario cambiado en el mismo día (Original: HH:MM)"`.

## Reglas de Control de Accesos y Roles

### Permisos por Sección y Campos Dinámicos
*   **Oficina ART y Tablero de Control ART (`isArtUser`)**: Los usuarios con rol `Oficina ART` o `ART` acceden al **Tablero de Control ART** ([AdminDashboard.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/pages/AdminDashboard.tsx)). El filtrado exclusivo de cirugías pendientes/activas para este tablero evalúa dinámicamente si la cobertura/obra social del paciente está configurada como una Aseguradora de ART en la tabla `quirofano.coverages` (`type = 'ART'`), conectándose directamente con la opción **"Es Aseguradora (ART)"** del panel de Coberturas (además de validar palabras clave de resguardo).
*   **Sección Guardias (`on_duty`)**: Los usuarios con permiso `'view'` en la matriz de permisos pueden ver el drawer de guardias de la semana en modo solo lectura. Aquellos con `'edit'` pueden modificar el personal general y excepciones.
*   **Guardias de Residentes (Edición de Turnos)**: Los residentes habilitados mediante el indicador `can_edit_shifts` (y usuarios con roles administrativos o SuperAdmin) pueden crear, modificar horarios (inicio, fin, fecha) y eliminar guardias asignadas tanto desde el calendario como desde el panel de "Mis Guardias" (`MyConsentsView` / `LogShiftModal`).
*   **Modo Visor (Solo Lectura)**:
    *   Los roles `Medico` y `Enfermeria` tienen un modo visor estricto que bloquea la modificación de fichas de cirugía.
    *   El rol `Administrativo de Guardias` puede crear nuevas cirugías que se configuran por defecto como "Cirugía de Guardia" (`isGuardia = true`). Solo puede editar cirugías existentes si el rol que las creó es también `Administrativo de Guardias` (rastreado por la columna `created_by_role`).
    *   El rol `Mucama` tiene accesos base restringidos en el Mapa de Internación (sin asignación de camas, alta, o suministro de medicamentos).
*   **Restricciones de Edición Dinámica (`system_fields`)**: La edición de inputs del formulario quirúrgico (Obra Social, Diagnóstico CIE-10, Quirófano, Materiales, Fecha) está regulada dinámicamente por rol según los registros leídos de la tabla `public.system_fields`.

## Control de Residentes y Guardias Obligatorias

*   **Metas Mensuales de Horas de Guardia**:
    *   **R1**: 3 guardias de 24hs y 5 de 12hs.
    *   **R2**: 2 guardias de 24hs y 6 de 12hs.
    *   **R3**: 2 guardias de 24hs y 4 de 12hs.
    *   **R4**: 1 guardia de 24hs y 5 de 12hs.
*   **Vigencia Histórica de Categorías / Promociones (v3.10.103)**:
    *   Los cambios de nivel de residencia (ej. de R1 a R2) se registran con una fecha de inicio de vigencia mensual (`resident_level_history` en formato `YYYY-MM-01`).
    *   Al calcular el cumplimiento en el Dashboard Resumen de Guardias (`ResidentShifts.tsx`), el sistema evalúa dinámicamente el nivel correspondiente al mes consultado (`getResidentLevelForDate`), aplicando las metas de la categoría nueva exclusivamente **a partir del mes de vigencia en adelante** y conservando intactos los requisitos históricos de los meses previos.
*   **Horarios y Cobertura Obligatoria**:
    *   **Lunes a Viernes (hábiles y días no laborables optativos)**: Cobertura nocturna de **17:00 a 07:00 del día siguiente** (14 horas).
    *   **Fines de semana y Feriados Nacionales (Argentina)**: Cobertura de **24 horas** de **08:00 a 08:00 del día siguiente** (puede ser cubierto por uno o más turnos).
    *   La brecha de cobertura (`uncoveredHrs`) se calcula de forma dinámica según el tipo de día basándose en estos objetivos (00:00-08:00 / 08:00-24:00 para fines de semana).
*   **Regla de Descanso (Soft Warning)**: Todo registro de guardia nuevo o modificado valida que se respete un **periodo de descanso de 16 horas** antes y después de cualquier otra guardia activa. Si se incumple, el sistema advierte al usuario con una confirmación pero permite guardar de todos modos (no es bloqueante). Las superposiciones directas siguen estando prohibidas.

## Reglas Horarias y Zona Horaria

*   **Fijación Horaria de Buenos Aires**: Se fuerza el huso `{ timeZone: 'America/Argentina/Buenos_Aires' }` en todas las llamadas de formateo de fecha y hora del monitor para evitar desfasajes por PCs configuradas en otras zonas horarias.
*   Las extensiones y retrasos de cirugías se calculan mediante operaciones de cadenas de texto puras para no depender del huso de la máquina del cliente al instanciar `new Date()`.
*   **Ajuste Dinámico del Fin de Cirugía por Anestesia (Ficha Técnica)**: En la Ficha Técnica (`SurgeryForm`), si el horario de **Fin de Anestesia (`hfa`)** es más tardío que el horario de **Fin de Cirugía (`hfc`)** (o si `hfc` no ha sido completado), el sistema asigna automáticamente el horario de Fin de Anestesia como el nuevo Fin de Cirugía tanto de forma interactiva en la interfaz como al guardar el registro en Supabase.

## Sincronizador OSER (Auditoría de Prácticas y Fechas)

*   **Detección de Discrepancias**:
    *   Una cirugía entra en el listado de resultados/discrepancias si difiere en la fecha programada (`diffs.date`), tiene prácticas pendientes de autorizar/sincronizar (`diffs.practices`), está en estado "Sin avances" (`isStale`), o si fue anulada/cerrada en el portal de OSER.
    *   **Filtrado de Historial**: Al comparar prácticas de OSER con las de la App, se ignoran del cálculo de discrepancias aquellas prácticas de OSER que no existen en la App y cuyo estado es no autorizable (ej. "Rechazada", "Anulada", o "No autorizada"). Estas se consideran parte del historial inactivo y no deben forzar la aparición del paciente en la lista de discrepancias para sincronizar.

## Gestión de Facturación (Planilla Internaciones)

*   **Criterio de Inclusión de Registros (Actualizado)**:
    *   La planilla lista **todas las cirugías completadas (`status === 'completed'`)**, tengan o no internación asociada.
    *   Si existe una internación finalizada para el paciente, se vincula de forma automática si la fecha de ingreso (`check_in`) está en un rango de **±5 días** respecto a la fecha de la práctica (antes ±2 días).
    *   Para cirugías ambulatorias o de guardia (sin internación previa), cargar una fecha de facturación o AOTER genera de manera automática un registro virtual en `hospital_admissions` con fechas de ingreso/egreso iguales a la fecha de la cirugía, permitiendo persistir las fechas de facturación sin ocupar camas.
*   **Origen de Fechas y Búsquedas**:
    *   La fecha principal de la fila y la ordenación temporal se basan en la **Fecha de la Práctica (Qx)** de la cirugía asociada, no en la de ingreso.
    *   Las búsquedas y filtros por rango de fechas operan sobre esta fecha de práctica.
*   **Filtros Rápidos de Planilla**:
    1. **Sin fecha factura**: `!fe_factur`
    2. **Con fecha factura**: `!!fe_factur`
    3. **Sin fecha aoter**: `!fe_aoter`
    4. **Con fecha aoter**: `!!fe_aoter`
    5. **Con ambas fechas**: `!!fe_factur && !!fe_aoter`

## Estimación de Camas y Recopilación de Datos

*   **Fase de Recopilación Incremental**: Iniciada el **10/07/2026**. Recopila los días reales de estancia del paciente (egreso - ingreso) para cirugías completadas a partir de esa fecha.
*   **Filtro de Datos Atípicos**: Se descartan de las muestras estadísticas de cama las internaciones con una estancia menor a 0 días o mayor a 30 días para evitar desvíos extremos.
*   **Umbral de Habilitación**: Cada tipo de cirugía (procedimiento) requiere acumular un **mínimo de 10 casos válidos** antes de habilitar su estimación predictiva de camas y marcarse como `is_ready = true`.
*   **Control de SuperAdmin**: En la sección Ajustes de la App, los SuperAdmins pueden visualizar el grado de avance porcentual de recolección para cada procedimiento y un cartel destacado indicando si ya se cuenta con suficiente información para iniciar las estimaciones.
*   **Advertencia de Seguridad de Cama**: Si el procedimiento realizado tiene pocas muestras históricas de recuperación (< 10 casos en la tabla de estadísticas), el sistema alertará al usuario de que no hay suficientes datos para la estimación predictiva de camas, pero le permitirá omitir la advertencia de forma interactiva (`confirm`) y continuar con el ingreso manual.


## Normalización y Extracción de Códigos de Procedimiento (v3.10.36)

*   **Formatos admitidos**: La App extrae automáticamente los códigos del nomenclador en dos formatos de nombre de procedimiento:
    1.  **Formato Estándar**: `[CÓDIGO] Descripción` (ej. `[121.07.08] Reparación...`).
    2.  **Formato Alternativo**: `CÓDIGO: Descripción` (ej. `1210708: Reparacion...` típico de OSER o ingresos de texto libre).
*   **Unificación y Mapeo**: Al calcular estadísticas en el Dashboard (Casuística e Inteligencia Predictiva), el sistema normaliza ambos códigos removiendo caracteres especiales (ej. `121.07.08` y `1210708` se reducen a `1210708`) para garantizar su correcta acumulación bajo la misma práctica del nomenclador, previniendo discrepancias por diferencias de sintaxis.
+
+## Reglas de Negocio - Panel de Técnicos (28/07/2026)
+
+### Asignación de Cirugías
+*   **Técnico Fijo**: Participa de forma automática en todas las cirugías que se lleven a cabo de lunes a viernes en el rango de 15:00 a 19:00 hs.
+*   **Técnico de Guardia**: Participa en las cirugías de los días en que figura asignado en el calendario semanal de guardias de técnicos (`on_duty_tecnicos` en `admin_settings`).
+
+### Redondeo y Liquidación de Tiempos de Cirugía
+*   **Piso de Duración**: Cualquier cirugía que dure 30 minutos o menos se computa como 30 minutos (0.5 hs).
+*   **Redondeo por Bloques**: A partir de los 30 minutos, el tiempo se redondea hacia arriba al siguiente bloque de 15 minutos (ej: 35 min -> 45 min, 50 min -> 60 min).
+*   **Fórmula de Costo**: `Costo Qx = Tarifa Práctica (Nomenclador) + (Tarifa Hora * Horas Redondeadas)`.
+*   **División de Pago**: El costo total de la cirugía se divide por 2 (50% para cada uno de los dos técnicos participantes en el quirófano).
+

## Reglas de Negocio - Panel de Técnicos (29/07/2026)

### Horas Fichadas (Asistencia Real)
*   **Asistencia**: Las horas de asistencia reales registradas/fichadas mediante el sistema de fichado de jornada se calculan de manera neta (restando los descansos tomados).
*   **Liquidación de Asistencia**: Las horas reales acumuladas en el mes se multiplican por el **Valor Hora** (Tarifa Hora) y se suman directamente a la liquidación final del técnico.

### Asignación de Cirugías y Coparticipación
### Horarios y Asignación de Cirugías a Técnicos (10/08/2026)
*   **Guardia Nocturna, Fines de Semana y Feriados:** 
    *   Cualquier cirugía iniciada **antes de las 06:00 hs AM** en días hábiles, **después de las 19:00 hs** en días hábiles, o en **sábados, domingos y feriados** se asigna al 100% al **Técnico de Guardia** de esa fecha.
*   **Turno Mañana (06:00 a 14:00/15:00 hs en Días Hábiles):** 
    *   Corresponde al personal del turno mañana. **No se asigna automáticamente al Técnico de Guardia ni al Fijo**, a menos que en la Ficha Técnica de Cirugía (`surgery_forms.instrumentadora`) se encuentre especificado su nombre expresamente.
### Cómputo de Honorarios al 50% (Turno Tarde y Coparticipación)
*   **Fórmula Directa de Liquidación**: Para toda cirugía realizada en Turno Tarde o marcada como Coparticipada, el cálculo de honorarios se realiza directamente dividiendo el **Monto QX Total** al 50%:
    $$\text{Monto QX Total} = \text{Tarifa Nomenclador} + \text{Tarifa Tiempo QX}$$
    $$\text{Mi Parte (50\%)} = \frac{\text{Monto QX Total}}{2}$$
*   **Alineación de Tiempos**: Se eliminó la división duplicada previa que dividía la duración antes del cómputo del tiempo, asegurando que tanto la práctica como el tiempo quirúgico se abonen en exacta paridad del 50%.
*   **Formato de Moneda Estricto (`es-AR`)**: Todos los subtotales y el Total a Liquidar se formatean con 2 decimales fijos bajo el locale argentino (`$ X.XXX,XX`), suprimiendo decimales flotantes anómalos.

### Cierre, Conformidad Mensual y Responsividad Multi-Dispositivo
*   **Firma de Conformidad**: Al presionar **"Dar Consentimiento / Conformidad"**, el técnico otorga conformidad digital sobre la planilla del mes seleccionado.
*   **Tarjeta de Cierre Mensual Adaptable**: El panel inferior consolida el desglose parcial en píldoras informativas (Cirugías, Guardias y Horas de Asistencia) junto a la caja de Total a Liquidar.
*   **Estructura de Scroll y Aislamiento de Tablas**:
    - La vista de `TecnicoPanel.tsx` no posee scroll interno forzado (`overflow-y-auto` o `min-h-screen`), delegando el desplazamiento al layout general para evitar dobles scrollbars y recortes de componentes.
    - La tabla de cirugías contiene un contenedor de scroll horizontal exclusivo (`overflow-x-auto` con `min-w-[950px]`), previniendo que la grilla de 10 columnas ensanche la vista en smartphones y garantizando que la tarjeta de liquidación permanezca 100% legible y dentro del ancho de la pantalla.

### Rol "Administrativo Dirección" y Auditoría de Gestión de Técnicos (18/08/2026)
*   **Rol "Administrativo Dirección" (`Administrativo Direccion`)**: Dispone de permisos de nivel SuperAdmin exclusivamente para la sección **"Gestión de Técnicos"** (`/tecnicos`), permitiéndole:
    1. Auditar y consultar liquidaciones de cualquier técnico en el panel.
    2. Modificar valores globales (Valor Hora, Valor Guardia, IPs autorizadas WiFi de la clínica y correo de administración).
    3. Cargar, modificar y eliminar tarifas de prácticas nomencladas (OSER / AOTER).
    4. Agregar y co-asignar cirugías a técnicos de forma manual.
*   **Trazabilidad y Registro de Auditoría (`audit_logs`)**: Todas las acciones mutadoras en el panel de técnicos se graban de manera persistente en `quirofano.audit_logs`:
    - **Tarifas Globales (`UPDATE`)**: Registra cambios en valor hora, valor guardia, IP y correos, persistiendo los valores anteriores (`old`) y nuevos (`new`).
    - **Tarifas por Práctica (`CREATE` / `UPDATE` / `DELETE`)**: Guarda el código de práctica, montos modificados/eliminados y el usuario responsable.
    - **Cirugías Manuales y Co-asignaciones (`CREATE` / `DELETE`)**: Identifica paciente, técnico sumado o removido, y quién ejecutó la acción.
    - **Fichadas y Conformidades (`CREATE` / `STATUS_CHANGE`)**: Registra la IP, tipo de fichada o monto liquidado al momento de otorgar la conformidad mensual.
