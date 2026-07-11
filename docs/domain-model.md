# Agregados, responsabilidades e invariantes

## Regla de consistencia

Cada agregado protege invariantes locales en `domain/`. Los casos de uso de `application/` coordinan más de un agregado, puertos, eventos y transacciones. Infrastructure implementa adaptadores y nunca decide transiciones de negocio.

| Agregado | Responsabilidad | Invariantes principales | Eventos emitidos |
|---|---|---|---|
| Cliente | Identidad administrativa, contactos, direcciones y notas. | Documento único por empresa mientras no esté archivado; contactos y direcciones pertenecen a un único cliente; un cliente archivado no acepta nuevos servicios. | `ClientCreated.v1` |
| Plan | Oferta comercial versionada. | Código único por empresa; una versión es inmutable; velocidades y precio no son negativos; un servicio conserva la versión contratada. | `PlanVersionCreated.v1` |
| Servicio | Contrato WISP y estado de ciclo de vida solicitado. | Pertenece a un cliente y plan-version; solo permite transiciones de estado válidas; no se cancela con operación en ejecución. | `ServiceCreated.v1`, `ServicePlanChanged.v1`, `ServiceSuspended.v1`, `ServiceReactivated.v1` |
| Cuenta de facturación | Relación financiera de un servicio. | Una cuenta activa por servicio y moneda; la deuda se deriva, no se edita. | Ninguno en la fase inicial. |
| Factura | Documento de cobro. | Tiene cuenta y líneas; su total equivale a sus líneas; una factura cancelada conserva historial; las asignaciones no superan su saldo. | Ninguno en la fase inicial. |
| Pago | Dinero recibido y su distribución. | Importe positivo; referencia externa única cuando exista; las asignaciones no superan el importe; un pago registrado no se borra. | `PaymentRecorded.v1` |
| Operación de Provisioning | Intención y resultado de un cambio técnico. | Pertenece a un servicio; tipo y transición válidos; una operación reclamada no se ejecuta en paralelo; sus reintentos son trazables. | `ProvisioningOperationQueued.v1`, `SimpleQueueCreated.v1`, `NetworkOperationFailed.v1` |
| Activo de red | Equipo físico individual. | Serial o MAC únicos cuando estén presentes; una asignación incompatible no puede solaparse; historial de asignación inmutable. | Ninguno en la fase inicial. |
| Topología de red | Nodo, torre, sector y enlace. | Un sector pertenece a una torre; un enlace tiene extremos válidos; la topología no altera la identidad del activo. | Ninguno en la fase inicial. |
| Regla de automatización | Regla declarativa sobre hechos de dominio. | Tiene evento disparador conocido, versión y definición válida; solo acciones permitidas; nunca ejecuta código arbitrario. | Ninguno; consume eventos. |

## Estados que no deben confundirse

- El estado administrativo pertenece a Cliente y controla si el registro está vigente o archivado.
- El estado de ciclo de vida pertenece a Servicio y expresa la decisión de negocio: pendiente, activo, suspendido, cancelado o fallido.
- El estado técnico pertenece a una Operación de Provisioning o a la proyección MikroTik: en cola, ejecutándose, exitoso, fallido o pendiente de reconciliación.

## Orquestación permitida

`application/` es la única capa que puede coordinar varios agregados. Ejemplos: registrar pago y guardar `PaymentRecorded.v1`; evaluar una regla y solicitar reactivación; convertir una solicitud de Simple Queue en una operación persistente.

El adaptador MikroTik únicamente recibe una operación ya aprobada y devuelve un resultado técnico. API únicamente convierte HTTP a un caso de uso. Ninguna de las dos capas elige reglas de mora, cambios de estado o elegibilidad de reactivación.
