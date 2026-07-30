import type {
  RouterOsClientPort,
  RouterOsSimpleQueue,
  RouterOsSimpleQueueCreateData,
  RouterOsSimpleQueueReference,
  RouterOsSimpleQueueUpdateData,
  RouterOsPppoeSecret,
  RouterOsPppoeSecretCreateData,
  RouterOsPppoeSecretReference,
  RouterOsPppoeSecretUpdateData,
  RouterOsHotspotUser,
  RouterOsHotspotUserCreateData,
  RouterOsHotspotUserReference,
  RouterOsHotspotUserUpdateData,
  RouterOsHotspotUserProfile,
  RouterOsHotspotUserProfileCreateData,
  RouterOsHotspotUserProfileReference,
  RouterOsHotspotUserProfileUpdateData,
  RouterOsAddressListEntry,
  RouterOsAddressListEntryCreateData,
  RouterOsAddressListEntryReference,
  RouterOsAddressListEntryUpdateData,
  RouterOsFilterRule,
  RouterOsFilterRuleCreateData,
  RouterOsFilterRuleMoveTarget,
  RouterOsFilterRuleReference,
  RouterOsFilterRuleUpdateData,
  RouterOsNatRule,
  RouterOsNatRuleCreateData,
  RouterOsNatRuleMoveTarget,
  RouterOsNatRuleReference,
  RouterOsNatRuleUpdateData,
  RouterOsMangleRule,
  RouterOsMangleRuleCreateData,
  RouterOsMangleRuleMoveTarget,
  RouterOsMangleRuleReference,
  RouterOsMangleRuleUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import { ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS } from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import { FilterRuleComment } from '../../../domain/provisioning/routeros/value-objects/filter-rule-comment.js';
import { MangleRuleComment } from '../../../domain/provisioning/routeros/value-objects/mangle-rule-comment.js';
import { NatRuleComment } from '../../../domain/provisioning/routeros/value-objects/nat-rule-comment.js';

export class FakeRouterOsClient implements RouterOsClientPort {
  public closed = false;
  public queues: RouterOsSimpleQueue[] = [];
  public secrets: RouterOsPppoeSecret[] = [];
  public hotspotUsers: RouterOsHotspotUser[] = [];
  public hotspotUserProfiles: RouterOsHotspotUserProfile[] = [];
  public addressListEntries: RouterOsAddressListEntry[] = [];
  public filterRules: RouterOsFilterRule[] = [];
  public natRules: RouterOsNatRule[] = [];
  public mangleRules: RouterOsMangleRule[] = [];
  private nextId = 1;

  public async close(): Promise<void> {
    this.closed = true;
  }

  public async createSimpleQueue(queue: RouterOsSimpleQueueCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queueData: RouterOsSimpleQueue = {
      ...(queue.comment !== undefined ? { comment: queue.comment } : {}),
      disabled: queue.disabled ?? false,
      id: `*${this.nextId++}`,
      maxLimit: queue.maxLimit,
      name: queue.name,
      target: queue.target,
    };
    this.queues.push(queueData);
  }

  public async disableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      throw new Error(`Queue not found: ${JSON.stringify(reference)}`);
    }
    const index = this.queues.findIndex((q) => q.id === queue.id);
    this.queues[index] = { ...queue, disabled: true };
  }

  public async enableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      throw new Error(`Queue not found: ${JSON.stringify(reference)}`);
    }
    const index = this.queues.findIndex((q) => q.id === queue.id);
    this.queues[index] = { ...queue, disabled: false };
  }

  public async findSimpleQueue(
    reference: RouterOsSimpleQueueReference,
  ): Promise<RouterOsSimpleQueue | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queue = this.queues.find(
      (q) =>
        (reference.id !== undefined && q.id === reference.id) ||
        (reference.name !== undefined && q.name === reference.name),
    );
    return queue ?? null;
  }

  public async listSimpleQueues(): Promise<RouterOsSimpleQueue[]> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    return [...this.queues];
  }

  public async removeSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      return;
    }
    this.queues = this.queues.filter((q) => q.id !== queue.id);
  }

  public async updateSimpleQueue(
    reference: RouterOsSimpleQueueReference,
    data: RouterOsSimpleQueueUpdateData,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      throw new Error(`Queue not found: ${JSON.stringify(reference)}`);
    }
    const index = this.queues.findIndex((q) => q.id === queue.id);
    const queueData: RouterOsSimpleQueue = {
      ...queue,
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
      ...(data.maxLimit !== undefined ? { maxLimit: data.maxLimit } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.target !== undefined ? { target: data.target } : {}),
    };
    this.queues[index] = queueData;
  }

  public async createPppoeSecret(secret: RouterOsPppoeSecretCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secretData: RouterOsPppoeSecret = {
      ...(secret.comment !== undefined ? { comment: secret.comment } : {}),
      ...(secret.password !== undefined ? { password: secret.password } : {}),
      disabled: secret.disabled ?? false,
      id: `*${this.nextId++}`,
      name: secret.name,
      profile: secret.profile,
      service: secret.service ?? 'pppoe',
    };
    this.secrets.push(secretData);
  }

  public async disablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secret = await this.findPppoeSecret(reference);
    if (!secret) {
      throw new Error(`PPPoE secret not found: ${JSON.stringify(reference)}`);
    }
    const index = this.secrets.findIndex((s) => s.id === secret.id);
    this.secrets[index] = { ...secret, disabled: true };
  }

  public async enablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secret = await this.findPppoeSecret(reference);
    if (!secret) {
      throw new Error(`PPPoE secret not found: ${JSON.stringify(reference)}`);
    }
    const index = this.secrets.findIndex((s) => s.id === secret.id);
    this.secrets[index] = { ...secret, disabled: false };
  }

  public async findPppoeSecret(
    reference: RouterOsPppoeSecretReference,
  ): Promise<RouterOsPppoeSecret | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secret = this.secrets.find(
      (s) =>
        (reference.id !== undefined && s.id === reference.id) ||
        (reference.name !== undefined && s.name === reference.name),
    );
    return secret ?? null;
  }

  public async removePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secret = await this.findPppoeSecret(reference);
    if (!secret) {
      return;
    }
    this.secrets = this.secrets.filter((s) => s.id !== secret.id);
  }

  public async updatePppoeSecret(
    reference: RouterOsPppoeSecretReference,
    data: RouterOsPppoeSecretUpdateData,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secret = await this.findPppoeSecret(reference);
    if (!secret) {
      throw new Error(`PPPoE secret not found: ${JSON.stringify(reference)}`);
    }
    const index = this.secrets.findIndex((s) => s.id === secret.id);
    const secretData: RouterOsPppoeSecret = {
      ...secret,
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.password !== undefined ? { password: data.password } : {}),
      ...(data.profile !== undefined ? { profile: data.profile } : {}),
      ...(data.service !== undefined ? { service: data.service } : {}),
    };
    this.secrets[index] = secretData;
  }

  public async createHotspotUser(user: RouterOsHotspotUserCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const userData: RouterOsHotspotUser = {
      ...(user.comment !== undefined ? { comment: user.comment } : {}),
      ...(user.limitBytesTotal !== undefined ? { limitBytesTotal: user.limitBytesTotal } : {}),
      ...(user.limitUptime !== undefined ? { limitUptime: user.limitUptime } : {}),
      ...(user.server !== undefined ? { server: user.server } : {}),
      disabled: user.disabled ?? false,
      id: `*${this.nextId++}`,
      name: user.name,
      password: user.password,
      profile: user.profile,
    };
    this.hotspotUsers.push(userData);
  }

  public async disableHotspotUser(reference: RouterOsHotspotUserReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const user = await this.findHotspotUser(reference);
    if (!user) {
      return;
    }
    const index = this.hotspotUsers.findIndex((u) => u.id === user.id);
    this.hotspotUsers[index] = { ...user, disabled: true };
  }

  public async enableHotspotUser(reference: RouterOsHotspotUserReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const user = await this.findHotspotUser(reference);
    if (!user) {
      return;
    }
    const index = this.hotspotUsers.findIndex((u) => u.id === user.id);
    this.hotspotUsers[index] = { ...user, disabled: false };
  }

  public async findHotspotUser(
    reference: RouterOsHotspotUserReference,
  ): Promise<RouterOsHotspotUser | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const user = this.hotspotUsers.find(
      (u) =>
        (reference.id !== undefined && u.id === reference.id) ||
        (reference.name !== undefined && u.name === reference.name),
    );
    return user ?? null;
  }

  public async removeHotspotUser(reference: RouterOsHotspotUserReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const user = await this.findHotspotUser(reference);
    if (!user) {
      return;
    }
    this.hotspotUsers = this.hotspotUsers.filter((u) => u.id !== user.id);
  }

  public async updateHotspotUser(
    reference: RouterOsHotspotUserReference,
    data: RouterOsHotspotUserUpdateData,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const user = await this.findHotspotUser(reference);
    if (!user) {
      return;
    }
    const index = this.hotspotUsers.findIndex((u) => u.id === user.id);
    const userData: RouterOsHotspotUser = {
      ...user,
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
      ...(data.disabled !== undefined ? { disabled: data.disabled } : {}),
      ...(data.limitBytesTotal !== undefined ? { limitBytesTotal: data.limitBytesTotal } : {}),
      ...(data.limitUptime !== undefined ? { limitUptime: data.limitUptime } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.password !== undefined ? { password: data.password } : {}),
      ...(data.profile !== undefined ? { profile: data.profile } : {}),
      ...(data.server !== undefined ? { server: data.server } : {}),
    };
    this.hotspotUsers[index] = userData;
  }

  /**
   * Replica el comportamiento observado en RouterOS 7.21.4, no una versión idealizada:
   * los campos omitidos reciben los defaults reales del router, y especificar
   * `macCookieTimeout` fuerza `addMacCookie = true` en silencio. Los tres bugs de la saga
   * anterior (print duplicado, parseo de disabled, shared-users) sobrevivieron a las
   * pruebas precisamente porque el doble era más permisivo que el equipo real.
   */
  public async createHotspotUserProfile(profile: RouterOsHotspotUserProfileCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    if (this.hotspotUserProfiles.some((p) => p.name === profile.name)) {
      throw new Error(`Hotspot user profile already exists: ${profile.name}`);
    }
    const addMacCookie =
      profile.macCookieTimeout !== undefined
        ? true
        : (profile.addMacCookie ?? ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.addMacCookie);

    this.hotspotUserProfiles.push({
      addMacCookie,
      addressList: profile.addressList ?? ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.addressList,
      ...(profile.addressPool !== undefined && profile.addressPool !== 'none'
        ? { addressPool: profile.addressPool }
        : {}),
      id: `*${this.nextId++}`,
      idleTimeout: profile.idleTimeout ?? ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.idleTimeout,
      isDefault: false,
      keepaliveTimeout: profile.keepaliveTimeout ?? ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.keepaliveTimeout,
      macCookieTimeout: profile.macCookieTimeout ?? ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.macCookieTimeout,
      name: profile.name,
      ...(profile.rateLimit !== undefined ? { rateLimit: profile.rateLimit } : {}),
      ...(profile.sessionTimeout !== undefined ? { sessionTimeout: profile.sessionTimeout } : {}),
      sharedUsers: profile.sharedUsers ?? ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.sharedUsers,
      statusAutorefresh: profile.statusAutorefresh ?? ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.statusAutorefresh,
      transparentProxy: profile.transparentProxy ?? ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.transparentProxy,
    });
  }

  public async findHotspotUserProfile(
    reference: RouterOsHotspotUserProfileReference,
  ): Promise<RouterOsHotspotUserProfile | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const found = this.hotspotUserProfiles.find(
      (p) =>
        (reference.id !== undefined && p.id === reference.id) ||
        (reference.name !== undefined && p.name === reference.name),
    );
    return found ?? null;
  }

  public async listHotspotUserProfiles(): Promise<RouterOsHotspotUserProfile[]> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    return [...this.hotspotUserProfiles];
  }

  public async removeHotspotUserProfile(reference: RouterOsHotspotUserProfileReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const profile = await this.findHotspotUserProfile(reference);
    if (!profile) {
      return;
    }
    this.hotspotUserProfiles = this.hotspotUserProfiles.filter((p) => p.id !== profile.id);
  }

  public async updateHotspotUserProfile(
    reference: RouterOsHotspotUserProfileReference,
    data: RouterOsHotspotUserProfileUpdateData,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const profile = await this.findHotspotUserProfile(reference);
    if (!profile) {
      return;
    }
    const index = this.hotspotUserProfiles.findIndex((p) => p.id === profile.id);
    // Misma interacción que en el router real: fijar el timeout de la cookie la activa.
    const addMacCookie =
      data.macCookieTimeout !== undefined ? true : (data.addMacCookie ?? profile.addMacCookie);

    this.hotspotUserProfiles[index] = {
      ...profile,
      ...(addMacCookie !== undefined ? { addMacCookie } : {}),
      ...(data.addressList !== undefined ? { addressList: data.addressList } : {}),
      ...(data.addressPool !== undefined ? { addressPool: data.addressPool } : {}),
      ...(data.idleTimeout !== undefined ? { idleTimeout: data.idleTimeout } : {}),
      ...(data.keepaliveTimeout !== undefined ? { keepaliveTimeout: data.keepaliveTimeout } : {}),
      ...(data.macCookieTimeout !== undefined ? { macCookieTimeout: data.macCookieTimeout } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.rateLimit !== undefined ? { rateLimit: data.rateLimit } : {}),
      ...(data.sessionTimeout !== undefined ? { sessionTimeout: data.sessionTimeout } : {}),
      ...(data.sharedUsers !== undefined ? { sharedUsers: data.sharedUsers } : {}),
      ...(data.statusAutorefresh !== undefined ? { statusAutorefresh: data.statusAutorefresh } : {}),
      ...(data.transparentProxy !== undefined ? { transparentProxy: data.transparentProxy } : {}),
    };
  }

  public async createAddressListEntry(entry: RouterOsAddressListEntryCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const entryData: RouterOsAddressListEntry = {
      address: entry.address,
      ...(entry.comment !== undefined ? { comment: entry.comment } : {}),
      disabled: entry.disabled ?? false,
      id: `*${this.nextId++}`,
      list: entry.list,
      ...(entry.timeout !== undefined ? { timeout: entry.timeout } : {}),
    };
    this.addressListEntries.push(entryData);
  }

  public async disableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const entry = await this.findAddressListEntry(reference);
    if (!entry) {
      return;
    }
    const index = this.addressListEntries.findIndex((e) => e.id === entry.id);
    this.addressListEntries[index] = { ...entry, disabled: true };
  }

  public async enableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const entry = await this.findAddressListEntry(reference);
    if (!entry) {
      return;
    }
    const index = this.addressListEntries.findIndex((e) => e.id === entry.id);
    this.addressListEntries[index] = { ...entry, disabled: false };
  }

  public async findAddressListEntry(
    reference: RouterOsAddressListEntryReference,
  ): Promise<RouterOsAddressListEntry | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const entry = this.addressListEntries.find(
      (e) =>
        (reference.id !== undefined && e.id === reference.id) ||
        (reference.id === undefined &&
          reference.list !== undefined &&
          reference.address !== undefined &&
          e.list === reference.list &&
          e.address === reference.address),
    );
    return entry ?? null;
  }

  public async listAddressListEntries(): Promise<RouterOsAddressListEntry[]> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    return [...this.addressListEntries];
  }

  public async removeAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const entry = await this.findAddressListEntry(reference);
    if (!entry) {
      return;
    }
    this.addressListEntries = this.addressListEntries.filter((e) => e.id !== entry.id);
  }

  public async updateAddressListEntry(
    reference: RouterOsAddressListEntryReference,
    data: RouterOsAddressListEntryUpdateData,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const entry = await this.findAddressListEntry(reference);
    if (!entry) {
      return;
    }
    const index = this.addressListEntries.findIndex((e) => e.id === entry.id);
    const entryData: RouterOsAddressListEntry = {
      ...entry,
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
      ...(data.disabled !== undefined ? { disabled: data.disabled } : {}),
      ...(data.timeout !== undefined ? { timeout: data.timeout } : {}),
    };
    this.addressListEntries[index] = entryData;
  }

  public async createFilterRule(rule: RouterOsFilterRuleCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const ruleData: RouterOsFilterRule = {
      action: rule.action,
      chain: rule.chain,
      comment: rule.comment,
      ...(rule.connectionState !== undefined ? { connectionState: rule.connectionState } : {}),
      disabled: rule.disabled ?? false,
      ...(rule.dstAddress !== undefined ? { dstAddress: rule.dstAddress } : {}),
      ...(rule.dstPort !== undefined ? { dstPort: rule.dstPort } : {}),
      id: `*${this.nextId++}`,
      ...(rule.inInterface !== undefined ? { inInterface: rule.inInterface } : {}),
      ...(rule.outInterface !== undefined ? { outInterface: rule.outInterface } : {}),
      ...(rule.protocol !== undefined ? { protocol: rule.protocol } : {}),
      ...(FilterRuleComment.extractReference(rule.comment) !== null
        ? { ruleReference: FilterRuleComment.extractReference(rule.comment)! }
        : {}),
      ...(rule.srcAddress !== undefined ? { srcAddress: rule.srcAddress } : {}),
      ...(rule.srcPort !== undefined ? { srcPort: rule.srcPort } : {}),
    };
    this.insertRuleAt(this.filterRules, ruleData, rule.placeBeforeId);
  }

  public async disableFilterRule(reference: RouterOsFilterRuleReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findFilterRule(reference);
    if (!rule) {
      return;
    }
    const index = this.filterRules.findIndex((r) => r.id === rule.id);
    this.filterRules[index] = { ...rule, disabled: true };
  }

  public async enableFilterRule(reference: RouterOsFilterRuleReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findFilterRule(reference);
    if (!rule) {
      return;
    }
    const index = this.filterRules.findIndex((r) => r.id === rule.id);
    this.filterRules[index] = { ...rule, disabled: false };
  }

  public async findFilterRule(reference: RouterOsFilterRuleReference): Promise<RouterOsFilterRule | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = this.filterRules.find(
      (r) =>
        (reference.id !== undefined && r.id === reference.id) ||
        (reference.id === undefined &&
          reference.ruleReference !== undefined &&
          r.ruleReference === reference.ruleReference),
    );
    return rule ?? null;
  }

  public async listFilterRules(): Promise<RouterOsFilterRule[]> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    return [...this.filterRules];
  }

  public async moveFilterRule(
    reference: RouterOsFilterRuleReference,
    target: RouterOsFilterRuleMoveTarget,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findFilterRule(reference);
    if (!rule) {
      return;
    }
    this.filterRules = this.filterRules.filter((r) => r.id !== rule.id);
    this.insertRuleAt(this.filterRules, rule, target.placeBeforeId);
  }

  public async removeFilterRule(reference: RouterOsFilterRuleReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findFilterRule(reference);
    if (!rule) {
      return;
    }
    this.filterRules = this.filterRules.filter((r) => r.id !== rule.id);
  }

  public async updateFilterRule(
    reference: RouterOsFilterRuleReference,
    data: RouterOsFilterRuleUpdateData,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findFilterRule(reference);
    if (!rule) {
      return;
    }
    const index = this.filterRules.findIndex((r) => r.id === rule.id);
    const ruleData: RouterOsFilterRule = {
      ...rule,
      ...(data.action !== undefined ? { action: data.action } : {}),
      ...(data.chain !== undefined ? { chain: data.chain } : {}),
      ...(data.comment !== undefined
        ? {
            comment: data.comment,
            ...(FilterRuleComment.extractReference(data.comment) !== null
              ? { ruleReference: FilterRuleComment.extractReference(data.comment)! }
              : {}),
          }
        : {}),
      ...(data.connectionState !== undefined ? { connectionState: data.connectionState } : {}),
      ...(data.disabled !== undefined ? { disabled: data.disabled } : {}),
      ...(data.dstAddress !== undefined ? { dstAddress: data.dstAddress } : {}),
      ...(data.dstPort !== undefined ? { dstPort: data.dstPort } : {}),
      ...(data.inInterface !== undefined ? { inInterface: data.inInterface } : {}),
      ...(data.outInterface !== undefined ? { outInterface: data.outInterface } : {}),
      ...(data.protocol !== undefined ? { protocol: data.protocol } : {}),
      ...(data.srcAddress !== undefined ? { srcAddress: data.srcAddress } : {}),
      ...(data.srcPort !== undefined ? { srcPort: data.srcPort } : {}),
    };
    this.filterRules[index] = ruleData;
  }

  public async createNatRule(rule: RouterOsNatRuleCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const ruleData: RouterOsNatRule = {
      action: rule.action,
      chain: rule.chain,
      comment: rule.comment,
      ...(rule.connectionState !== undefined ? { connectionState: rule.connectionState } : {}),
      disabled: rule.disabled ?? false,
      ...(rule.dstAddress !== undefined ? { dstAddress: rule.dstAddress } : {}),
      ...(rule.dstPort !== undefined ? { dstPort: rule.dstPort } : {}),
      id: `*${this.nextId++}`,
      ...(rule.inInterface !== undefined ? { inInterface: rule.inInterface } : {}),
      ...(rule.outInterface !== undefined ? { outInterface: rule.outInterface } : {}),
      ...(rule.protocol !== undefined ? { protocol: rule.protocol } : {}),
      ...(NatRuleComment.extractReference(rule.comment) !== null
        ? { ruleReference: NatRuleComment.extractReference(rule.comment)! }
        : {}),
      ...(rule.srcAddress !== undefined ? { srcAddress: rule.srcAddress } : {}),
      ...(rule.srcPort !== undefined ? { srcPort: rule.srcPort } : {}),
      ...(rule.toAddresses !== undefined ? { toAddresses: rule.toAddresses } : {}),
      ...(rule.toPorts !== undefined ? { toPorts: rule.toPorts } : {}),
    };
    this.insertRuleAt(this.natRules, ruleData, rule.placeBeforeId);
  }

  public async disableNatRule(reference: RouterOsNatRuleReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findNatRule(reference);
    if (!rule) {
      return;
    }
    const index = this.natRules.findIndex((r) => r.id === rule.id);
    this.natRules[index] = { ...rule, disabled: true };
  }

  public async enableNatRule(reference: RouterOsNatRuleReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findNatRule(reference);
    if (!rule) {
      return;
    }
    const index = this.natRules.findIndex((r) => r.id === rule.id);
    this.natRules[index] = { ...rule, disabled: false };
  }

  public async findNatRule(reference: RouterOsNatRuleReference): Promise<RouterOsNatRule | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = this.natRules.find(
      (r) =>
        (reference.id !== undefined && r.id === reference.id) ||
        (reference.id === undefined &&
          reference.ruleReference !== undefined &&
          r.ruleReference === reference.ruleReference),
    );
    return rule ?? null;
  }

  public async listNatRules(): Promise<RouterOsNatRule[]> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    return [...this.natRules];
  }

  public async moveNatRule(reference: RouterOsNatRuleReference, target: RouterOsNatRuleMoveTarget): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findNatRule(reference);
    if (!rule) {
      return;
    }
    this.natRules = this.natRules.filter((r) => r.id !== rule.id);
    this.insertRuleAt(this.natRules, rule, target.placeBeforeId);
  }

  public async removeNatRule(reference: RouterOsNatRuleReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findNatRule(reference);
    if (!rule) {
      return;
    }
    this.natRules = this.natRules.filter((r) => r.id !== rule.id);
  }

  public async updateNatRule(reference: RouterOsNatRuleReference, data: RouterOsNatRuleUpdateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findNatRule(reference);
    if (!rule) {
      return;
    }
    const index = this.natRules.findIndex((r) => r.id === rule.id);
    const ruleData: RouterOsNatRule = {
      ...rule,
      ...(data.action !== undefined ? { action: data.action } : {}),
      ...(data.chain !== undefined ? { chain: data.chain } : {}),
      ...(data.comment !== undefined
        ? {
            comment: data.comment,
            ...(NatRuleComment.extractReference(data.comment) !== null
              ? { ruleReference: NatRuleComment.extractReference(data.comment)! }
              : {}),
          }
        : {}),
      ...(data.connectionState !== undefined ? { connectionState: data.connectionState } : {}),
      ...(data.disabled !== undefined ? { disabled: data.disabled } : {}),
      ...(data.dstAddress !== undefined ? { dstAddress: data.dstAddress } : {}),
      ...(data.dstPort !== undefined ? { dstPort: data.dstPort } : {}),
      ...(data.inInterface !== undefined ? { inInterface: data.inInterface } : {}),
      ...(data.outInterface !== undefined ? { outInterface: data.outInterface } : {}),
      ...(data.protocol !== undefined ? { protocol: data.protocol } : {}),
      ...(data.srcAddress !== undefined ? { srcAddress: data.srcAddress } : {}),
      ...(data.srcPort !== undefined ? { srcPort: data.srcPort } : {}),
      ...(data.toAddresses !== undefined ? { toAddresses: data.toAddresses } : {}),
      ...(data.toPorts !== undefined ? { toPorts: data.toPorts } : {}),
    };
    this.natRules[index] = ruleData;
  }

  public async createMangleRule(rule: RouterOsMangleRuleCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const ruleData: RouterOsMangleRule = {
      action: rule.action,
      chain: rule.chain,
      comment: rule.comment,
      ...(rule.connectionMark !== undefined ? { connectionMark: rule.connectionMark } : {}),
      ...(rule.connectionState !== undefined ? { connectionState: rule.connectionState } : {}),
      disabled: rule.disabled ?? false,
      ...(rule.dstAddress !== undefined ? { dstAddress: rule.dstAddress } : {}),
      ...(rule.dstPort !== undefined ? { dstPort: rule.dstPort } : {}),
      id: `*${this.nextId++}`,
      ...(rule.inInterface !== undefined ? { inInterface: rule.inInterface } : {}),
      ...(rule.newConnectionMark !== undefined ? { newConnectionMark: rule.newConnectionMark } : {}),
      ...(rule.newPacketMark !== undefined ? { newPacketMark: rule.newPacketMark } : {}),
      ...(rule.newRoutingMark !== undefined ? { newRoutingMark: rule.newRoutingMark } : {}),
      ...(rule.outInterface !== undefined ? { outInterface: rule.outInterface } : {}),
      ...(rule.packetMark !== undefined ? { packetMark: rule.packetMark } : {}),
      ...(rule.passthrough !== undefined ? { passthrough: rule.passthrough } : {}),
      ...(rule.protocol !== undefined ? { protocol: rule.protocol } : {}),
      ...(rule.routingMark !== undefined ? { routingMark: rule.routingMark } : {}),
      ...(MangleRuleComment.extractReference(rule.comment) !== null
        ? { ruleReference: MangleRuleComment.extractReference(rule.comment)! }
        : {}),
      ...(rule.srcAddress !== undefined ? { srcAddress: rule.srcAddress } : {}),
      ...(rule.srcPort !== undefined ? { srcPort: rule.srcPort } : {}),
    };
    this.insertRuleAt(this.mangleRules, ruleData, rule.placeBeforeId);
  }

  public async disableMangleRule(reference: RouterOsMangleRuleReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findMangleRule(reference);
    if (!rule) {
      return;
    }
    const index = this.mangleRules.findIndex((r) => r.id === rule.id);
    this.mangleRules[index] = { ...rule, disabled: true };
  }

  public async enableMangleRule(reference: RouterOsMangleRuleReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findMangleRule(reference);
    if (!rule) {
      return;
    }
    const index = this.mangleRules.findIndex((r) => r.id === rule.id);
    this.mangleRules[index] = { ...rule, disabled: false };
  }

  public async findMangleRule(reference: RouterOsMangleRuleReference): Promise<RouterOsMangleRule | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = this.mangleRules.find(
      (r) =>
        (reference.id !== undefined && r.id === reference.id) ||
        (reference.id === undefined &&
          reference.ruleReference !== undefined &&
          r.ruleReference === reference.ruleReference),
    );
    return rule ?? null;
  }

  public async listMangleRules(): Promise<RouterOsMangleRule[]> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    return [...this.mangleRules];
  }

  public async moveMangleRule(
    reference: RouterOsMangleRuleReference,
    target: RouterOsMangleRuleMoveTarget,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findMangleRule(reference);
    if (!rule) {
      return;
    }
    this.mangleRules = this.mangleRules.filter((r) => r.id !== rule.id);
    this.insertRuleAt(this.mangleRules, rule, target.placeBeforeId);
  }

  public async removeMangleRule(reference: RouterOsMangleRuleReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findMangleRule(reference);
    if (!rule) {
      return;
    }
    this.mangleRules = this.mangleRules.filter((r) => r.id !== rule.id);
  }

  public async updateMangleRule(
    reference: RouterOsMangleRuleReference,
    data: RouterOsMangleRuleUpdateData,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.findMangleRule(reference);
    if (!rule) {
      return;
    }
    const index = this.mangleRules.findIndex((r) => r.id === rule.id);
    const ruleData: RouterOsMangleRule = {
      ...rule,
      ...(data.action !== undefined ? { action: data.action } : {}),
      ...(data.chain !== undefined ? { chain: data.chain } : {}),
      ...(data.comment !== undefined
        ? {
            comment: data.comment,
            ...(MangleRuleComment.extractReference(data.comment) !== null
              ? { ruleReference: MangleRuleComment.extractReference(data.comment)! }
              : {}),
          }
        : {}),
      ...(data.connectionMark !== undefined ? { connectionMark: data.connectionMark } : {}),
      ...(data.connectionState !== undefined ? { connectionState: data.connectionState } : {}),
      ...(data.disabled !== undefined ? { disabled: data.disabled } : {}),
      ...(data.dstAddress !== undefined ? { dstAddress: data.dstAddress } : {}),
      ...(data.dstPort !== undefined ? { dstPort: data.dstPort } : {}),
      ...(data.inInterface !== undefined ? { inInterface: data.inInterface } : {}),
      ...(data.newConnectionMark !== undefined ? { newConnectionMark: data.newConnectionMark } : {}),
      ...(data.newPacketMark !== undefined ? { newPacketMark: data.newPacketMark } : {}),
      ...(data.newRoutingMark !== undefined ? { newRoutingMark: data.newRoutingMark } : {}),
      ...(data.outInterface !== undefined ? { outInterface: data.outInterface } : {}),
      ...(data.packetMark !== undefined ? { packetMark: data.packetMark } : {}),
      ...(data.passthrough !== undefined ? { passthrough: data.passthrough } : {}),
      ...(data.protocol !== undefined ? { protocol: data.protocol } : {}),
      ...(data.routingMark !== undefined ? { routingMark: data.routingMark } : {}),
      ...(data.srcAddress !== undefined ? { srcAddress: data.srcAddress } : {}),
      ...(data.srcPort !== undefined ? { srcPort: data.srcPort } : {}),
    };
    this.mangleRules[index] = ruleData;
  }

  private insertRuleAt<T extends { id: string }>(rules: T[], rule: T, placeBeforeId: string | undefined): void {
    if (placeBeforeId === undefined) {
      rules.push(rule);
      return;
    }
    const targetIndex = rules.findIndex((r) => r.id === placeBeforeId);
    if (targetIndex === -1) {
      rules.push(rule);
      return;
    }
    rules.splice(targetIndex, 0, rule);
  }
}
