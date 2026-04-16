[x] Analizar error en `SurgeryDetail.tsx` (Detección de `isNew` y validación de `emergency`)
[x] Crear plan de implementación para corregir el bloqueo
[x] Corregir detección de `isNew` en `SurgeryDetail.tsx`
[x] Flexibilizar reglas de validación para prioridad `emergency` e `Internacion`
[x] Generar nuevo build de producción v1.1.1
[x] Verificar solución con el usuario
[x] Investigar y corregir auto-inicio visual para cirugías en `pending_validation` (v1.1.2)
    [x] Ajustar lógica en `Dashboard.tsx`
    [x] Ajustar lógica en `Monitor.tsx`
    [x] Generar nuevo build v1.1.2
[x] Ocultar ID y DNI bajo el nombre de los pacientes (v1.1.3)
    [x] Modificar `Dashboard.tsx`
    [x] Modificar `SurgeryList.tsx`
    [x] Generar nuevo build v1.1.3
[x] Corregir registros de auditoría y errores (RLS)
    [x] Crear plan de implementación
    [x] Aplicar cambios en las políticas de RLS
    [x] Verificar inserción de logs desde la app
    [x] Generar nuevo build v1.1.4
[x] Corregir gráfico de resultados (en blanco)
    [x] Analizar causa del fallo (idioma de estados)
    [x] Crear plan de implementación
    [x] Aplicar corrección en `ResultsDashboard.tsx`
    [x] Verificar visualización de gráficos
    [x] Generar nuevo build v1.1.5
[x] Implementar detalle de cirugías por médico (Drill-down)
    [x] Crear plan de implementación
    [x] Expandir consulta de datos en `ResultsDashboard.tsx`
    [x] Implementar modal de detalle
    [x] Verificar interactividad
    [x] Generar nuevo build v1.1.6
[x] Limpiar datos de prueba de auditoría
    [x] Crear plan de implementación
    [x] Eliminar registros de prueba en Supabase
    [x] Validar registro de acciones reales
[x] Flexibilizar validación de ortopedia y ajustar UI (v1.1.7)
    [x] Crear plan de implementación
    [x] Modificar lógica de validación en `SurgeryDetail.tsx`
    [x] Mover checkbox "¿Lleva Prótesis?" a la izquierda
    [x] Generar nuevo build v1.1.7
[x] Refinar lógica de prótesis y avisos (v1.1.8)
    [x] Crear plan de implementación
    [x] Quitar auto-marcado de prótesis en `SurgeryDetail.tsx`
    [x] Agregar modal de aviso por falta de materiales
    [x] Generar nuevo build v1.1.8
[x] Corregir visibilidad de prótesis (v1.1.9)
    [x] Crear plan de implementación
    [x] Mostrar checkbox de prótesis siempre en `SurgeryDetail.tsx`
    [x] Generar nuevo build v1.1.9
[x] Corregir auto-finalización y buffer (v1.1.10)
    [x] Crear plan de implementación
    [x] Agregar `estimated_duration` a la consulta en `SurgeryList.tsx`
    [x] Ajustar buffer de 45min a 10min en todo el sistema
    [x] Generar nuevo build v1.1.10
[x] Refinar estados y flujos (v1.1.11)
    [x] Crear plan de implementación
    [x] Agregar estado `waiting_date` en `types.ts` y monitores
    [x] Permitir validación de Internación sin fecha en `SurgeryDetail.tsx`
    [x] Implementar auto-validación de Técnico al asignar fecha
    [x] Implementar pérdida de validación en suspensiones/cambios
    [x] Generar nuevo build v1.1.11
[x] Corregir discrepancias visuales (v1.1.12)
    [x] Implementar promoción visual en Dashboard
    [x] Implementar promoción visual en Listado General
    [x] Implementar promoción visual en Monitores
    [x] Sincronizar buffer 10min en `Monitor.tsx`
    [x] Generar nuevo build v1.1.12
[x] Implementar Alertas de Autorización (v1.1.13)
    [x] Crear plan de implementación
    [x] Quitar bloqueo de fecha de autorización en `SurgeryDetail.tsx`
    [x] Implementar alerta crítica a 3 días por falta de autorización en `Dashboard.tsx`
    [x] Implementar registro de responsabilidad al ver alerta en `AlertsHistory.tsx`
    [x] Generar nuevo build v1.1.13
[x] Hotfix v1.1.14: Logs y Calendario
    [x] Corregir mensaje `null` en logs de auditoría de Calendario
    [x] Eliminar bloqueo de fecha de autorización en `Calendar.tsx`
    [x] Generar nuevo build v1.1.14
[x] Hotfix v1.1.15: Constraint de Estado
    [x] Actualizar constraint `surgeries_status_check` para permitir `waiting_date`
    [x] Generar nuevo build v1.1.15
[x] Generar nuevo build v1.1.16 (Logs y Correcciones)
    [x] Actualizar versión a v1.1.16
    [x] Generar build

[x] Refinar visualización de estados (v1.1.17)
    [x] Crear plan de implementación
    [x] Agregar indicador visual de "Fecha Asignada" en `SurgeryList.tsx`
    [x] Agregar indicador visual de "Fecha Asignada" en `Dashboard.tsx`
    [x] Generar nuevo build v1.1.17

[x] Implementar Buscador en Modal de Agendamiento (v1.1.18)
    [x] Crear plan de implementación
    [x] Agregar estado `modalSearchTerm` y UI de buscador en `Calendar.tsx`
    [x] Implementar lógica de filtrado en el modal
    [x] Generar nuevo build v1.1.18
