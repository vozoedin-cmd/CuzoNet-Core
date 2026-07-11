# ADR-005: MikroTik como adaptador de red

- Estado: Aceptado
- Fecha: 2026-07-10

## Contexto

RouterOS administra la configuración efectiva de red, pero no contiene el historial financiero ni las reglas de negocio de CuzoNet.

## Decisión

MikroTik se implementa como adaptador de infraestructura detrás de puertos de Application. Sus áreas se separan en cliente, comandos, queues, PPPoE, Hotspot, firewall, scripts, sincronización y workers. La primera implementación cubre Simple Queue.

Cada recurso remoto se registra con router, tipo, identificador remoto, configuración aplicada, hash, estado y fecha de reconciliación. Los nombres de recursos son deterministas, pero nunca son su única identidad. Las credenciales permanecen fuera de logs y se cifran o se obtienen de secretos de entorno.

## Consecuencias

Las fallas del router dejan una operación pendiente o fallida, nunca un pago perdido. El sistema puede reintentar, reconciliar y agregar otro proveedor de red mediante un adaptador equivalente.
