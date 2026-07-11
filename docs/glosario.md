# Glosario oficial de CuzoNet

| Término | Definición oficial |
|---|---|
| Cliente | Persona o empresa registrada administrativamente. Puede contratar uno o varios servicios, pero no equivale a una conexión de red. |
| Servicio | Contrato de acceso WISP de un cliente, con plan, ciclo de vida, fecha de cobro y configuración técnica asociada. |
| Plan | Oferta comercial versionada que define precio y capacidad. Un servicio referencia una versión específica para preservar historial. |
| Provisioning | Módulo y conjunto de casos de uso que decide y rastrea altas, bajas, suspensión, reactivación y cambios técnicos de un servicio. |
| Nodo | Sitio operativo de red con ubicación física, desde el que pueden depender torres, sectores, enlaces o equipos. |
| Torre | Estructura física de un nodo que aloja sectores y equipos de radio. |
| Sector | Área de cobertura asociada a una torre y normalmente a un AP o radio de acceso. |
| CPE | Equipo instalado en las instalaciones del cliente que conecta su servicio con la red WISP. Es un activo de inventario. |
| Operación de red | Solicitud persistente y rastreable para cambiar la proyección técnica de un servicio, por ejemplo crear una Queue o reactivarla. |
| Evento | Hecho de dominio inmutable, versionado y persistido en Outbox, como `PaymentRecorded.v1`. No es un comando. |
| Worker | Proceso de Infrastructure que procesa eventos u operaciones en segundo plano. No toma decisiones de negocio. |
| Router | Activo de red que puede ejecutar RouterOS y administrar recursos técnicos. Su configuración observada no sustituye el estado de negocio del Backend. |
| Estado administrativo | Estado del registro Cliente: activo o archivado. No determina por sí mismo si hay Internet. |
| Estado de servicio | Estado de ciclo de vida del Servicio: pendiente, activo, suspendido, cancelado o fallido. Es una decisión de negocio. |
| Estado técnico | Resultado o progreso de una operación y de su proyección de red: en cola, ejecutándose, exitoso, fallido o pendiente de reconciliación. |
| Fuente de verdad | Sistema autoritativo para una decisión. En CuzoNet, el Backend y su base de datos son la fuente de verdad del negocio. |
| Outbox | Tabla transaccional donde se guardan eventos junto al cambio de estado antes de que un worker los publique. |
| Idempotencia | Propiedad por la cual repetir una solicitud o evento produce el mismo resultado lógico sin duplicar pagos, servicios u operaciones. |
| Reconciliación | Comparación controlada entre el estado deseado del Backend y el estado observado en un proveedor, como RouterOS. |
