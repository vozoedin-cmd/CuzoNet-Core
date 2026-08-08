/**
 * Recursos que el Synchronization Engine sabe reconciliar.
 *
 * CAMBIO DE COMPORTAMIENTO al añadir uno: `GenerateReconciliationPlan` recorre esta lista
 * completa cuando la petición no trae `resourceTypes`, así que toda llamada existente sin
 * filtro empieza a leer también el recurso nuevo del router. Para `raw-rule` eso significa un
 * `/ip/firewall/raw/print` adicional por plan.
 */
export const SYNC_RESOURCE_TYPES = [
  'simple-queue',
  'address-list-entry',
  'filter-rule',
  'nat-rule',
  'mangle-rule',
  'raw-rule',
] as const;

export type SyncResourceType = (typeof SYNC_RESOURCE_TYPES)[number];
