import { ROUTEROS_MANGLE_RULE_DEFAULTS } from '../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { NormalizedFields } from '../../domain/synchronization/normalized-resource-record.js';
import type { SyncResourceType } from '../../domain/synchronization/sync-resource-type.js';

/**
 * Campos que el router MATERIALIZA SIEMPRE y que el estado deseado puede omitir.
 *
 * El estado real se lee del router, así que un campo con default siempre llega con valor.
 * El estado deseado se declara —por historial de aprovisionamiento o por el almacén
 * declarativo— y puede no mencionarlo. El comparador diffea `desired[k] ?? ''` contra
 * `actual[k] ?? ''`, de modo que la omisión se lee como cadena vacía y produce un drift
 * permanente e irreparable: reaplicar la configuración no cambia nada porque el router ya
 * está como se pidió.
 *
 * `passthrough` de Mangle es el único caso confirmado contra RouterOS 7.21.4: la sonda de
 * la Fase 0 lo devolvió en el 100% de las reglas. Omitirlo en el deseado significa "el
 * default del router", no "sin valor" — la misma lectura que la Fase 4 fijó en
 * `isEquivalent` del adapter. Esta tabla mantiene ambos lados de acuerdo.
 *
 * Solo se rellenan defaults OBSERVADOS. No se inventa ninguno para el resto de campos:
 * un campo opcional ausente en los dos lados ya compara igual y no necesita tabla.
 */
const DESIRED_FIELD_DEFAULTS: Partial<Record<SyncResourceType, NormalizedFields>> = {
  'mangle-rule': { passthrough: String(ROUTEROS_MANGLE_RULE_DEFAULTS.passthrough) },
};

/** Completa los campos deseados con los defaults observados del recurso. Un valor declarado siempre gana. */
export function withDesiredFieldDefaults(
  resourceType: SyncResourceType,
  fields: NormalizedFields,
): NormalizedFields {
  const defaults = DESIRED_FIELD_DEFAULTS[resourceType];
  return defaults === undefined ? fields : { ...defaults, ...fields };
}
