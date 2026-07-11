# ADR-013: Separación entre creación de Service y Provisioning técnico

- Estado: Aceptado
- Fecha: 2026-07-11

## Contexto

El contrato HTTP inicial combinaba en `POST /clientes/{clientId}/servicios` dos decisiones con propietarios distintos: crear el contrato lógico de un servicio y encolar su alta técnica. Por esa razón el request de creación exigía `routerId`, admitía referencias de IP y dirección técnica, y respondía `202 Accepted` con un `operationId` de Provisioning.

Esta combinación obliga a Services a conocer detalles operativos y hace que la creación del agregado dependa de la existencia de Provisioning. También confunde tres identidades distintas: el Service creado, el evento que registra el hecho y la operación técnica ejecutable.

ADR-004 ya establece que Provisioning es dueño del ciclo de vida técnico y que crea operaciones persistentes. ADR-005 establece que MikroTik es únicamente un adaptador detrás de puertos de Application. El contrato público debe reflejar esas fronteras.

## Decisión

Services es el único dueño de crear y persistir el agregado Service. La creación valida las referencias de negocio, guarda el Service con `lifecycleStatus: pending`, registra `ServiceCreated.v1` y responde sin iniciar ni representar una operación técnica.

`POST /clientes/{clientId}/servicios`:

- recibe únicamente `planVersionId`, `serviceType` y `billingDay`;
- responde `201 Created` con el recurso `Service`;
- no recibe router, IP ni parámetros propios de un adaptador;
- no genera ni devuelve `operationId`.

Provisioning es el único dueño de solicitar y persistir operaciones técnicas. El comando público provider-neutral será `POST /servicios/{serviceId}/operaciones`. Para el alta inicial recibe una operación de tipo `provision` y las referencias técnicas necesarias. Solo después de crear la operación persistente responde `202 Accepted` con `OperationAccepted`.

La operación de Provisioning es un recurso independiente y se consulta mediante `GET /operaciones/{operationId}`. La selección de MikroTik u otro proveedor ocurre detrás de los puertos de Provisioning y nunca forma parte de la ruta pública.

Las identidades tienen significados independientes:

- `serviceId` identifica el contrato lógico;
- `eventId` identifica `ServiceCreated.v1`;
- `operationId` identifica una operación persistente de Provisioning.

Ninguna de ellas se reutiliza para representar otra. `ServiceCreated.v1` describe un hecho ya confirmado. Aunque Provisioning sea un consumidor autorizado del evento, consumirlo no crea automáticamente una operación: el comando explícito de Provisioning es el disparador autoritativo y debe ser idempotente.

Las rutas públicas `/mikrotik/simplequeue`, `/mikrotik/suspender` y `/mikrotik/reactivar` filtran el adaptador técnico al contrato. Al encontrarse la API en versión `1.0.0-draft`, se retiran del borrador y se reemplazan por operaciones provider-neutral asociadas al Service. MikroTik permanece como adaptador interno y no cambia su responsabilidad definida por ADR-005.

## Consecuencias

Un Service puede existir en estado `pending` sin que haya una operación técnica. La indisponibilidad de Provisioning o del router no revierte la creación del contrato lógico.

La creación del Service y la solicitud de Provisioning usan claves de idempotencia independientes. Reintentar una creación no duplica el Service; reintentar una solicitud técnica no duplica la operación.

Services no importa puertos de red ni tipos de MikroTik. Provisioning referencia un Service existente, valida su estado, crea la operación y decide qué adaptador ejecutar.

El cambio de `202 OperationAccepted` a `201 Service` y la reducción de `ServiceCreateRequest` son incompatibles si el contrato ya tuviera consumidores externos. Mientras `1.0.0` permanezca en borrador se corrige v1 directamente. Si existieran consumidores publicados, deberán coexistir contratos versionados o introducirse `/api/v2` antes de retirar el comportamiento anterior.
