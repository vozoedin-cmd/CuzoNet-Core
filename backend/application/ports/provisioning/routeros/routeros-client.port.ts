import type { RouterConnectionProfile } from './router-connection-resolver.port.js';

export interface RouterOsSimpleQueueReference {
  readonly id?: string;
  readonly name?: string;
}

export interface RouterOsSimpleQueue {
  readonly comment?: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly maxLimit: string;
  readonly name: string;
  readonly target: string;
}

export interface RouterOsSimpleQueueCreateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly maxLimit: string;
  readonly name: string;
  readonly target: string;
}

export interface RouterOsSimpleQueueUpdateData {
  readonly comment?: string;
  readonly maxLimit?: string;
  readonly name?: string;
  readonly target?: string;
}

export interface RouterOsPppoeSecretReference {
  readonly id?: string;
  readonly name?: string;
}

export interface RouterOsPppoeSecret {
  readonly comment?: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly name: string;
  readonly password?: string;
  readonly profile: string;
  readonly service: string;
}

export interface RouterOsPppoeSecretCreateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly name: string;
  readonly password?: string;
  readonly profile: string;
  readonly service?: string;
}

export interface RouterOsPppoeSecretUpdateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly name?: string;
  readonly password?: string;
  readonly profile?: string;
  readonly service?: string;
}

export interface RouterOsHotspotUserReference {
  readonly id?: string;
  readonly name?: string;
}

export interface RouterOsHotspotUser {
  readonly comment?: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly limitBytesTotal?: number;
  readonly limitUptime?: string;
  readonly name: string;
  readonly password?: string;
  readonly profile: string;
  readonly server?: string;
  readonly sharedUsers?: number;
}

export interface RouterOsHotspotUserCreateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly limitBytesTotal?: number;
  readonly limitUptime?: string;
  readonly name: string;
  readonly password: string;
  readonly profile: string;
  readonly server?: string;
  readonly sharedUsers?: number;
}

export interface RouterOsHotspotUserUpdateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly limitBytesTotal?: number;
  readonly limitUptime?: string;
  readonly name?: string;
  readonly password?: string;
  readonly profile?: string;
  readonly server?: string;
  readonly sharedUsers?: number;
}

export interface RouterOsAddressListEntryReference {
  readonly address?: string;
  readonly id?: string;
  readonly list?: string;
}

export interface RouterOsAddressListEntry {
  readonly address: string;
  readonly comment?: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly list: string;
  readonly timeout?: string;
}

export interface RouterOsAddressListEntryCreateData {
  readonly address: string;
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly list: string;
  readonly timeout?: string;
}

export interface RouterOsAddressListEntryUpdateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly timeout?: string;
}

export interface RouterOsFilterRuleReference {
  readonly id?: string;
  readonly ruleReference?: string;
}

export interface RouterOsFilterRule {
  readonly action: string;
  readonly chain: string;
  readonly comment?: string;
  readonly connectionState?: string;
  readonly disabled: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly id: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  readonly protocol?: string;
  readonly ruleReference?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
}

export interface RouterOsFilterRuleCreateData {
  readonly action: string;
  readonly chain: string;
  readonly comment: string;
  readonly connectionState?: string;
  readonly disabled?: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  /** .id of the existing rule this one should be inserted before; omit to append at the end. */
  readonly placeBeforeId?: string;
  readonly protocol?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
}

export interface RouterOsFilterRuleUpdateData {
  readonly action?: string;
  readonly chain?: string;
  readonly comment?: string;
  readonly connectionState?: string;
  readonly disabled?: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  readonly protocol?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
}

export interface RouterOsFilterRuleMoveTarget {
  /** .id of the rule the moved rule should be inserted before; omit to move to the end. */
  readonly placeBeforeId?: string;
}

export interface RouterOsNatRuleReference {
  readonly id?: string;
  readonly ruleReference?: string;
}

export interface RouterOsNatRule {
  readonly action: string;
  readonly chain: string;
  readonly comment?: string;
  readonly connectionState?: string;
  readonly disabled: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly id: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  readonly protocol?: string;
  readonly ruleReference?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
  readonly toAddresses?: string;
  readonly toPorts?: string;
}

export interface RouterOsNatRuleCreateData {
  readonly action: string;
  readonly chain: string;
  readonly comment: string;
  readonly connectionState?: string;
  readonly disabled?: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  /** .id of the existing rule this one should be inserted before; omit to append at the end. */
  readonly placeBeforeId?: string;
  readonly protocol?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
  readonly toAddresses?: string;
  readonly toPorts?: string;
}

export interface RouterOsNatRuleUpdateData {
  readonly action?: string;
  readonly chain?: string;
  readonly comment?: string;
  readonly connectionState?: string;
  readonly disabled?: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  readonly protocol?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
  readonly toAddresses?: string;
  readonly toPorts?: string;
}

export interface RouterOsNatRuleMoveTarget {
  /** .id of the rule the moved rule should be inserted before; omit to move to the end. */
  readonly placeBeforeId?: string;
}

export interface RouterOsClientPort {
  close(): Promise<void>;

  createSimpleQueue(queue: RouterOsSimpleQueueCreateData): Promise<void>;
  disableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  enableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  findSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<RouterOsSimpleQueue | null>;
  removeSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  updateSimpleQueue(reference: RouterOsSimpleQueueReference, data: RouterOsSimpleQueueUpdateData): Promise<void>;

  createPppoeSecret(secret: RouterOsPppoeSecretCreateData): Promise<void>;
  disablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void>;
  enablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void>;
  findPppoeSecret(reference: RouterOsPppoeSecretReference): Promise<RouterOsPppoeSecret | null>;
  removePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void>;
  updatePppoeSecret(reference: RouterOsPppoeSecretReference, data: RouterOsPppoeSecretUpdateData): Promise<void>;

  createHotspotUser(user: RouterOsHotspotUserCreateData): Promise<void>;
  disableHotspotUser(reference: RouterOsHotspotUserReference): Promise<void>;
  enableHotspotUser(reference: RouterOsHotspotUserReference): Promise<void>;
  findHotspotUser(reference: RouterOsHotspotUserReference): Promise<RouterOsHotspotUser | null>;
  removeHotspotUser(reference: RouterOsHotspotUserReference): Promise<void>;
  updateHotspotUser(reference: RouterOsHotspotUserReference, data: RouterOsHotspotUserUpdateData): Promise<void>;

  createAddressListEntry(entry: RouterOsAddressListEntryCreateData): Promise<void>;
  disableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void>;
  enableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void>;
  findAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<RouterOsAddressListEntry | null>;
  removeAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void>;
  updateAddressListEntry(
    reference: RouterOsAddressListEntryReference,
    data: RouterOsAddressListEntryUpdateData,
  ): Promise<void>;

  createFilterRule(rule: RouterOsFilterRuleCreateData): Promise<void>;
  disableFilterRule(reference: RouterOsFilterRuleReference): Promise<void>;
  enableFilterRule(reference: RouterOsFilterRuleReference): Promise<void>;
  findFilterRule(reference: RouterOsFilterRuleReference): Promise<RouterOsFilterRule | null>;
  /** Global, physically-ordered listing of all filter rules (across every chain), used to resolve position/move targets. */
  listFilterRules(): Promise<RouterOsFilterRule[]>;
  moveFilterRule(reference: RouterOsFilterRuleReference, target: RouterOsFilterRuleMoveTarget): Promise<void>;
  removeFilterRule(reference: RouterOsFilterRuleReference): Promise<void>;
  updateFilterRule(reference: RouterOsFilterRuleReference, data: RouterOsFilterRuleUpdateData): Promise<void>;

  createNatRule(rule: RouterOsNatRuleCreateData): Promise<void>;
  disableNatRule(reference: RouterOsNatRuleReference): Promise<void>;
  enableNatRule(reference: RouterOsNatRuleReference): Promise<void>;
  findNatRule(reference: RouterOsNatRuleReference): Promise<RouterOsNatRule | null>;
  /** Global, physically-ordered listing of all NAT rules (across srcnat and dstnat), used to resolve position/move targets. */
  listNatRules(): Promise<RouterOsNatRule[]>;
  moveNatRule(reference: RouterOsNatRuleReference, target: RouterOsNatRuleMoveTarget): Promise<void>;
  removeNatRule(reference: RouterOsNatRuleReference): Promise<void>;
  updateNatRule(reference: RouterOsNatRuleReference, data: RouterOsNatRuleUpdateData): Promise<void>;
}

export interface RouterOsClientFactoryPort {
  create(profile: RouterConnectionProfile, secret: string): Promise<RouterOsClientPort>;
}
