# Catálogo de eventos de dominio

## Propósito y autoridad

Este documento es la fuente oficial para eventos de dominio de CuzoNet. Complementa ADR-003. Un evento solo se agrega o modifica mediante ADR si el cambio es estructural; un cambio incompatible crea una nueva versión.

El productor siempre es un caso de uso de `application/` después de confirmar una transición de dominio. Infrastructure persiste y entrega el evento mediante Outbox, pero no decide ni produce eventos de dominio por iniciativa propia.

## Contrato común

Todo evento contiene `eventId` UUID, `eventType`, `schemaVersion`, `occurredAt` en UTC, `aggregateType`, `aggregateId`, `correlationId`, `causationId` y `payload`. El nombre público sigue `PascalCase.vN`.

| Evento | Productor de Application | Consumidores autorizados | Idempotencia |
|---|---|---|---|
| `ClientCreated.v1` | `Clients.CreateClient` | Analytics, Automation, integración n8n opcional | `eventId` + nombre de consumidor; no vuelve a crear el cliente. |
| `PlanVersionCreated.v1` | `Plans.CreatePlan` o `Plans.RevisePlan` | Analytics, Automation | Entrega registrada; la versión de plan es única por plan y número. |
| `ServiceCreated.v1` | `Services.CreateService` | Provisioning, Analytics | El consumidor usa el `serviceId`; una solicitud duplicada no crea otro servicio por la misma clave de idempotencia. |
| `ServicePlanChanged.v1` | `Provisioning.ChangePlan` | Provisioning worker, Analytics | La transición requiere versión destino distinta y un único historial por operación. |
| `PaymentRecorded.v1` | `Billing.RecordPayment` | Automation, Analytics, integración n8n opcional | La referencia externa y la clave HTTP evitan registrar el pago dos veces; cada consumidor registra entrega. |
| `ProvisioningOperationQueued.v1` | `Provisioning.RequestOperation` | Worker de Provisioning | El worker reclama una operación por `operationId`; estado y bloqueo evitan ejecuciones concurrentes. |
| `ServiceSuspended.v1` | `Provisioning.CompleteSuspension` | Analytics, Automation, integración n8n opcional | Solo se emite al completar una transición válida a `suspended`; repetir la confirmación no crea otro evento. |
| `ServiceReactivated.v1` | `Provisioning.CompleteReactivation` | Analytics, Automation, integración n8n opcional | Solo se emite al completar una transición válida a `active`. |
| `SimpleQueueCreated.v1` | `Provisioning.CompleteNetworkOperation` | Analytics, sincronización de red | El recurso remoto es único por router, tipo y `remote_id`; repetir la respuesta actualiza observación, no duplica Queue. |
| `NetworkOperationFailed.v1` | `Provisioning.FailOperation` | Observability, Automation, integración n8n opcional | Se emite una vez por intento fallido identificado; las alertas se deduplican por operación e intento. |

## Reglas de evolución

1. El payload de una versión publicada es compatible hacia atrás: solo campos opcionales nuevos.
2. Un cambio de significado, eliminación o tipo incompatible requiere un nuevo `vN`.
3. Los consumidores declaran explícitamente las versiones que aceptan.
4. El Outbox entrega al menos una vez; cada consumidor debe tolerar duplicados y reintentos.
5. Un evento nunca contiene contraseñas, tokens, credenciales RouterOS ni datos de pago sensibles.
6. Los eventos no son comandos: describen un hecho ya aceptado, no una instrucción a ejecutar.

## Relación con n8n

Los flujos n8n nuevos pueden consumir una copia autorizada de eventos mediante HTTP y confirmar el procesamiento. Los flujos existentes permanecen fuera de este contrato hasta que exista una migración aprobada.
