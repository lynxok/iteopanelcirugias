---
name: Aprendizaje Continuo
description: Mantiene un registro persistente de decisiones, patrones y conocimientos del proyecto para evitar la pérdida de contexto.
---

# Habilidad: Aprendizaje Continuo

Esta habilidad está diseñada para asegurar que el conocimiento crítico del proyecto no se pierda entre sesiones o debido al límite de contexto. Se basa en el mantenimiento proactivo de una "Base de Conocimientos" local.

## Instrucciones de Uso

### 1. Lectura Inicial de Conocimiento
Al comenzar un nuevo hilo de conversación o una tarea compleja, busca y lee el archivo de conocimiento del proyecto. La ubicación estándar es:
- `.agent/KNOWLEDGE.md` (o en la raíz del proyecto si no existe la carpeta `.agent`).

### 2. Qué Registrar (Cuándo actuar como "Memoria")
Debes actualizar el registro de conocimiento cuando:
- **Decisiones de Diseño**: Se elija una tecnología, arquitectura o patrón específico (ej: "Usamos Supabase para Auth").
- **Solución de Errores Críticos**: Se resuelva un bug complejo que podría repetirse.
- **Configuraciones**: Variables de entorno necesarias, comandos de despliegue específicos o dependencias clave.
- **Convenios de Código**: Reglas de estilo o nomenclatura acordadas con el usuario.
- **Pendientes Críticos**: Tareas que quedaron a medias y requieren contexto específico para retomarse.
- **Análisis de Impacto**: Por cada cambio realizado, se debe verificar que no afecte negativamente a otras partes de la aplicación. Si existe riesgo de impacto colateral, se debe informar explícitamente al usuario.

### 3. Formato del Registro (`KNOWLEDGE.md`)
Mantén el archivo organizado por secciones:
```markdown
# Base de Conocimiento del Proyecto

## Decisiones Técnicas
- [Fecha] [Decisión]: [Breve explicación y porqué]

## Patrones y Estructura
- [Patrón]: [Descripción de cómo se implementa en este proyecto]

## Comandos y Utilidades
- `comando`: [Para qué sirve]

## Estado de la Tarea Actual
- [Descripción de qué se hizo y qué falta]
```

### 4. Actualización Proactiva
Antes de finalizar una sesión (cuando el usuario diga que ha terminado por hoy o tras completar un hito importante), propón actualizar el `KNOWLEDGE.md` con un resumen de lo aprendido.

## Ejemplo de Interacción
"He notado que hemos decidido cambiar la estructura de la base de datos a un modelo relacional. Voy a registrar esta decisión en nuestra base de conocimiento para tenerla presente en el futuro."
