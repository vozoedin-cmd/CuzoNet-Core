# ADR-003: Event Bus persistente y eventos versionados

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

Las acciones posteriores a un pago, cambio de plan o suspensión pueden afectar MikroTik, mensajería y analítica. Una cadena de llamadas síncronas perdería trabajo si un proveedor falla.

## Decisión

Se utilizará un Event Bus persistente basado inicialmente en una tabla transactional outbox y workers idempotentes. La transacción que cambia el estado de negocio guarda también el evento. Un worker publica y entrega eventos después del commit.

El nombre transportado se versiona desde el inicio, por ejemplo `PaymentRecorded.v1`, `ServiceSuspended.v1`, `ServiceReactivated.v1`, `ClientCreated.v1` y `SimpleQueueCreated.v1`. El catálogo vigente en `docs/event-catalog.md` es la fuente oficial de nombres, productores, consumidores y evolución. Cada evento contiene `eventId`, `eventType`, `occurredAt`, `aggregateType`, `aggregateId`, `correlationId`, `causationId`, `payload` y `schemaVersion`.

Los consumidores registran entregas procesadas para soportar entrega al menos una vez. No se incorpora un broker externo hasta que el volumen o la disponibilidad lo justifiquen.

## Consecuencias

Los handlers deben ser idempotentes y los esquemas de eventos no se modifican de forma incompatible. Un cambio incompatible crea una nueva versión de evento y mantiene consumidores anteriores durante la migración.
