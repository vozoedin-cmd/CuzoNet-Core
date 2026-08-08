/**
 * Field names shared between the actual-state reader (RouterOs*Rule shapes)
 * and the desired-state repository (raw request payload shapes) for the
 * three rule-based resources — both use identical camelCase keys for the
 * same concepts, so one shared table avoids the two ever silently drifting
 * apart and comparing the wrong fields.
 *
 * Qué NO entra aquí, y por qué:
 *
 * - `disabled` sí se compara, pero viaja como campo propio de
 *   `NormalizedResourceRecord`, no dentro de `fields`. El comparador lo
 *   diffea aparte y lo reporta con ese mismo nombre en `differingFields`.
 * - `dynamic`, `invalid`, `bytes`, `packets` y `physicalIndex` son de SOLO
 *   LECTURA: los impone el router y nadie puede declararlos. Compararlos
 *   dejaría toda regla con tráfico en drift permanente, y el contador
 *   cambiaría entre dos lecturas seguidas.
 * - `ownership` y `.id` no son configuración: son identidad. La referencia
 *   administrada ya la lleva `NormalizedResourceRecord.reference`.
 * - `comment` queda fuera a propósito en los tres recursos de reglas: carga
 *   el marcador técnico de propiedad, así que compararlo convertiría el
 *   propio marcador en drift. Consecuencia asumida: el comentario de usuario
 *   NO forma parte del estado deseado de una regla y cambiarlo en el router
 *   no se reporta. En address-list sí se compara, porque allí la identidad
 *   es la clave natural `list:address` y el comentario es solo del usuario.
 */
export const RULE_FIELD_NAMES: Record<'filter-rule' | 'nat-rule' | 'mangle-rule' | 'raw-rule', readonly string[]> = {
  'filter-rule': [
    'chain',
    'action',
    'protocol',
    'srcAddress',
    'dstAddress',
    'srcPort',
    'dstPort',
    'inInterface',
    'outInterface',
    'connectionState',
  ],
  // `passthrough` es el único campo con default materializado por el router; el estado
  // deseado lo completa en `desired-state-normalization.ts` antes de comparar.
  'mangle-rule': [
    'chain',
    'action',
    'protocol',
    'srcAddress',
    'dstAddress',
    'srcPort',
    'dstPort',
    'inInterface',
    'outInterface',
    'connectionState',
    'connectionMark',
    'packetMark',
    'routingMark',
    'newConnectionMark',
    'newPacketMark',
    'newRoutingMark',
    'passthrough',
  ],
  /**
   * Raw se ejecuta ANTES del connection tracking, asi que no lleva `connectionState` ni
   * marcas de conexion: la sonda de la Fase 0-bis vio al router rechazarlas con
   * `unknown parameter`. `packetMark` SI entra, porque ahi si existe como matcher.
   *
   * `log` es booleano y el router lo OMITE cuando es falso, asi que "false" y "ausente" son
   * el mismo estado. La equivalencia se resuelve canonizando ambos lados en
   * `desired-state-normalization.ts`, no con un default inventado.
   */
  'raw-rule': [
    'chain',
    'action',
    'protocol',
    'srcAddress',
    'dstAddress',
    'srcPort',
    'dstPort',
    'inInterface',
    'outInterface',
    'srcAddressList',
    'dstAddressList',
    'tcpFlags',
    'packetMark',
    'log',
    'logPrefix',
    'jumpTarget',
    'addressList',
    'addressListTimeout',
  ],
  'nat-rule': [
    'chain',
    'action',
    'protocol',
    'srcAddress',
    'dstAddress',
    'srcPort',
    'dstPort',
    'inInterface',
    'outInterface',
    'connectionState',
    'toAddresses',
    'toPorts',
  ],
};
