# Revisión final de consistencia arquitectónica

- Fecha: 2026-07-10
- Resultado: Conforme, con aclaraciones documentales incorporadas.

## Alcance revisado

Se contrastaron ADR, modelo relacional, OpenAPI y README contra las reglas de ADR-001, ADR-002 y ADR-003. La fuente de términos es `glosario.md`; el catálogo de eventos y los agregados se documentan en archivos dedicados para evitar ambigüedad futura.

## Consistencia de nombres y fronteras

| Concepto | Decisión verificada |
|---|---|
| Cliente | Entidad administrativa `clients`; no representa por sí sola una conexión de Internet. |
| Servicio | `client_services`; contrato y ciclo de vida del acceso WISP. |
| Provisioning | Caso de uso dueño de las operaciones técnicas; no es sinónimo de MikroTik. |
| MikroTik | Adaptador de Infrastructure y proyección técnica, no fuente de estado. |
| Evento | Hecho versionado `PascalCase.vN`, almacenado en Outbox. |
| n8n | Integración HTTP para flujos nuevos; no tiene acceso a datos ni reglas de negocio. |
| Dashboard y reportes | Read models de Analytics, no fuentes de verdad. |

## Correspondencia endpoint → caso de uso

| Rutas OpenAPI | Caso de uso de Application |
|---|---|
| `GET/POST /clientes` | `ListClients`, `CreateClient` |
| `GET/PUT/DELETE /clientes/{clientId}` | `GetClient`, `UpdateClient`, `ArchiveClient` |
| `GET/POST /clientes/{clientId}/servicios` | `ListClientServices`, `CreateService` y solicitud de alta |
| `GET/POST/PUT /planes` | `ListPlans`, `CreatePlan`, `RevisePlan` |
| `GET/POST /pagos` | `ListPayments`, `RecordPayment` |
| `GET /clientes/{clientId}/cuenta` | `GetAccountSummary` |
| `POST /mikrotik/*` | `RequestSimpleQueue`, `RequestSuspension`, `RequestReactivation` de Provisioning |
| `GET /operaciones/{operationId}` | `GetProvisioningOperation` |
| `GET /dashboard`, `GET /reportes/*` | `GetDashboard`, `GenerateClientReport`, `GenerateRevenueReport` |
| `GET/POST /integraciones/n8n/*` | `PullIntegrationEvents`, `AcknowledgeIntegrationEvent` |
| `POST /ia/mensajes` | `ProcessAiMessage` con herramientas restringidas |
| `GET /health`, `POST /auth/login` | Casos técnicos de disponibilidad y acceso; no contienen lógica comercial. |

Las rutas `/mikrotik/*` son fachadas de compatibilidad del contrato público. Sus controladores delegan a Provisioning; no invocan RouterOS directamente.

## Eventos y agregados

- El catálogo con nombre, versión, productor, consumidores e idempotencia está en `event-catalog.md`.
- Las responsabilidades, invariantes y eventos de cada agregado están en `domain-model.md`.
- Infrastructure publica el Outbox y ejecuta adaptadores; no produce decisiones ni eventos de negocio sin pasar por Application.

## Verificación de capas

1. `domain` no depende de API, persistencia, n8n, OpenAI ni RouterOS.
2. `application` orquesta casos de uso y define puertos; es la única capa que coordina agregados.
3. `infrastructure` implementa repositorios, Outbox, workers, Scheduler, observabilidad y adaptadores externos.
4. `api` autentica, valida la forma HTTP y delega; no contiene consultas SQL ni reglas de negocio.

## Conclusión

No se detectó una contradicción que requiera cambiar la arquitectura aprobada. La única aclaración añadida fue declarar como oficiales el catálogo de eventos y el modelo de agregados. La arquitectura queda congelada bajo la regla de cambio registrada en `README.md`.
