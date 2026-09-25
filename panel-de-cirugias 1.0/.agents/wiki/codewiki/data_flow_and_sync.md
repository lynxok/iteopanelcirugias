# Flujo de Datos e Sincronización - CodeWiki

> [!NOTE]
> Documentación del modelo de sincronización en tiempo real, integración OSER/SAI e impresión térmica.

---

## 🔄 Flujo de Sincronización Supabase Realtime

```mermaid
sequenceDiagram
    autonumber
    actor Usuario
    participant UI as React UI (Kanban/Form)
    participant Supabase as Supabase Database & Realtime
    participant RemoteClient as Otros Clientes (Monitores/Desktop)

    Usuario->>UI: Cambia estado de cirugía (ej. "En Quirófano")
    UI->>Supabase: UPDATE quirofano.cirugias SET estado = 'en_quirofano'
    Supabase-->>UI: OK (Confirmación de escritura)
    Supabase->>RemoteClient: Websocket Event (postgres_changes UPDATE)
    RemoteClient->>RemoteClient: Actualización instantánea del UI sin recarga
```

---

## 🖨️ Arquitectura e Impresión de Pulseras Térmicas

La impresión de pulseras de pacientes se ejecuta mediante dos rutas dependiendo del entorno de ejecución:

```mermaid
graph TD
    A[PatientPrintLabel.tsx] -->|Detecta Entorno| B{¿Es Electron?}
    B -->|Sí window.electronAPI| C[IPC Send 'print-patient-label']
    C --> D[main.cjs - webContents.print]
    D -->|Opciones de página: 280mm x 30mm| E[Impresora Térmica Zebra / TSC]
    B -->|No - Navegador Web| F[window.print]
    F --> G[Diálogo Estándar de Impresión del Navegador]
```

> [!WARNING]
> **Regla de Impresión Térmica**: En Electron (`main.cjs`), NUNCA debe agregarse `landscape: true` a las opciones de `webContents.print()` cuando el CSS especifica `@page { size: 280mm 30mm; margin: 0 !important; }`, ya que causa rotación secundaria no deseada y recorte de datos del paciente en el borde superior de la pulsera.

---

## 🔄 Integración OSER / SAI Scraper

El módulo [`sai-scraper/`](file:///sai-scraper/) interactúa con el sistema hospitalario legado OSER/SAI:

1. **Cola de Trabajo (`OserSyncContext.tsx`)**: Gestiona cirugías pendientes de sincronizar o cotejar con OSER.
2. **Ejecución Playwright**: Extrae datos de partes quirúrgicos programados en SAI.
3. **Normalización e Inserción**: Convierte códigos de práctica y diagnósticos al formato normalizado de Supabase (`quirofano.cirugias`).
