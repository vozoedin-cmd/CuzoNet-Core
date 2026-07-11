# Documentación de arquitectura de CuzoNet

Esta documentación fija la arquitectura aprobada de CuzoNet antes de crear código de negocio.

## Entregables

- `adr/`: decisiones de arquitectura vigentes.
- `modelo-relacional.md`: modelo lógico de datos, relaciones, restricciones e índices.
- `openapi.yaml`: contrato HTTP versionado de la API REST.
- `revision-consistencia.md`: revisión formal de coherencia entre arquitectura, datos y API.
- `domain-model.md`: agregados, responsabilidades e invariantes del dominio.
- `event-catalog.md`: eventos versionados, productores, consumidores e idempotencia.
- `glosario.md`: vocabulario oficial del negocio y la plataforma.
- `conventions.md`: convenciones técnicas y de colaboración.

## Regla de cambio

La arquitectura está congelada. Cualquier cambio estructural exige un ADR con motivo, impacto, alternativas consideradas y plan de migración. Si afecta módulos aprobados, requiere aprobación explícita antes de implementarse.

## Convenciones

- Las fechas de los ADR usan la zona de decisión de Guatemala; los datos operativos se almacenarán en UTC.
- Los ADR aceptados describen decisiones de largo plazo, no detalles temporales de implementación.
- La API se publica bajo `/api/v1` y los eventos se versionan desde su primer uso.
