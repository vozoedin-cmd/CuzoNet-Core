# ADR-011: Estrategia de base de datos

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

SQLite permite comenzar con bajo costo operativo, pero una operación WISP puede requerir mayor concurrencia, alta disponibilidad y reportes intensivos.

## Decisión

La fase inicial utiliza SQLite con claves foráneas activas, WAL, transacciones breves, copias verificadas y una única instancia escritora. El modelo usa UUIDv7, importes enteros en centavos, fechas UTC, tablas normalizadas, índices explícitos y migraciones versionadas compatibles con PostgreSQL.

No se usan tipos o extensiones exclusivos de SQLite para reglas esenciales. La persistencia se accede únicamente mediante repositorios que implementan puertos de Application.

## Consecuencias

La migración posterior a PostgreSQL se concentra en el adaptador, la configuración y una migración de datos validada. Antes de escalar horizontalmente o aumentar la concurrencia de escritura se debe completar esa migración.
