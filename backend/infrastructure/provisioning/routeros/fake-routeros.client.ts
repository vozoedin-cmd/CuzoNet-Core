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
  ObservedFilterRule,
  RouterOsFilterRuleLocator,
  RouterOsFilterRuleCreateData,
  RouterOsFilterRuleMoveTarget,
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

export interface FakeRouterOsFilterRule {
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
  readonly srcAddress?: string;
  readonly srcPort?: string;
  readonly ruleReference?: string;
  readonly dynamic: boolean;
  readonly invalid: boolean;
  readonly jumpTarget?: string;
  readonly rejectWith?: string;
  readonly hotspot?: string;
  readonly log: boolean;
  readonly logPrefix?: string;
  readonly addressList?: string;
  readonly bytes: number;
  readonly packets: number;
}

export class FakeRouterOsClient implements RouterOsClientPort {
  public closed = false;
  public queues: RouterOsSimpleQueue[] = [];
  public secrets: RouterOsPppoeSecret[] = [];
  public hotspotUsers: RouterOsHotspotUser[] = [];
  public hotspotUserProfiles: RouterOsHotspotUserProfile[] = [];
  public addressListEntries: RouterOsAddressListEntry[] = [];
  public filterRules: FakeRouterOsFilterRule[] = [];
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

  /**
   * RouterOS 7.21.4 impone unicidad sobre `list`+`address` en `/add` y responde
   * `already have such entry`. Verificado en el laboratorio: el segundo `/add` no
   * actualiza la entrada existente ni crea una segunda, falla.
   */
  public async createAddressListEntry(entry: RouterOsAddressListEntryCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const duplicate = this.addressListEntries.some(
      (e) => e.list === entry.list && e.address === entry.address,
    );
    if (duplicate) {
      throw new Error('failure: already have such entry');
    }
    const entryData: RouterOsAddressListEntry = {
      address: entry.address,
      ...(entry.comment !== undefined ? { comment: entry.comment } : {}),
      disabled: entry.disabled ?? false,
      dynamic: false,
      id: `*${this.nextId++}`,
      list: entry.list,
    };
    this.addressListEntries.push(entryData);
  }

  /**
   * RouterOS rechaza deshabilitar una entrada dinámica: `cannot have disabled dynamic
   * entry`. `/set` y `/remove` sí se aceptan sobre ellas.
   */
  public async disableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const entry = await this.resolveAddressListEntry(reference);
    if (!entry) {
      return;
    }
    if (entry.dynamic) {
      throw new Error('failure: cannot have disabled dynamic entry');
    }
    const index = this.addressListEntries.findIndex((e) => e.id === entry.id);
    this.addressListEntries[index] = { ...entry, disabled: true };
  }

  public async enableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const entry = await this.resolveAddressListEntry(reference);
    if (!entry) {
      return;
    }
    const index = this.addressListEntries.findIndex((e) => e.id === entry.id);
    this.addressListEntries[index] = { ...entry, disabled: false };
  }

  public async findAddressListEntry(
    reference: RouterOsAddressListEntryReference,
  ): Promise<RouterOsAddressListEntry | null> {
    const entries = await this.findAddressListEntries(reference);
    return entries[0] ?? null;
  }

  /**
   * Espeja al cliente real: cuando el `.id` ya viene resuelto no hay consulta al router,
   * asi que las pruebas que cuentan viajes miden lo mismo en ambos clientes.
   */
  private async resolveAddressListEntry(
    reference: RouterOsAddressListEntryReference,
  ): Promise<RouterOsAddressListEntry | undefined> {
    if (reference.id !== undefined) {
      return this.addressListEntries.find((e) => e.id === reference.id);
    }
    return (await this.findAddressListEntries(reference))[0];
  }

  public async findAddressListEntries(
    reference: RouterOsAddressListEntryReference,
  ): Promise<RouterOsAddressListEntry[]> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    // El `.id` gana sobre `list`+`address`, igual que en el cliente real, donde RouterOS
    // recibe `?.id=` en lugar del par. Los `?` múltiples se combinan con AND.
    if (reference.id !== undefined) {
      return this.addressListEntries.filter((e) => e.id === reference.id);
    }
    if (reference.list === undefined || reference.address === undefined) {
      return [];
    }
    return this.addressListEntries.filter(
      (e) => e.list === reference.list && e.address === reference.address,
    );
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
    const entry = await this.resolveAddressListEntry(reference);
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
    const entry = await this.resolveAddressListEntry(reference);
    if (!entry) {
      return;
    }
    if (entry.dynamic && data.disabled === true) {
      throw new Error('failure: cannot have disabled dynamic entry');
    }
    const index = this.addressListEntries.findIndex((e) => e.id === entry.id);
    const entryData: RouterOsAddressListEntry = {
      ...entry,
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
      ...(data.disabled !== undefined ? { disabled: data.disabled } : {}),
    };
    this.addressListEntries[index] = entryData;
  }

  public async createFilterRule(rule: RouterOsFilterRuleCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const ruleData: FakeRouterOsFilterRule = {
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
      ...(rule.jumpTarget !== undefined ? { jumpTarget: rule.jumpTarget } : {}),
      ...(rule.rejectWith !== undefined ? { rejectWith: rule.rejectWith } : {}),
      ...(rule.hotspot !== undefined ? { hotspot: rule.hotspot } : {}),
      ...(rule.logPrefix !== undefined ? { logPrefix: rule.logPrefix } : {}),
      ...(rule.addressList !== undefined ? { addressList: rule.addressList } : {}),
      log: rule.log ?? false,
      dynamic: false,
      invalid: false,
      bytes: 0,
      packets: 0,
    };
    this.insertRuleAt(this.filterRules, ruleData, rule.placeBeforeId);
  }

  public async disableFilterRule(locator: RouterOsFilterRuleLocator): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.resolveFakeFilterRule(locator);
    if (!rule) {
      return;
    }
    const index = this.filterRules.findIndex((r) => r.id === rule.id);
    this.filterRules[index] = { ...rule, disabled: true };
  }

  public async enableFilterRule(locator: RouterOsFilterRuleLocator): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.resolveFakeFilterRule(locator);
    if (!rule) {
      return;
    }
    const index = this.filterRules.findIndex((r) => r.id === rule.id);
    this.filterRules[index] = { ...rule, disabled: false };
  }

  public async findFilterRuleById(id: string): Promise<ObservedFilterRule | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const index = this.filterRules.findIndex((r) => r.id === id);
    if (index === -1) {
      return null;
    }
    const rule = this.filterRules[index];
    if (!rule) return null;
    return this.mapFakeToObservedFilterRule(rule, index);
  }

  public async findFilterRulesByReference(ruleReference: string): Promise<ObservedFilterRule[]> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const matches: ObservedFilterRule[] = [];
    this.filterRules.forEach((r, index) => {
      if (r.ruleReference === ruleReference) {
        matches.push(this.mapFakeToObservedFilterRule(r, index));
      }
    });
    return matches;
  }

  private async resolveFakeFilterRule(locator: RouterOsFilterRuleLocator): Promise<FakeRouterOsFilterRule | null> {
    if (locator.kind === 'id') {
      return this.filterRules.find((r) => r.id === locator.id) ?? null;
    }
    const matches = this.filterRules.filter((r) => r.ruleReference === locator.ruleReference);
    return matches[0] ?? null; // Si hay múltiples, operamos sobre el primero (o fallamos en el adapter, pero aquí resolvemos uno para compatibilidad con mutaciones previas)
  }

  private mapFakeToObservedFilterRule(r: FakeRouterOsFilterRule, index: number): ObservedFilterRule {
    return {
      id: r.id,
      physicalIndex: index,
      dynamic: r.dynamic,
      invalid: r.invalid,
      chain: r.chain,
      action: r.action,
      ...(r.comment !== undefined ? { comment: r.comment } : {}),
      ownership: FilterRuleComment.parseOwnership(r.comment),
      disabled: r.disabled,
      ...(r.jumpTarget !== undefined ? { jumpTarget: r.jumpTarget } : {}),
      ...(r.rejectWith !== undefined ? { rejectWith: r.rejectWith } : {}),
      ...(r.hotspot !== undefined ? { hotspot: r.hotspot } : {}),
      log: r.log,
      ...(r.logPrefix !== undefined ? { logPrefix: r.logPrefix } : {}),
      ...(r.addressList !== undefined ? { addressList: r.addressList } : {}),
      ...(r.protocol !== undefined ? { protocol: r.protocol } : {}),
      ...(r.srcPort !== undefined ? { srcPort: r.srcPort } : {}),
      ...(r.dstPort !== undefined ? { dstPort: r.dstPort } : {}),
      ...(r.inInterface !== undefined ? { inInterface: r.inInterface } : {}),
      ...(r.outInterface !== undefined ? { outInterface: r.outInterface } : {}),
      ...(r.connectionState !== undefined ? { connectionState: r.connectionState } : {}),
      bytes: r.bytes,
      packets: r.packets,
    };
  }

  public async listFilterRules(): Promise<ObservedFilterRule[]> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    return this.filterRules.map((r, i) => this.mapFakeToObservedFilterRule(r, i));
  }

  public async moveFilterRule(
    locator: RouterOsFilterRuleLocator,
    target: RouterOsFilterRuleMoveTarget,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.resolveFakeFilterRule(locator);
    if (!rule) {
      return;
    }
    this.filterRules = this.filterRules.filter((r) => r.id !== rule.id);
    this.insertRuleAt(this.filterRules, rule, target.placeBeforeId);
  }

  public async removeFilterRule(locator: RouterOsFilterRuleLocator): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.resolveFakeFilterRule(locator);
    if (!rule) {
      return;
    }
    this.filterRules = this.filterRules.filter((r) => r.id !== rule.id);
  }

  public async updateFilterRule(
    locator: RouterOsFilterRuleLocator,
    data: RouterOsFilterRuleUpdateData,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const rule = await this.resolveFakeFilterRule(locator);
    if (!rule) {
      return;
    }
    const index = this.filterRules.findIndex((r) => r.id === rule.id);
    const ruleData: FakeRouterOsFilterRule = {
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
      ...(data.jumpTarget !== undefined ? { jumpTarget: data.jumpTarget } : {}),
      ...(data.rejectWith !== undefined ? { rejectWith: data.rejectWith } : {}),
      ...(data.hotspot !== undefined ? { hotspot: data.hotspot } : {}),
      ...(data.logPrefix !== undefined ? { logPrefix: data.logPrefix } : {}),
      ...(data.addressList !== undefined ? { addressList: data.addressList } : {}),
      ...(data.log !== undefined ? { log: data.log } : {}),
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
