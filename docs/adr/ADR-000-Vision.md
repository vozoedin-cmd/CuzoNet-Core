# ADR-000: Visión del sistema

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

CuzoNet es un ERP especializado para un WISP. Debe administrar clientes, servicios de Internet, facturación, aprovisionamiento técnico, inventario, topología de red, automatizaciones, analítica e integraciones sin depender de la lógica de n8n ni del estado transitorio de un router.

Los flujos existentes de n8n funcionan y no se modifican como parte de este proyecto.

## Decisión

CuzoNet se construirá como un monolito modular con Arquitectura Limpia. El Backend y su base de datos son la fuente única de verdad de las decisiones de negocio. MikroTik, OpenAI, n8n, WhatsApp y otros proveedores son adaptadores externos.

Principios obligatorios:

1. El dominio no depende de frameworks, base de datos ni proveedores.
2. Todo cambio de estado de negocio se realiza mediante un caso de uso validado y auditado.
3. Las operaciones externas se solicitan mediante eventos persistentes e idempotentes.
4. Los datos financieros conservan historial y no se reescriben.
5. n8n integra por HTTP; no contiene reglas de negocio ni accede a la base de datos.
6. MikroTik refleja el estado operativo solicitado; no decide pagos, mora ni estados de cliente.

## Alcance inicial

La primera fase incluye clientes, planes, servicios, Provisioning y Simple Queue. Pagos, automatización avanzada, IA, inventario completo, topología y analítica evolucionan por fases sin cambiar estas fronteras.

## Consecuencias

La solución requiere contratos, eventos, auditoría y pruebas desde el inicio. A cambio, un cambio de motor de base de datos o proveedor de router no debe modificar reglas de facturación, clientes ni aprovisionamiento.
