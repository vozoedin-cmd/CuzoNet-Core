# ADR-004: Provisioning como dueño del ciclo de vida técnico

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

Alta, suspensión, reactivación, cambio de plan, velocidad, IP, router y baja son decisiones operativas sobre un servicio. Si Billing, n8n o MikroTik ejecutan estas decisiones directamente, se duplican reglas y se pierde trazabilidad.

## Decisión

El módulo Provisioning será el dueño del ciclo de vida técnico del servicio. Recibe comandos de alto nivel, valida transiciones de estado, crea una operación persistente y solicita al puerto de red la acción necesaria. El adaptador MikroTik solo ejecuta la operación técnica.

Billing determina la situación financiera; Automation puede reaccionar a eventos; ninguno modifica RouterOS de forma directa. Provisioning emite eventos de solicitud, éxito, fallo y reconciliación.

## Consecuencias

Cada cambio operativo tiene identificador, estado, reintentos y auditoría. Nuevos proveedores de acceso se incorporan implementando el puerto de Provisioning, sin alterar políticas de facturación.
