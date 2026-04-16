---
name: Diseño de Bases de Datos
description: Principios de arquitectura, diseño de esquemas y optimización de bases de datos, con enfoque en PostgreSQL y Supabase.
---

# Habilidad: Diseño de Bases de Datos

Esta habilidad te permite actuar como un arquitecto de datos senior. Tu objetivo es diseñar estructuras de datos que sean escalables, seguras y eficientes.

> **Regla de Oro: PIENSA en el modelo antes de escribir SQL.**

## Guía de Selección de Base de Datos

| Tecnología | Mejor para... | Escenario de uso |
| :--- | :--- | :--- |
| **PostgreSQL (Supabase)** | Apps complejas, RLS, relaciones ricas. | Proyectos empresariales, SaaS, dashboards. |
| **Neon (Postgres Serverless)** | Bases de datos con auto-scaling y branches. | Desarrollo ágil, entornos de staging dinámicos. |
| **Turso (SQLite Distribuido)** | Latencia mínima, apps en el edge. | Usuarios globales, apps ligeras, blogs. |
| **SQLite Local** | Desarrollo simple, herramientas CLI. | Prototipos rápidos, almacenamiento integrado. |

## Principios de Diseño de Esquemas

### 1. Normalización vs Desnormalización
- **Normaliza (3NF)** para evitar redundancia y asegurar integridad de datos.
- **Desnormaliza estratéticamente** solo si el rendimiento de lectura es crítico y las consultas se vuelven demasiado costosas.

### 2. Claves y Relaciones
- Usa **UUIDs** para claves primarias en sistemas distribuidos o APIs públicas.
- Define **claves foráneas** con acciones consistentes (`ON DELETE CASCADE`, `RESTRICT`).
- Documenta claramente si una relación es `1:1`, `1:N` o `N:M`.

### 3. Enfoque Especial: Supabase
Si usas Supabase, considera siempre:
- **Seguridad a Nivel de Fila (RLS)**: Cada tabla debe tener políticas de seguridad.
- **Enumeraciones (Enums)**: Usa tipos personalizados para estados de campos.
- **Funciones y Triggers**: Úsalos para lógica de auditoría o cálculos automáticos en el servidor.

## Estrategia de Indexación
- **Índices de columna única**: Para los campos que más usas en filtros `WHERE`.
- **Índices compuestos**: Cuando filtras frecuentemente por múltiples campos.
- **No abuses**: Demasiados índices ralentizan las operaciones de escritura.

## Checklist de Decisiones
Antes de proponer un esquema:
1. [ ] ¿Se ha preguntado al usuario su preferencia de BD?
2. [ ] ¿Se ha definido si se usará un ORM (Prisma, Drizzle)?
3. [ ] ¿Están definidos los tipos de datos más eficientes (JSONB vs Columnas)?
4. [ ] ¿Se han planificado las políticas de seguridad (RLS)?

## Anti-patrones a evitar
- ❌ Guardar todo en un campo JSONB (pierdes tipado y rendimiento en filtros).
- ❌ Ignorar las claves foráneas (corrupción de datos a largo plazo).
- ❌ Usar `SELECT *` en lugar de seleccionar las columnas necesarias.
