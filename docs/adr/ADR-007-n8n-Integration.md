# ADR-007: Integración de n8n por HTTP

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

Existen flujos n8n operativos que no deben modificarse. El sistema necesita integrar automatizaciones futuras sin trasladar reglas de negocio a los flujos.

## Decisión

n8n consume endpoints HTTP versionados mediante credenciales de integración con permisos mínimos e `Idempotency-Key` en mutaciones. Los endpoints validan, autorizan y delegan en casos de uso; no exponen acceso directo a SQLite ni comandos técnicos sin contexto de servicio.

Los flujos actuales permanecen intactos. Los flujos nuevos pueden consultar eventos pendientes por HTTP y confirmar su procesamiento cuando necesiten reaccionar a eventos internos sin que el Backend modifique flujos existentes.

## Consecuencias

Las automatizaciones son reemplazables y auditables. Si se desea migrar un flujo existente al Backend en el futuro, requerirá una aprobación específica y un plan de transición.
