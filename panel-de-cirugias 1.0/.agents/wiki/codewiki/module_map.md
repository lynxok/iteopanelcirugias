# Mapa de Módulos y Componentes - CodeWiki

> [!NOTE]
> Mapeo jerárquico de componentes, páginas, librerías y scripts del **Panel de Cirugías 1.0**.

---

## 🗺️ Estructura del Código

```
panel-de-cirugias 1.0/
├── components/          # Componentes UI reutilizables y modales
│   ├── settings/        # Paneles modulares de configuración
│   └── surgery-detail/  # Sub-componentes para detalle quirúrgico
├── pages/               # Vistas principales de la aplicación (SPA routes)
├── src/
│   ├── lib/             # Servicios de negocio, Auth, Alertas, Supabase
│   └── data/            # Datos estáticos y diccionarios (CIE-10, Nomenclador)
├── main.cjs             # Proceso principal de Electron (Impresión, Auto-update, IPC)
├── preload.cjs          # Puente IPC Electron <-> Renderer
├── sai-scraper/         # Scraper headless con Playwright para sincronizar OSER/SAI
└── supabase/            # Migraciones SQL, Triggers y Políticas RLS
```

---

## 📦 Detalle de Módulos

### 1. Páginas Principales (`pages/`)

| Archivo | Responsabilidad |
|---|---|
| [`Dashboard.tsx`](file:///pages/Dashboard.tsx) | Vista inicial con métricas en tiempo real, resumen de cirugías del día y alertas de quirófano. |
| [`Kanban.tsx`](file:///pages/Kanban.tsx) | Tablero visual drag-and-drop con estados de cirugía (Solicitada, Confirmada, En Quirófano, En Recuperación, Finalizada, Suspendida). |
| [`Calendar.tsx`](file:///pages/Calendar.tsx) | Vista de calendario por sala/quirófano y por médico cirujano. |
| [`SurgeryList.tsx`](file:///pages/SurgeryList.tsx) | Lista tabulada de cirugías con búsqueda avanzada, filtros multi-criterio y exportación. |
| [`SurgeryDetail.tsx`](file:///pages/SurgeryDetail.tsx) | Vista en profundidad de una cirugía: datos paciente, equipo médico, insumos, historial y firmas. |
| [`DoctorPanel.tsx`](file:///pages/DoctorPanel.tsx) | Panel simplificado adaptado para carga rápida y seguimiento de cirugías de médicos cirujanos. |
| [`TecnicoPanel.tsx`](file:///pages/TecnicoPanel.tsx) | Panel operativo para instrumentadores y técnicos de quirófano con control de tiempos y material. |
| [`HospitalizationMap.tsx`](file:///pages/HospitalizationMap.tsx) | Mapa visual de camas y pisos de internación con estado pre y post quirúrgico. |
| [`HospitalizationScanner.tsx`](file:///pages/HospitalizationScanner.tsx) / [`QRScanner.tsx`](file:///pages/QRScanner.tsx) | Módulo de escaneo de QR para verificación rápida de pulseras térmicas de pacientes. |
| [`ResidentShifts.tsx`](file:///pages/ResidentShifts.tsx) | Gestión de esquemas de guardias de residentes, rotaciones y asignación automática a cirugías. |
| [`Billing.tsx`](file:///pages/Billing.tsx) | Módulo de pre-facturación quirúrgica, consumo de nomenclador y honorarios. |
| [`ResultsDashboard.tsx`](file:///pages/ResultsDashboard.tsx) | Tablero analítico de tiempos de uso de quirófano, tasas de suspensión y eficiencia quirúrgica. |
| [`Audit.tsx`](file:///pages/Audit.tsx) | Registro inmutable de auditoría de cambios y accesos de usuarios. |
| [`AdminDashboard.tsx`](file:///pages/AdminDashboard.tsx) | Control de roles, permisos, configuración global de salas e impresoras. |

---

### 2. Componentes Clave (`components/`)

| Componente | Descripción |
|---|---|
| [`SurgeryForm.tsx`](file:///components/SurgeryForm.tsx) | Formulario completo multi-sección para alta y edición de cirugías (Datos paciente, CIE-10, Nomenclador, Quirófano, Equipo). |
| [`PatientPrintLabel.tsx`](file:///components/PatientPrintLabel.tsx) | **Componente Crítico**: Renderizado e impresión de pulsera de paciente (280mm x 30mm) con código QR de trazabilidad. |
| [`CIE10SelectorModal.tsx`](file:///components/CIE10SelectorModal.tsx) | Modal de búsqueda difusa y selección de diagnósticos CIE-10 (Traumatología y General). |
| [`NomencladorSelectorModal.tsx`](file:///components/NomencladorSelectorModal.tsx) | Buscador de prácticas médicas y módulos del Nomenclador Nacional. |
| [`SurgicalCoordinationAlerts.tsx`](file:///components/SurgicalCoordinationAlerts.tsx) | Barra de alertas automáticas (Superposición de horarios, falta de prótesis, reserva de cama UTI). |
| [`ObsBackgroundController.tsx`](file:///components/ObsBackgroundController.tsx) | Controlador en segundo plano de observaciones médicas y requerimientos especiales. |
| [`OserSyncOverlay.tsx`](file:///components/OserSyncOverlay.tsx) | Indicador visual flotante del estado de la sincronización en segundo plano con OSER/SAI. |

---

### 3. Servicios y Contextos (`src/lib/`)

- [`AuthContext.tsx`](file:///src/lib/AuthContext.tsx): Manejo de sesión, refresco de token Supabase Auth y resolución de rol del usuario actual.
- [`OserSyncContext.tsx`](file:///src/lib/OserSyncContext.tsx): Orquestación de cola de sincronización entre la base de datos local/Supabase y la API del scraper OSER.
- [`alertService.ts`](file:///src/lib/alertService.ts): Reglas de negocio para la generación automática de alertas de coordinación quirúrgica.
- [`permissions.ts`](file:///src/lib/permissions.ts): Matriz de permisos RBAC para control de visibilidad y acciones por rol.
- [`supabase.ts`](file:///src/lib/supabase.ts): Inicializador de cliente Supabase con políticas de reconexión.
