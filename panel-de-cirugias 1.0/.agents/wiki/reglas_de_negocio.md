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

### Organización de Flujo Pre-Quirúrgico (Planificación)
*   **Sección `OSER sin aprobar material`**: Agrupa en un bloque dedicado aquellas cirugías que cuentan con fecha de autorización (OSER) y **requieren prótesis/materiales**, pero cuya validación por parte de la ortopedia se encuentra **pendiente** (`materialStatus !== 'OK'`). Las cirugías que no requieren materiales quedan excluidas automáticamente de este grupo.
*   **Sección `OSER material aprobado (Capital)`**: Agrupa en un bloque dedicado las cirugías con fecha de autorización (OSER) asignadas a **Ortopedia Capital** cuya validación de materiales ya ha sido **aprobada/confirmada** (`materialStatus === 'OK'`).
*   **Vista Opcional "Ranking" (4 Columnas)**: Permite alternar mediante un botón en el header de Planificación entre la vista de flujo tradicional y una estructura de 4 columnas (`Urgencias y Emergencias`, `OSER`, `Prepagas`, `ART y Particulares`). 
    *   **Robustez Multi-Dispositivo**: Se previenen fallos de renderizado en tablets y móviles garantizando el acceso seguro al objeto de quirófano (`orGroup?.is_ambulatory`) y restaurando los handlers de acción de tarjetas suspendidas (`handleCancelSurgery`).
    *   **Columna Urgencias y Emergencias**: Agrupa todas las cirugías no electivas (`priority === 'Urgente' || 'Alta'`) independientemente de su cobertura médica, mostrándolas con prioridad máxima sin requerir filtro previo de autorización.
    *   **Leyenda de Colores Explicativa**: Incluye en la barra superior una guía visual interactiva con los significados de colores: **Fondo/Borde Naranja** (OSER sin material aprobado), **Borde Lateral Rojo** (Prioridad Urgente/Alta), **Borde Lateral Azul** (Prioridad Normal), y Badges de estado (**OK / Verde** = Validado, **Pend / Amarillo** = Pendiente, **Falta / Rojo** = Faltante).
    *   **Badges de Cobertura**: Cada tarjeta muestra en su cuerpo la cobertura específica registrada (ej: `ART - Prevención`, `Particular`, `Swiss Medical`, `OSDE`, etc.).
    *   **Resalte Naranja en OSER**: Toda cirugía de OSER que requiera material y su estado de ortopedia esté pendiente (`materialStatus !== 'OK'`) se resalta visualmente en la tarjeta con **fondo y borde naranja** para su rápida identificación.
    *   **Visibilidad por defecto**: Muestra únicamente las cirugías autorizadas (y urgencias). Al realizar una búsqueda en la barra superior, incluye de forma automática las cirugías no autorizadas.
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
*   **Turno Tarde (15:00 a 19:00 hs / Viernes 14:00 a 19:00 hs en Días Hábiles):** 
    *   Participan el **Técnico Fijo** y el **Técnico de Guardia**, condicionado a que hayan marcado ingreso (`check_in`). Se liquida al 50% para cada uno.
*   **Adición Manual y Coparticipación de Cirugías**:
    *   Cualquier técnico puede incluir manualmente una cirugía realizada a su planilla a través del botón **"+ Agregar Cirugía a mi Listado"**.
    *   **Incorporar un Segundo Técnico**: En cirugías con 1 solo técnico asignado originalmente (ej. cirugías fuera del turno tarde, nocturnas o de fin de semana), el técnico asignado puede sumar a un segundo técnico disponible (fijo o de guardia) presionando el botón **"+ Sumar Técnico"**. Al hacerlo, los honorarios y tiempos de la cirugía se recalculan automáticamente al **50% para cada uno**.
    *   Las cirugías agregadas manualmente o coparticipadas se marcan visualmente como `[Cargada Manualmente]` / `[50% Coparticipada]` y se persisten en la tabla `quirofano.tecnico_manual_surgeries`. También pueden ser removidas manualmente.
*   **Fines de Semana y Horario Nocturno (Post-19:00 hs)**:
    *   Cualquier cirugía los sábados y domingos, o que inicie después de las 19:00 hs en días hábiles, se le abona al **100% al Técnico de Guardia** de ese día.
*   **Resto de Horarios**: Cualquier otra cirugía fuera del turno tarde (ej: mañanas hábiles) se distribuye al **50% para el Técnico de Guardia**.

### Unificación de Nomenclador al Estándar AOTER
*   **Mapeo Automático**: Todas las cirugías procesadas en el panel (incluidas las cirugías de OSER o con nomenclador numérico alternativo `121.xx.xx`) se mapean automáticamente al código **AOTER unificado** (`MS.xx.xx`, `RO.xx.xx`, `PP.xx.xx`) utilizando el mapa de equivalencias `nomenclador_mapping.json`.
*   **Cómputo de Tarifas**: Las tarifas de práctica configuradas en `tecnico_rates` se consultan contra el código AOTER unificado, asegurando liquidaciones parejas entre todas las obras sociales.

### Cierre Mensual y Notificaciones por Correo Electrónico
*   **Firma de Conformidad**: Al presionar **"Dar Consentimiento / Conformidad"**, el técnico otorga conformidad digital sobre la planilla del mes seleccionado.
*   **Notificación Automática por Correo**: El sistema genera y encola un correo en `quirofano.email_notifications` que se envía a:
    1. La casilla de **Administración** configurada en la pestaña *Tarifas y Ajustes* (`notification_email`).
    2. Una **copia (CC)** a la casilla de correo registrada del propio **Técnico**.
*   **Detalle del Resumen**: El correo enviado incluye el desglose completo del monto total ($), especificando parciales de cirugías, días de guardia y horas de asistencia fichadas.

### Cómputo de Guardias Acumuladas y Cortes de Mes (Evitar Duplicados)
*   **Semana Hábil**: Por cada 5 días hábiles (lunes a viernes) de guardia trabajados, se computa 1 día de guardia. Fracciones menores de forma proporcional.
*   **Fines de Semana y Feriados**: Cada sábado, domingo o feriado en día de semana suma 1 día de guardia completo directo.
*   **Corte Mensual (Semana Cruzada)**: 
    *   Si una semana de guardia cruza el cambio de mes (ej. fin de junio y principio de julio), se le contempla la semana completa de guardia al técnico asignado en el mes que finaliza.
    *   Los días que cayeron en ese mes de transición y ya fueron incluidos en la liquidación anterior **se excluyen/restan estrictamente del mes siguiente** para evitar pagar dos veces el mismo día de guardia.

### Nomenclador de Prácticas y Tarifas (10/08/2026)
*   **Listado Pre-Cargado:** En la pestaña *Tarifas y Ajustes* ([TecnicoPanel.tsx](file:///c:/Users/ignac/OneDrive/ITEO%20-%20Personal/Desarrollos/Coordinacion%20quirofano%20-%20capital%20-%20internaciones/panel-de-cirugias%201.0/pages/TecnicoPanel.tsx)), el recuadro "Tarifas por Práctica" despliega el listado completo de códigos nomenclados (OSER / AOTER).
*   **Gestión Rápida de Tarifas:** Las prácticas sin tarifa configurada se muestran con la etiqueta ⚠️ `Sin Precio ($0)`. Cuenta con un buscador en tiempo real por código y botones de "Cargar Precio" / "Editar" para asignar montos a medida que se cuente con la información.


### Control de Asistencia y WiFi
*   Los técnicos marcan Entrada, Salida, Descanso y Retorno desde su celular.
*   La acción está bloqueada si la IP pública de navegación no coincide con alguna de las IPs configuradas de la clínica (soporta múltiples IPs separadas por comas).
*   **Cierre Automático de Salida por Olvido (22:00 hs)**: Si un técnico marca ingreso (`check_in`) en el turno tarde y pasada las 22:00 hs del mismo día (o en días posteriores) no registró su marca de salida (`check_out`), el sistema le computa automáticamente el egreso a las **19:00 hs** de esa misma fecha.

### Cierre y Conformidad Mensual
*   Al fin de mes, cada técnico debe auditar su planilla (que ahora consolida Horas Fichadas, Cirugías y Guardias) y presionar "Dar Conformidad" para registrar firma en `tecnico_monthly_consents` y bloquear liquidaciones.
