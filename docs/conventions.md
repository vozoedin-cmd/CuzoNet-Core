# Convenciones oficiales de CuzoNet

## Nombres y organización

- Directorios y archivos: `kebab-case`; los ADR mantienen el formato `ADR-NNN-Titulo.md` ya aprobado.
- Clases, entidades y tipos: `PascalCase`. Funciones, variables y propiedades JSON: `camelCase`.
- Tablas y columnas de base de datos: `snake_case`; claves primarias `id` y foráneas `<entidad>_id`.
- Rutas REST: minúsculas en español y sustantivos plurales. Las rutas publicadas no cambian sin nueva versión de API; compuestos nuevos usan guiones, por ejemplo `/estado-cuenta`.

## Identificadores, tiempo y versiones

- Las entidades de negocio usan UUIDv7 generado por Application y se serializan en minúsculas canónicas.
- Timestamps se guardan y transmiten en UTC con RFC 3339. Las fechas de vencimiento se calculan con la zona horaria de la empresa.
- API: prefijo `/api/v1`; un cambio incompatible crea `/api/v2`.
- Eventos: `PascalCase.vN`, por ejemplo `PaymentRecorded.v1`. Un cambio incompatible crea una versión nueva.
- Migraciones, cuando sean aprobadas, serán inmutables y ordenadas; no se editará una migración aplicada.

## REST e idempotencia

- `GET` no cambia estado. `POST` crea o solicita acciones; `PUT` reemplaza datos administrativos permitidos; `DELETE` archiva cuando existe historial.
- Toda mutación exige `Idempotency-Key` salvo autenticación u otra excepción explícita del contrato.
- Operaciones externas devuelven `202 Accepted` y `operationId`; el cliente consulta su estado en vez de repetir el efecto técnico.
- Respuestas JSON usan `camelCase`, paginación `data`, `page`, `pageSize`, `total` y dinero en campos `*Cents`.

## Errores y trazabilidad

- Los errores siguen `code`, `message`, `correlationId`; las validaciones agregan `fields` con ruta y mensaje.
- `code` usa `UPPER_SNAKE_CASE`, por ejemplo `RESOURCE_NOT_FOUND` o `SERVICE_STATE_CONFLICT`.
- La solicitud acepta `X-Correlation-Id` UUID; si falta, API genera uno y lo devuelve. Eventos y logs lo preservan.
- Logs estructurados incluyen como mínimo timestamp UTC, nivel, módulo, acción, `correlationId`, actor y entidad cuando corresponda. Nunca incluyen contraseñas, tokens, claves, cuerpos completos sensibles ni datos de pago.

## Eventos, seguridad y colaboración

- Los eventos se registran primero en Outbox y cada consumidor guarda entrega por `eventId` y nombre de consumidor.
- Secrets solo provienen de variables de entorno o gestor de secretos; `.env` no se versiona. `.env.example` contiene solo nombres y valores no sensibles.
- Commits siguen Conventional Commits en inglés, por ejemplo `feat(clients): add service lifecycle contract` o `docs(adr): clarify event ownership`.
- Branches: `feature/<scope>`, `fix/<scope>`, `docs/<scope>`, `chore/<scope>`. No se mezcla trabajo no relacionado en una rama.
- Un cambio estructural exige ADR con motivo, impacto, alternativas y plan de migración, además de aprobación explícita si toca módulos aprobados.
