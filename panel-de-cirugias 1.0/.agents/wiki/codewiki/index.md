# CodeWiki - Panel de Cirugías 1.0

Bienvenido al **CodeWiki** oficial del proyecto **Panel de Cirugías 1.0 (Coordinación de Quirófano, Capital e Internaciones)**. Esta documentación proporciona una vista jerárquica y consciente de la arquitectura del repositorio para desarrolladores y sistemas de IA.

---

## 📚 Índice de Secciones

1. 🏗️ [**Visión General y Arquitectura**](file:///.agents/wiki/codewiki/architecture_overview.md)
   - Diagrama general de arquitectura (Electron, React, Supabase, OSER Sync).
   - Capas del sistema y control de acceso RBAC.

2. 🗺️ [**Mapa de Módulos y Componentes**](file:///.agents/wiki/codewiki/module_map.md)
   - Jerarquía de archivos de `pages/`, `components/`, `src/lib/` y `main.cjs`.
   - Responsabilidades de cada módulo del sistema.

3. 🔄 [**Flujo de Datos y Sincronización**](file:///.agents/wiki/codewiki/data_flow_and_sync.md)
   - Suscripciones Supabase Realtime.
   - Proceso de impresión térmica de pulseras de paciente (280mm x 30mm).
   - Integración OSER / Scraper Playwright.

4. 🧩 [**Árbol de Componentes y Rutas**](file:///.agents/wiki/codewiki/component_tree_and_routes.md)
   - Estructura de navegación SPA y contenedores.
   - Mapeo de modales, selectores y formularios.

---

## 🔍 Documentación complementaria del proyecto

- 📊 [Base de Datos e Infraestructura](file:///.agents/wiki/base_de_datos.md)
- ⚙️ [Decisiones Técnicas y Electron](file:///.agents/wiki/decisiones_tecnicas.md)
- 📋 [Reglas de Negocio y Alertas Quirúrgicas](file:///.agents/wiki/reglas_de_negocio.md)
- 📜 [Historial de Versiones y Parches](file:///.agents/wiki/historial_versiones.md)
