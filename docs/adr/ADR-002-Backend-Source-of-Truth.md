# ADR-002: Backend como fuente única de verdad

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

Un router puede estar sin conexión, n8n puede reintentar una solicitud y una automatización puede fallar después de registrar un pago. Ninguno de esos sistemas debe determinar el estado definitivo del cliente o de su deuda.

## Decisión

La base de datos del Backend conserva el estado autoritativo de clientes, servicios, facturación, reglas, operaciones solicitadas y auditoría. RouterOS es una proyección técnica del estado deseado; n8n es un consumidor y emisor HTTP de integraciones.

Las divergencias se registran y se corrigen mediante sincronización y reconciliación. Un recurso remoto se vincula al servicio mediante su identificador de RouterOS y nunca solo por su nombre visible.

## Consecuencias

No se infiere un pago, una suspensión o una reactivación a partir de un mensaje de WhatsApp o una Simple Queue. Los procesos externos reciben una operación o evento, no autoridad sobre la decisión de negocio.
