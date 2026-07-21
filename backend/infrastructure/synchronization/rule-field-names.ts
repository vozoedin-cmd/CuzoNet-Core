/**
 * Field names shared between the actual-state reader (RouterOs*Rule shapes)
 * and the desired-state repository (raw request payload shapes) for the
 * three rule-based resources — both use identical camelCase keys for the
 * same concepts, so one shared table avoids the two ever silently drifting
 * apart and comparing the wrong fields.
 */
export const RULE_FIELD_NAMES: Record<'filter-rule' | 'nat-rule' | 'mangle-rule', readonly string[]> = {
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
