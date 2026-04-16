# Walkthrough: Correcciones v1.1.2 y v1.1.3

Se han aplicado mejoras en la automatización de estados y limpieza visual de la interfaz.

## Cambios Aplicados

### v1.1.18: Buscador en Agendamiento
- **Filtrado en Tiempo Real**: Se agregó una barra de búsqueda en el modal de agendamiento del calendario para localizar cirugías por paciente, médico o procedimiento sin tener que desplazarse por toda la lista.

### v1.1.17: Mejora de Visibilidad de Fechas
- **Identificador de Fecha Reservada**: Se implementó una etiqueta de **"FECHA RESERVADA"** (en azul) que aparece junto al estado "Pendiente Validación" si la cirugía ya tiene asignada una fecha y hora. Esto evita la confusión sobre si la cirugía está agendada o no.
- **Sincronización de Contexto**: Se crearon copias legibles del historial de tareas (`project_task.md`) dentro del proyecto para facilitar el trabajo en diferentes computadoras a través de OneDrive.

### v1.1.16: Corrección de Subida de Archivos y Logs
- **Base de Datos (Hotfix)**: Se corrigió un error de Foreign Key que impedía subir documentos a las cirugías. Ahora el sistema reconoce correctamente el vínculo entre los documentos y los usuarios logueados.
- **Legibilidad de Errores**: Se optimizó la captura de fallos para que el visor de logs muestre el mensaje real del error en lugar de un genérico `[object Object]`.

### v1.1.15: Hotfix de Base de Datos
- **Corrección de Constraint**: Se actualizó la restricción de base de datos que limitaba los "Estados" permitidos para una cirugía. Se agregó oficialmente `waiting_date` a la lista de valores válidos, solucionando el error al guardar.

### v1.1.14: Hotfix de Logs y Consistencia
- **Corrección de Log "null"**: Se corrigió el registro de auditoría en la función de agendamiento del Calendario, que mostraba un mensaje `null` confuso.
- **Consistencia en Agendamiento**: Se eliminó el bloqueo de fecha de autorización también en la vista de Calendario, para que coincida con la flexibilidad implementada en v1.1.13.

### v1.1.13: Alertas de Autorización y Flexibilidad
- **Agendamiento Flexible**: Se eliminó el bloqueo que impedía agendar cirugías sin fecha de autorización. Ahora es posible confirmar fecha y hora sin este dato.
- **Alertas Críticas**: Se implementó una nueva alerta automática de severidad CRÍTICA que se dispara si faltan **3 días o menos** para la cirugía y aún no tiene cargada la fecha de autorización.
- **Registro de Responsabilidad**: En el historial de alertas, cuando un usuario hace clic en "Ver Detalles" sobre una notificación, el sistema registra automáticamente su nombre como "En gestión por", funcionando como un acuse de recibo de la novedad.

### v1.1.12: Corrección de Discrepancias Visuales
- **Promoción Visual Automática**: Se implementó una lógica que detecta si una cirugía tiene sus validaciones completas y fecha asignada para mostrarla como "Programada" (o "A la espera de fecha" si le falta fecha), independientemente de lo que diga la base de datos para registros antiguos. Esto corrige casos como el de **Bettarel Mariano**.
- **Sincronización de Monitores**: Se normalizaron las consultas y los tiempos de buffer en los monitores públicos.

### v1.1.11: Refinamiento de Estados y Flujos
- **Nuevo Estado "A la espera de fecha"**: Introducido el estado `waiting_date` para cirugías que cuentan con validación de Ortopedia e Internación pero aún no tienen una fecha asignada.
- **Flexibilidad en Internación**: Se eliminó el requisito de fecha de cirugía para que el sector de Internación pueda validar su parte (basado ahora solo en pre-quirúrgicos y consentimiento).
- **Automatización para Técnicos**: Al asignar una fecha de cirugía, el sistema ahora tilda automáticamente la "Validación Quirófano" si el usuario tiene el rol de Técnico.
- **Reseteo de Seguridad**: La "Validación Quirófano" se resetea automáticamente si la cirugía es suspendida o reprogramada, garantizando una nueva revisión del cronograma.
- **Sincronización de Monitores**: Se unificó el buffer de auto-finalización a 10 minutos en todas las vistas (Dashboard y Monitores).

### v1.1.10: Optimización de Auto-Finalización
- **Buffer Reducido**: Se bajó el margen de error de auto-finalización de 45 a **10 minutos**, permitiendo que las cirugías pasen a "Completada" mucho más rápido.
- **Fix Listado General**: Se restauró la lógica de auto-finalización en el Listado General corrigiendo la consulta de datos que impedía el cálculo.

### v1.1.9: Visibilidad Permanente de Prótesis
- **UI Consistente**: El campo "¿Lleva Prótesis?" ahora es visible desde el momento en que se crea una nueva cirugía, no solo en la edición. Esto permite al usuario indicar si la cirugía requiere prótesis desde el inicio del proceso.

### v1.1.8: Refinamiento de Prótesis y Avisos
- **Control Manual**: Se eliminó el tildado automático del checkbox "¿Lleva Prótesis?". Ahora el usuario tiene control total sobre este campo.
- **Prevención de Errores**: Se agregó un aviso de confirmación al guardar una cirugía si el campo de prótesis está marcado pero la lista de materiales está vacía, asegurando que no se olvide cargar los insumos necesarios.

### v1.1.7: Flexibilización de Ortopedia y Ajuste de UI
- **Validación Inteligente**: Ahora las cirugías solo requieren validación de ortopedia si tienen materiales en su lista. Si solo marcás que lleva prótesis pero no agregás materiales, podés programarla sin bloqueos.
- **Mejora en Interfaz**: Se movió el campo "¿Lleva Prótesis?" a la izquierda de la sección de materiales para un acceso más intuitivo y rápido.

### v1.1.6: Detalle de Cirugías por Médico (Drill-down)
- Se implementó la posibilidad de hacer clic en cualquier fila de la tabla de profesionales en la sección de Resultados.
- Al hacer clic, se abre un **Panel de Detalle** que muestra el listado exacto de las cirugías que se están contando (incluyendo fecha, paciente, procedimiento y estado), brindando transparencia total sobre las estadísticas.

### v1.1.5: Reparación del Dashboard de Resultados
- Se corrigió un error en los filtros de la sección de Resultados que impedía mostrar los gráficos y estadísticas de cirugías completadas.
- Esta corrección también restableció el funcionamiento de la tabla de **"Operaciones por Médico"**, asegurando que todos los reportes ejecutivos sean precisos.

### v1.1.4: Reparación de Auditoría
- Se corrigieron las políticas de seguridad (RLS) en la base de datos que impedían el registro de acciones. 
- Ahora, cada cambio de estado, creación de cirugía o error del sistema se guarda correctamente en la tabla de auditoría, permitiendo un seguimiento real de los usuarios.

### v1.1.3: Limpieza Visual
- Se ocultó el **ID de cirugía** y el **DNI** que aparecían debajo de los nombres de los pacientes en el Dashboard y la Lista de Cirugías. Esta información ya no sobrecarga la vista principal.

### v1.1.2: Unificación de Auto-Inicio
- El sistema ahora detecta automáticamente si una cirugía ha comenzado basándose en la hora, incluso si administrativamente está como **"Pendiente"**.
- Esto asegura que las cirugías de emergencia con horario asignado se reflejen como **"En curso"** en tiempo real.

## Verificación
- Se generó el build **v1.1.3**.
- Se verificó que los nombres de los pacientes ahora se ven limpios, sin códigos adicionales debajo.
- La lógica de auto-inicio está operativa para todos los estados de validación.
