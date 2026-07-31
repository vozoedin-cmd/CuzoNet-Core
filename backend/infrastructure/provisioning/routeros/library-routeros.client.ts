import type { RouterOSRecord } from '@sourceregistry/mikrotik-client/routeros';
import { RouterOSClient as BaseRouterOsClient } from '@sourceregistry/mikrotik-client/routeros';

import type { RouterConnectionProfile } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
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
  ObservedNatRule,
  RouterOsNatRuleCreateData,
  RouterOsNatRuleLocator,
  RouterOsNatRuleMoveTarget,
  RouterOsNatRuleUpdateData,
  RouterOsMangleRule,
  RouterOsMangleRuleCreateData,
  RouterOsMangleRuleMoveTarget,
  RouterOsMangleRuleReference,
  RouterOsMangleRuleUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import { FilterRuleComment } from '../../../domain/provisioning/routeros/value-objects/filter-rule-comment.js';
import { MangleRuleComment } from '../../../domain/provisioning/routeros/value-objects/mangle-rule-comment.js';
import { NatRuleComment } from '../../../domain/provisioning/routeros/value-objects/nat-rule-comment.js';
import { logger } from '../../logging/logger.js';

/**
 * TEMPORAL: diagnóstico de "no such command" — remover una vez confirmado el fix.
 * Solo registra el word de comando y las CLAVES de los atributos, nunca sus valores
 * (algunos recursos, p. ej. PPPoE/Hotspot, llevan contraseñas en los atributos).
 */
function logRouterOsCommand(command: string, parameters?: Record<string, unknown>): void {
  logger.info(
    { command, parameterKeys: parameters ? Object.keys(parameters) : [] },
    'routeros_command_sending',
  );
}

/**
 * Normaliza un booleano de RouterOS. La representación depende de la versión y del
 * transporte, así que se aceptan ambas formas conocidas:
 *
 * - "true"/"false": lo que devuelve RouterOS 7.21.4 sobre la API binaria a través de
 *   `@sourceregistry/mikrotik-client`. Verificado end-to-end contra un hEX real durante
 *   la certificación E2E de Hotspot User (p. ej. `/ip/hotspot/user/print` devuelve
 *   `disabled=false` para un usuario habilitado).
 * - "yes"/"no": forma clásica documentada por MikroTik y usada por versiones anteriores.
 *
 * Un campo ausente o cualquier otro valor se interpreta como `false`, preservando el
 * comportamiento previo del proyecto.
 */
function parseRouterOsBoolean(value: string | undefined): boolean {
  return value === 'yes' || value === 'true';
}

export class LibraryRouterOsClient implements RouterOsClientPort {
  public constructor(
    private readonly client: BaseRouterOsClient,
    private readonly timeoutMs: number,
  ) {}

  public static async connect(
    profile: RouterConnectionProfile,
    secret: string,
  ): Promise<LibraryRouterOsClient> {
    const client = new BaseRouterOsClient({
      host: profile.host,
      password: secret,
      port: profile.port,
      timeoutMs: profile.timeoutMs,
      tls: profile.tls,
      username: profile.username,
    });
    await client.connect();
    return new LibraryRouterOsClient(client, profile.timeoutMs);
  }

  public async close(): Promise<void> {
    await this.client.close();
  }

  public async createSimpleQueue(queue: RouterOsSimpleQueueCreateData): Promise<void> {
    const attributes = {
      comment: queue.comment ?? '',
      disabled: queue.disabled ? 'yes' : 'no',
      'max-limit': queue.maxLimit,
      name: queue.name,
      target: queue.target,
    };
    logRouterOsCommand('/queue/simple/add', attributes);
    await this.client.execute('/queue/simple/add', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async disableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      return;
    }
    await this.client.execute('/queue/simple/disable', {
      attributes: { numbers: queue.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      return;
    }
    await this.client.execute('/queue/simple/enable', {
      attributes: { numbers: queue.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findSimpleQueue(
    reference: RouterOsSimpleQueueReference,
  ): Promise<RouterOsSimpleQueue | null> {
    const query = reference.id !== undefined 
      ? `?.id=${reference.id}` 
      : `?name=${reference.name}`;
      
    if (reference.id === undefined && reference.name === undefined) {
      return null;
    }

    const findAttributes = { '.proplist': '.id,name,target,max-limit,disabled,comment' };
    logRouterOsCommand('/queue/simple/print', findAttributes);
    const replies = await this.client.print('/queue/simple', {
      attributes: findAttributes,
      queries: [query],
      timeoutMs: this.timeoutMs,
    });

    const reply = replies[0];
    if (!reply) {
      return null;
    }

    return mapReplyToSimpleQueue(reply);
  }

  public async listSimpleQueues(): Promise<RouterOsSimpleQueue[]> {
    logRouterOsCommand('/queue/simple/print');
    const replies = await this.client.print('/queue/simple', {
      attributes: {
        '.proplist': '.id,name,target,max-limit,disabled,comment',
      },
      timeoutMs: this.timeoutMs,
    });
    return replies.map(mapReplyToSimpleQueue);
  }

  public async removeSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      return;
    }
    await this.client.execute('/queue/simple/remove', {
      attributes: { numbers: queue.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateSimpleQueue(
    reference: RouterOsSimpleQueueReference,
    data: RouterOsSimpleQueueUpdateData,
  ): Promise<void> {
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      return;
    }

    const attributes: Record<string, string> = { numbers: queue.id };
    if (data.comment !== undefined) {
      attributes.comment = data.comment;
    }
    if (data.maxLimit !== undefined) {
      attributes['max-limit'] = data.maxLimit;
    }
    if (data.name !== undefined) {
      attributes.name = data.name;
    }
    if (data.target !== undefined) {
      attributes.target = data.target;
    }

    if (Object.keys(attributes).length === 1) {
      return;
    }

    await this.client.execute('/queue/simple/set', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async createPppoeSecret(secret: RouterOsPppoeSecretCreateData): Promise<void> {
    const attributes: Record<string, string> = {
      name: secret.name,
      profile: secret.profile,
      service: secret.service ?? 'pppoe',
    };
    if (secret.comment !== undefined) attributes.comment = secret.comment;
    if (secret.password !== undefined) attributes.password = secret.password;
    if (secret.disabled !== undefined) attributes.disabled = secret.disabled ? 'yes' : 'no';

    await this.client.execute('/ppp/secret/add', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async disablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    const secret = await this.findPppoeSecret(reference);
    if (!secret) return;
    
    await this.client.execute('/ppp/secret/disable', {
      attributes: { numbers: secret.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    const secret = await this.findPppoeSecret(reference);
    if (!secret) return;
    
    await this.client.execute('/ppp/secret/enable', {
      attributes: { numbers: secret.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findPppoeSecret(
    reference: RouterOsPppoeSecretReference,
  ): Promise<RouterOsPppoeSecret | null> {
    const query = reference.id !== undefined 
      ? `?.id=${reference.id}` 
      : `?name=${reference.name}`;
      
    if (reference.id === undefined && reference.name === undefined) {
      return null;
    }

    const replies = await this.client.print('/ppp/secret', {
      attributes: {
        '.proplist': '.id,name,service,profile,password,disabled,comment',
      },
      queries: [query],
      timeoutMs: this.timeoutMs,
    });

    const reply = replies[0];
    if (!reply) {
      return null;
    }

    return {
      comment: reply.comment ?? '',
      disabled: reply.disabled === 'yes' || reply.disabled === 'true',
      id: reply['.id'] ?? '',
      name: reply.name ?? '',
      password: reply.password ?? '',
      profile: reply.profile ?? '',
      service: reply.service ?? '',
    };
  }

  public async removePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    const secret = await this.findPppoeSecret(reference);
    if (!secret) return;
    
    await this.client.execute('/ppp/secret/remove', {
      attributes: { numbers: secret.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updatePppoeSecret(
    reference: RouterOsPppoeSecretReference,
    data: RouterOsPppoeSecretUpdateData,
  ): Promise<void> {
    const secret = await this.findPppoeSecret(reference);
    if (!secret) return;

    const attributes: Record<string, string> = { numbers: secret.id };
    if (data.comment !== undefined) attributes.comment = data.comment;
    if (data.name !== undefined) attributes.name = data.name;
    if (data.password !== undefined) attributes.password = data.password;
    if (data.profile !== undefined) attributes.profile = data.profile;
    if (data.service !== undefined) attributes.service = data.service;
    if (data.disabled !== undefined) attributes.disabled = data.disabled ? 'yes' : 'no';

    if (Object.keys(attributes).length === 1) return;

    await this.client.execute('/ppp/secret/set', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async createHotspotUser(user: RouterOsHotspotUserCreateData): Promise<void> {
    const attributes: Record<string, string> = {
      name: user.name,
      password: user.password,
      profile: user.profile,
    };
    if (user.comment !== undefined) attributes.comment = user.comment;
    if (user.server !== undefined) attributes.server = user.server;
    if (user.limitUptime !== undefined) attributes['limit-uptime'] = user.limitUptime;
    if (user.limitBytesTotal !== undefined) attributes['limit-bytes-total'] = String(user.limitBytesTotal);
    if (user.disabled !== undefined) attributes.disabled = user.disabled ? 'yes' : 'no';

    await this.client.execute('/ip/hotspot/user/add', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async disableHotspotUser(reference: RouterOsHotspotUserReference): Promise<void> {
    const user = await this.findHotspotUser(reference);
    if (!user) return;

    await this.client.execute('/ip/hotspot/user/disable', {
      attributes: { numbers: user.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enableHotspotUser(reference: RouterOsHotspotUserReference): Promise<void> {
    const user = await this.findHotspotUser(reference);
    if (!user) return;

    await this.client.execute('/ip/hotspot/user/enable', {
      attributes: { numbers: user.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findHotspotUser(
    reference: RouterOsHotspotUserReference,
  ): Promise<RouterOsHotspotUser | null> {
    const query = reference.id !== undefined
      ? `?.id=${reference.id}`
      : `?name=${reference.name}`;

    if (reference.id === undefined && reference.name === undefined) {
      return null;
    }

    const replies = await this.client.print('/ip/hotspot/user', {
      attributes: {
        '.proplist': '.id,name,server,profile,password,disabled,comment,limit-uptime,limit-bytes-total',
      },
      queries: [query],
      timeoutMs: this.timeoutMs,
    });

    const reply = replies[0];
    if (!reply) {
      return null;
    }

    const limitBytesTotal = reply['limit-bytes-total'] ? Number(reply['limit-bytes-total']) : undefined;

    return {
      comment: reply.comment ?? '',
      disabled: parseRouterOsBoolean(reply.disabled),
      id: reply['.id'] ?? '',
      ...(limitBytesTotal !== undefined ? { limitBytesTotal } : {}),
      ...(reply['limit-uptime'] ? { limitUptime: reply['limit-uptime'] as string } : {}),
      name: reply.name ?? '',
      password: reply.password ?? '',
      profile: reply.profile ?? '',
      server: reply.server ?? '',
    };
  }

  public async removeHotspotUser(reference: RouterOsHotspotUserReference): Promise<void> {
    const user = await this.findHotspotUser(reference);
    if (!user) return;

    await this.client.execute('/ip/hotspot/user/remove', {
      attributes: { numbers: user.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateHotspotUser(
    reference: RouterOsHotspotUserReference,
    data: RouterOsHotspotUserUpdateData,
  ): Promise<void> {
    const user = await this.findHotspotUser(reference);
    if (!user) return;

    const attributes: Record<string, string> = { numbers: user.id };
    if (data.comment !== undefined) attributes.comment = data.comment;
    if (data.name !== undefined) attributes.name = data.name;
    if (data.password !== undefined) attributes.password = data.password;
    if (data.profile !== undefined) attributes.profile = data.profile;
    if (data.server !== undefined) attributes.server = data.server;
    if (data.limitUptime !== undefined) attributes['limit-uptime'] = data.limitUptime;
    if (data.limitBytesTotal !== undefined) attributes['limit-bytes-total'] = String(data.limitBytesTotal);
    if (data.disabled !== undefined) attributes.disabled = data.disabled ? 'yes' : 'no';

    if (Object.keys(attributes).length === 1) return;

    await this.client.execute('/ip/hotspot/user/set', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async createHotspotUserProfile(profile: RouterOsHotspotUserProfileCreateData): Promise<void> {
    await this.client.execute('/ip/hotspot/user/profile/add', {
      attributes: hotspotUserProfileAttributes(profile, { name: profile.name }),
      timeoutMs: this.timeoutMs,
    });
  }

  public async findHotspotUserProfile(
    reference: RouterOsHotspotUserProfileReference,
  ): Promise<RouterOsHotspotUserProfile | null> {
    if (reference.id === undefined && reference.name === undefined) {
      return null;
    }
    const query = reference.id !== undefined ? `?.id=${reference.id}` : `?name=${reference.name}`;

    const replies = await this.client.print('/ip/hotspot/user/profile', {
      attributes: { '.proplist': HOTSPOT_USER_PROFILE_PROPLIST },
      queries: [query],
      timeoutMs: this.timeoutMs,
    });

    const reply = replies[0];
    return reply ? mapReplyToHotspotUserProfile(reply) : null;
  }

  public async listHotspotUserProfiles(): Promise<RouterOsHotspotUserProfile[]> {
    const replies = await this.client.print('/ip/hotspot/user/profile', {
      attributes: { '.proplist': HOTSPOT_USER_PROFILE_PROPLIST },
      timeoutMs: this.timeoutMs,
    });
    return replies.map(mapReplyToHotspotUserProfile);
  }

  public async removeHotspotUserProfile(reference: RouterOsHotspotUserProfileReference): Promise<void> {
    const profile = await this.findHotspotUserProfile(reference);
    if (!profile) return;

    await this.client.execute('/ip/hotspot/user/profile/remove', {
      attributes: { numbers: profile.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateHotspotUserProfile(
    reference: RouterOsHotspotUserProfileReference,
    data: RouterOsHotspotUserProfileUpdateData,
  ): Promise<void> {
    const profile = await this.findHotspotUserProfile(reference);
    if (!profile) return;

    const attributes = hotspotUserProfileAttributes(data, { numbers: profile.id });
    if (Object.keys(attributes).length === 1) return;

    await this.client.execute('/ip/hotspot/user/profile/set', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async createAddressListEntry(entry: RouterOsAddressListEntryCreateData): Promise<void> {
    const attributes: Record<string, string> = {
      address: entry.address,
      list: entry.list,
    };
    if (entry.comment !== undefined) attributes.comment = entry.comment;
    if (entry.disabled !== undefined) attributes.disabled = entry.disabled ? 'yes' : 'no';

    await this.client.execute('/ip/firewall/address-list/add', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async disableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    const id = await this.resolveAddressListEntryId(reference);
    if (id === null) return;

    await this.client.execute('/ip/firewall/address-list/disable', {
      attributes: { numbers: id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    const id = await this.resolveAddressListEntryId(reference);
    if (id === null) return;

    await this.client.execute('/ip/firewall/address-list/enable', {
      attributes: { numbers: id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findAddressListEntry(
    reference: RouterOsAddressListEntryReference,
  ): Promise<RouterOsAddressListEntry | null> {
    const entries = await this.findAddressListEntries(reference);
    return entries[0] ?? null;
  }

  /**
   * Resuelve el `.id` sobre el que ejecutar una mutación. Cuando quien llama ya trae el
   * `.id` —el caso normal, porque el adapter resuelve la entrada antes de decidir qué
   * hacer— se usa directamente y se evita un segundo viaje al router.
   */
  private async resolveAddressListEntryId(
    reference: RouterOsAddressListEntryReference,
  ): Promise<string | null> {
    if (reference.id !== undefined) {
      return reference.id;
    }
    const entry = await this.findAddressListEntry(reference);
    return entry?.id ?? null;
  }

  public async findAddressListEntries(
    reference: RouterOsAddressListEntryReference,
  ): Promise<RouterOsAddressListEntry[]> {
    const queries = addressListQueries(reference);
    if (queries === null) {
      return [];
    }

    const replies = await this.client.print('/ip/firewall/address-list', {
      attributes: { '.proplist': ADDRESS_LIST_PROPLIST },
      queries,
      timeoutMs: this.timeoutMs,
    });

    return replies.map(mapReplyToAddressListEntry);
  }

  public async listAddressListEntries(): Promise<RouterOsAddressListEntry[]> {
    const replies = await this.client.print('/ip/firewall/address-list', {
      attributes: { '.proplist': ADDRESS_LIST_PROPLIST },
      timeoutMs: this.timeoutMs,
    });
    return replies.map(mapReplyToAddressListEntry);
  }

  public async removeAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    const id = await this.resolveAddressListEntryId(reference);
    if (id === null) return;

    await this.client.execute('/ip/firewall/address-list/remove', {
      attributes: { numbers: id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateAddressListEntry(
    reference: RouterOsAddressListEntryReference,
    data: RouterOsAddressListEntryUpdateData,
  ): Promise<void> {
    const id = await this.resolveAddressListEntryId(reference);
    if (id === null) return;

    const attributes: Record<string, string> = { numbers: id };
    if (data.comment !== undefined) attributes.comment = data.comment;
    if (data.disabled !== undefined) attributes.disabled = data.disabled ? 'yes' : 'no';

    if (Object.keys(attributes).length === 1) return;

    await this.client.execute('/ip/firewall/address-list/set', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async createFilterRule(rule: RouterOsFilterRuleCreateData): Promise<void> {
    const attributes: Record<string, string> = {
      action: rule.action,
      chain: rule.chain,
      ...(rule.comment !== undefined ? { comment: rule.comment } : {}),
    };
    if (rule.protocol !== undefined) attributes.protocol = rule.protocol;
    if (rule.srcAddress !== undefined) attributes['src-address'] = rule.srcAddress;
    if (rule.dstAddress !== undefined) attributes['dst-address'] = rule.dstAddress;
    if (rule.srcPort !== undefined) attributes['src-port'] = rule.srcPort;
    if (rule.dstPort !== undefined) attributes['dst-port'] = rule.dstPort;
    if (rule.inInterface !== undefined) attributes['in-interface'] = rule.inInterface;
    if (rule.outInterface !== undefined) attributes['out-interface'] = rule.outInterface;
    if (rule.connectionState !== undefined) attributes['connection-state'] = rule.connectionState;
    if (rule.jumpTarget !== undefined) attributes['jump-target'] = rule.jumpTarget;
    if (rule.rejectWith !== undefined) attributes['reject-with'] = rule.rejectWith;
    if (rule.hotspot !== undefined) attributes.hotspot = rule.hotspot;
    if (rule.log !== undefined) attributes.log = rule.log ? 'yes' : 'no';
    if (rule.logPrefix !== undefined) attributes['log-prefix'] = rule.logPrefix;
    if (rule.addressList !== undefined) attributes['address-list'] = rule.addressList;
    if (rule.disabled !== undefined) attributes.disabled = rule.disabled ? 'yes' : 'no';
    if (rule.placeBeforeId !== undefined) attributes['place-before'] = rule.placeBeforeId;

    await this.client.execute('/ip/firewall/filter/add', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async disableFilterRule(locator: RouterOsFilterRuleLocator): Promise<void> {
    const rule = await this.resolveFilterRule(locator);
    if (!rule) return;

    await this.client.execute('/ip/firewall/filter/disable', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enableFilterRule(locator: RouterOsFilterRuleLocator): Promise<void> {
    const rule = await this.resolveFilterRule(locator);
    if (!rule) return;

    await this.client.execute('/ip/firewall/filter/enable', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findFilterRuleById(id: string): Promise<ObservedFilterRule | null> {
    const replies = await this.client.print('/ip/firewall/filter', {
      attributes: { '.proplist': FILTER_RULE_PROPLIST },
      queries: [`?.id=${id}`],
      timeoutMs: this.timeoutMs,
    });
    const reply = replies[0];
    // Sin `physicalIndex`: una consulta por `.id` devuelve una fila suelta y no puede
    // determinar su posición en la cadena.
    return reply ? mapReplyToFilterRule(reply) : null;
  }

  public async findFilterRulesByReference(ruleReference: string): Promise<ObservedFilterRule[]> {
    const rules = await this.listFilterRules();
    return rules.filter((rule) => rule.ownership.ruleReference === ruleReference);
  }

  public async listFilterRules(): Promise<ObservedFilterRule[]> {
    const replies = await this.client.print('/ip/firewall/filter', {
      attributes: { '.proplist': FILTER_RULE_PROPLIST },
      timeoutMs: this.timeoutMs,
    });
    return replies.map((reply, i) => mapReplyToFilterRule(reply, i));
  }

  private async resolveFilterRule(locator: RouterOsFilterRuleLocator): Promise<ObservedFilterRule | null> {
    if (locator.kind === 'id') {
      return this.findFilterRuleById(locator.id);
    }
    const matches = await this.findFilterRulesByReference(locator.ruleReference);
    return matches[0] ?? null;
  }

  public async moveFilterRule(
    locator: RouterOsFilterRuleLocator,
    target: RouterOsFilterRuleMoveTarget,
  ): Promise<void> {
    const rule = await this.resolveFilterRule(locator);
    if (!rule) return;

    let destination = target.placeBeforeId;
    if (destination === undefined) {
      const rules = await this.listFilterRules();
      destination = String(rules.length);
    }

    await this.client.execute('/ip/firewall/filter/move', {
      attributes: { destination, numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async removeFilterRule(locator: RouterOsFilterRuleLocator): Promise<void> {
    const rule = await this.resolveFilterRule(locator);
    if (!rule) return;

    await this.client.execute('/ip/firewall/filter/remove', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateFilterRule(
    locator: RouterOsFilterRuleLocator,
    data: RouterOsFilterRuleUpdateData,
  ): Promise<void> {
    const rule = await this.resolveFilterRule(locator);
    if (!rule) return;

    const attributes: Record<string, string> = { numbers: rule.id };
    if (data.action !== undefined) attributes.action = data.action;
    if (data.chain !== undefined) attributes.chain = data.chain;
    if (data.comment !== undefined) attributes.comment = data.comment;
    if (data.protocol !== undefined) attributes.protocol = data.protocol;
    if (data.srcAddress !== undefined) attributes['src-address'] = data.srcAddress;
    if (data.dstAddress !== undefined) attributes['dst-address'] = data.dstAddress;
    if (data.srcPort !== undefined) attributes['src-port'] = data.srcPort;
    if (data.dstPort !== undefined) attributes['dst-port'] = data.dstPort;
    if (data.inInterface !== undefined) attributes['in-interface'] = data.inInterface;
    if (data.outInterface !== undefined) attributes['out-interface'] = data.outInterface;
    if (data.connectionState !== undefined) attributes['connection-state'] = data.connectionState;
    if (data.jumpTarget !== undefined) attributes['jump-target'] = data.jumpTarget;
    if (data.rejectWith !== undefined) attributes['reject-with'] = data.rejectWith;
    if (data.hotspot !== undefined) attributes.hotspot = data.hotspot;
    if (data.log !== undefined) attributes.log = data.log ? 'yes' : 'no';
    if (data.logPrefix !== undefined) attributes['log-prefix'] = data.logPrefix;
    if (data.addressList !== undefined) attributes['address-list'] = data.addressList;
    if (data.disabled !== undefined) attributes.disabled = data.disabled ? 'yes' : 'no';

    if (Object.keys(attributes).length === 1) return;

    await this.client.execute('/ip/firewall/filter/set', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async createNatRule(rule: RouterOsNatRuleCreateData): Promise<void> {
    const attributes: Record<string, string> = {
      action: rule.action,
      chain: rule.chain,
      comment: rule.comment,
    };
    if (rule.protocol !== undefined) attributes.protocol = rule.protocol;
    if (rule.srcAddress !== undefined) attributes['src-address'] = rule.srcAddress;
    if (rule.dstAddress !== undefined) attributes['dst-address'] = rule.dstAddress;
    if (rule.srcPort !== undefined) attributes['src-port'] = rule.srcPort;
    if (rule.dstPort !== undefined) attributes['dst-port'] = rule.dstPort;
    if (rule.inInterface !== undefined) attributes['in-interface'] = rule.inInterface;
    if (rule.outInterface !== undefined) attributes['out-interface'] = rule.outInterface;
    if (rule.connectionState !== undefined) attributes['connection-state'] = rule.connectionState;
    if (rule.toAddresses !== undefined) attributes['to-addresses'] = rule.toAddresses;
    if (rule.toPorts !== undefined) attributes['to-ports'] = rule.toPorts;
    if (rule.disabled !== undefined) attributes.disabled = rule.disabled ? 'yes' : 'no';
    if (rule.placeBeforeId !== undefined) attributes['place-before'] = rule.placeBeforeId;

    await this.client.execute('/ip/firewall/nat/add', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async disableNatRule(locator: RouterOsNatRuleLocator): Promise<void> {
    const rule = await this.resolveNatRule(locator);
    if (!rule) return;

    await this.client.execute('/ip/firewall/nat/disable', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enableNatRule(locator: RouterOsNatRuleLocator): Promise<void> {
    const rule = await this.resolveNatRule(locator);
    if (!rule) return;

    await this.client.execute('/ip/firewall/nat/enable', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findNatRuleById(id: string): Promise<ObservedNatRule | null> {
    const replies = await this.client.print('/ip/firewall/nat', {
      attributes: { '.proplist': NAT_RULE_PROPLIST },
      queries: [`?.id=${id}`],
      timeoutMs: this.timeoutMs,
    });
    const reply = replies[0];
    // Sin `physicalIndex`: una consulta por `.id` devuelve una fila suelta y no puede
    // determinar su posicion en la cadena.
    return reply ? mapReplyToNatRule(reply) : null;
  }

  public async findNatRulesByReference(ruleReference: string): Promise<ObservedNatRule[]> {
    const rules = await this.listNatRules();
    return rules.filter((rule) => rule.ownership.ruleReference === ruleReference);
  }

  public async listNatRules(): Promise<ObservedNatRule[]> {
    const replies = await this.client.print('/ip/firewall/nat', {
      attributes: { '.proplist': NAT_RULE_PROPLIST },
      timeoutMs: this.timeoutMs,
    });
    return replies.map((reply, i) => mapReplyToNatRule(reply, i));
  }

  private async resolveNatRule(locator: RouterOsNatRuleLocator): Promise<ObservedNatRule | null> {
    if (locator.kind === 'id') {
      return this.findNatRuleById(locator.id);
    }
    const matches = await this.findNatRulesByReference(locator.ruleReference);
    return matches[0] ?? null;
  }

  public async moveNatRule(locator: RouterOsNatRuleLocator, target: RouterOsNatRuleMoveTarget): Promise<void> {
    const rule = await this.resolveNatRule(locator);
    if (!rule) return;

    let destination = target.placeBeforeId;
    if (destination === undefined) {
      const rules = await this.listNatRules();
      destination = String(rules.length);
    }

    await this.client.execute('/ip/firewall/nat/move', {
      attributes: { destination, numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async removeNatRule(locator: RouterOsNatRuleLocator): Promise<void> {
    const rule = await this.resolveNatRule(locator);
    if (!rule) return;

    await this.client.execute('/ip/firewall/nat/remove', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateNatRule(
    locator: RouterOsNatRuleLocator,
    data: RouterOsNatRuleUpdateData,
  ): Promise<void> {
    const rule = await this.resolveNatRule(locator);
    if (!rule) return;

    const attributes: Record<string, string> = { numbers: rule.id };
    if (data.action !== undefined) attributes.action = data.action;
    if (data.chain !== undefined) attributes.chain = data.chain;
    if (data.comment !== undefined) attributes.comment = data.comment;
    if (data.protocol !== undefined) attributes.protocol = data.protocol;
    if (data.srcAddress !== undefined) attributes['src-address'] = data.srcAddress;
    if (data.dstAddress !== undefined) attributes['dst-address'] = data.dstAddress;
    if (data.srcPort !== undefined) attributes['src-port'] = data.srcPort;
    if (data.dstPort !== undefined) attributes['dst-port'] = data.dstPort;
    if (data.inInterface !== undefined) attributes['in-interface'] = data.inInterface;
    if (data.outInterface !== undefined) attributes['out-interface'] = data.outInterface;
    if (data.connectionState !== undefined) attributes['connection-state'] = data.connectionState;
    if (data.toAddresses !== undefined) attributes['to-addresses'] = data.toAddresses;
    if (data.toPorts !== undefined) attributes['to-ports'] = data.toPorts;
    if (data.disabled !== undefined) attributes.disabled = data.disabled ? 'yes' : 'no';

    if (Object.keys(attributes).length === 1) return;

    await this.client.execute('/ip/firewall/nat/set', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async createMangleRule(rule: RouterOsMangleRuleCreateData): Promise<void> {
    const attributes: Record<string, string> = {
      action: rule.action,
      chain: rule.chain,
      comment: rule.comment,
    };
    if (rule.protocol !== undefined) attributes.protocol = rule.protocol;
    if (rule.srcAddress !== undefined) attributes['src-address'] = rule.srcAddress;
    if (rule.dstAddress !== undefined) attributes['dst-address'] = rule.dstAddress;
    if (rule.srcPort !== undefined) attributes['src-port'] = rule.srcPort;
    if (rule.dstPort !== undefined) attributes['dst-port'] = rule.dstPort;
    if (rule.inInterface !== undefined) attributes['in-interface'] = rule.inInterface;
    if (rule.outInterface !== undefined) attributes['out-interface'] = rule.outInterface;
    if (rule.connectionState !== undefined) attributes['connection-state'] = rule.connectionState;
    if (rule.connectionMark !== undefined) attributes['connection-mark'] = rule.connectionMark;
    if (rule.packetMark !== undefined) attributes['packet-mark'] = rule.packetMark;
    if (rule.routingMark !== undefined) attributes['routing-mark'] = rule.routingMark;
    if (rule.newConnectionMark !== undefined) attributes['new-connection-mark'] = rule.newConnectionMark;
    if (rule.newPacketMark !== undefined) attributes['new-packet-mark'] = rule.newPacketMark;
    if (rule.newRoutingMark !== undefined) attributes['new-routing-mark'] = rule.newRoutingMark;
    if (rule.passthrough !== undefined) attributes.passthrough = rule.passthrough ? 'yes' : 'no';
    if (rule.disabled !== undefined) attributes.disabled = rule.disabled ? 'yes' : 'no';
    if (rule.placeBeforeId !== undefined) attributes['place-before'] = rule.placeBeforeId;

    await this.client.execute('/ip/firewall/mangle/add', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async disableMangleRule(reference: RouterOsMangleRuleReference): Promise<void> {
    const rule = await this.findMangleRule(reference);
    if (!rule) return;

    await this.client.execute('/ip/firewall/mangle/disable', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enableMangleRule(reference: RouterOsMangleRuleReference): Promise<void> {
    const rule = await this.findMangleRule(reference);
    if (!rule) return;

    await this.client.execute('/ip/firewall/mangle/enable', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findMangleRule(reference: RouterOsMangleRuleReference): Promise<RouterOsMangleRule | null> {
    if (reference.id === undefined && reference.ruleReference === undefined) {
      return null;
    }

    if (reference.id !== undefined) {
      const replies = await this.client.print('/ip/firewall/mangle', {
        attributes: { '.proplist': MANGLE_RULE_PROPLIST },
        queries: [`?.id=${reference.id}`],
        timeoutMs: this.timeoutMs,
      });
      const reply = replies[0];
      return reply ? mapReplyToMangleRule(reply) : null;
    }

    const rules = await this.listMangleRules();
    return rules.find((rule) => rule.ruleReference === reference.ruleReference) ?? null;
  }

  public async listMangleRules(): Promise<RouterOsMangleRule[]> {
    const replies = await this.client.print('/ip/firewall/mangle', {
      attributes: { '.proplist': MANGLE_RULE_PROPLIST },
      timeoutMs: this.timeoutMs,
    });
    return replies.map(mapReplyToMangleRule);
  }

  public async moveMangleRule(
    reference: RouterOsMangleRuleReference,
    target: RouterOsMangleRuleMoveTarget,
  ): Promise<void> {
    const rule = await this.findMangleRule(reference);
    if (!rule) return;

    let destination = target.placeBeforeId;
    if (destination === undefined) {
      const rules = await this.listMangleRules();
      destination = String(rules.length);
    }

    await this.client.execute('/ip/firewall/mangle/move', {
      attributes: { destination, numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async removeMangleRule(reference: RouterOsMangleRuleReference): Promise<void> {
    const rule = await this.findMangleRule(reference);
    if (!rule) return;

    await this.client.execute('/ip/firewall/mangle/remove', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateMangleRule(
    reference: RouterOsMangleRuleReference,
    data: RouterOsMangleRuleUpdateData,
  ): Promise<void> {
    const rule = await this.findMangleRule(reference);
    if (!rule) return;

    const attributes: Record<string, string> = { numbers: rule.id };
    if (data.action !== undefined) attributes.action = data.action;
    if (data.chain !== undefined) attributes.chain = data.chain;
    if (data.comment !== undefined) attributes.comment = data.comment;
    if (data.protocol !== undefined) attributes.protocol = data.protocol;
    if (data.srcAddress !== undefined) attributes['src-address'] = data.srcAddress;
    if (data.dstAddress !== undefined) attributes['dst-address'] = data.dstAddress;
    if (data.srcPort !== undefined) attributes['src-port'] = data.srcPort;
    if (data.dstPort !== undefined) attributes['dst-port'] = data.dstPort;
    if (data.inInterface !== undefined) attributes['in-interface'] = data.inInterface;
    if (data.outInterface !== undefined) attributes['out-interface'] = data.outInterface;
    if (data.connectionState !== undefined) attributes['connection-state'] = data.connectionState;
    if (data.connectionMark !== undefined) attributes['connection-mark'] = data.connectionMark;
    if (data.packetMark !== undefined) attributes['packet-mark'] = data.packetMark;
    if (data.routingMark !== undefined) attributes['routing-mark'] = data.routingMark;
    if (data.newConnectionMark !== undefined) attributes['new-connection-mark'] = data.newConnectionMark;
    if (data.newPacketMark !== undefined) attributes['new-packet-mark'] = data.newPacketMark;
    if (data.newRoutingMark !== undefined) attributes['new-routing-mark'] = data.newRoutingMark;
    if (data.passthrough !== undefined) attributes.passthrough = data.passthrough ? 'yes' : 'no';
    if (data.disabled !== undefined) attributes.disabled = data.disabled ? 'yes' : 'no';

    if (Object.keys(attributes).length === 1) return;

    await this.client.execute('/ip/firewall/mangle/set', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }
}

function mapReplyToSimpleQueue(reply: RouterOSRecord): RouterOsSimpleQueue {
  return {
    comment: reply.comment ?? '',
    disabled: reply.disabled === 'yes' || reply.disabled === 'true',
    id: reply['.id'] ?? '',
    maxLimit: reply['max-limit'] ?? '',
    name: reply.name ?? '',
    target: reply.target ?? '',
  };
}

/**
 * Propiedades pedidas para un Hotspot User Profile.
 *
 * `on-login` y `on-logout` se EXCLUYEN deliberadamente: son scripts RouterOS que pueden
 * llegar a varios KB y contener credenciales embebidas (se observó un token de bot en un
 * router real). No pedirlos evita traerlos a memoria, a logs y a los snapshots de
 * ProvisioningRequest. Gestionarlos requiere una estrategia de secretos propia.
 */
const HOTSPOT_USER_PROFILE_PROPLIST =
  '.id,name,default,address-pool,session-timeout,idle-timeout,keepalive-timeout,status-autorefresh,shared-users,rate-limit,add-mac-cookie,mac-cookie-timeout,address-list,transparent-proxy';

/**
 * Serializa los campos de un Hotspot User Profile a atributos de RouterOS. Se comparte
 * entre `add` y `set` porque el conjunto de campos es idéntico; `base` aporta la clave
 * discriminante (`name` al crear, `numbers` al actualizar).
 *
 * Nota de comportamiento real: enviar `mac-cookie-timeout` hace que RouterOS 7.21.4 fuerce
 * `add-mac-cookie=true` en silencio, ignorando un `add-mac-cookie=no` presente en el mismo
 * comando. La validación cruzada vive en el schema, no aquí, para que el cliente siga siendo
 * un traductor fiel de lo que se le pide.
 */
function hotspotUserProfileAttributes(
  data: RouterOsHotspotUserProfileCreateData | RouterOsHotspotUserProfileUpdateData,
  base: Record<string, string>,
): Record<string, string> {
  const attributes: Record<string, string> = { ...base };
  if (data.name !== undefined && base.name === undefined) attributes.name = data.name;
  if (data.addressPool !== undefined) attributes['address-pool'] = data.addressPool;
  if (data.sessionTimeout !== undefined) attributes['session-timeout'] = data.sessionTimeout;
  if (data.idleTimeout !== undefined) attributes['idle-timeout'] = data.idleTimeout;
  if (data.keepaliveTimeout !== undefined) attributes['keepalive-timeout'] = data.keepaliveTimeout;
  if (data.statusAutorefresh !== undefined) attributes['status-autorefresh'] = data.statusAutorefresh;
  if (data.sharedUsers !== undefined) attributes['shared-users'] = data.sharedUsers;
  if (data.rateLimit !== undefined) attributes['rate-limit'] = data.rateLimit;
  if (data.macCookieTimeout !== undefined) attributes['mac-cookie-timeout'] = data.macCookieTimeout;
  if (data.addressList !== undefined) attributes['address-list'] = data.addressList;
  if (data.addMacCookie !== undefined) attributes['add-mac-cookie'] = data.addMacCookie ? 'yes' : 'no';
  if (data.transparentProxy !== undefined) attributes['transparent-proxy'] = data.transparentProxy ? 'yes' : 'no';
  return attributes;
}

function mapReplyToHotspotUserProfile(reply: RouterOSRecord): RouterOsHotspotUserProfile {
  return {
    ...(reply['add-mac-cookie'] !== undefined
      ? { addMacCookie: parseRouterOsBoolean(reply['add-mac-cookie']) }
      : {}),
    // address-list tiene "" como default en RouterOS: se conserva tal cual, no se omite.
    ...(reply['address-list'] !== undefined ? { addressList: reply['address-list'] } : {}),
    ...(reply['address-pool'] ? { addressPool: reply['address-pool'] } : {}),
    id: reply['.id'] ?? '',
    ...(reply['idle-timeout'] ? { idleTimeout: reply['idle-timeout'] } : {}),
    isDefault: parseRouterOsBoolean(reply.default),
    ...(reply['keepalive-timeout'] ? { keepaliveTimeout: reply['keepalive-timeout'] } : {}),
    ...(reply['mac-cookie-timeout'] ? { macCookieTimeout: reply['mac-cookie-timeout'] } : {}),
    name: reply.name ?? '',
    ...(reply['rate-limit'] ? { rateLimit: reply['rate-limit'] } : {}),
    ...(reply['session-timeout'] ? { sessionTimeout: reply['session-timeout'] } : {}),
    ...(reply['shared-users'] ? { sharedUsers: reply['shared-users'] } : {}),
    ...(reply['status-autorefresh'] ? { statusAutorefresh: reply['status-autorefresh'] } : {}),
    ...(reply['transparent-proxy'] !== undefined
      ? { transparentProxy: parseRouterOsBoolean(reply['transparent-proxy']) }
      : {}),
  };
}

/**
 * `.proplist` de address-list. Incluye `creation-time` y `dynamic`, ambos de solo lectura
 * y confirmados en RouterOS 7.21.4; excluye `timeout`, que no forma parte del contrato.
 */
const ADDRESS_LIST_PROPLIST = '.id,list,address,disabled,comment,creation-time,dynamic';

/**
 * Consultas para localizar entradas de address-list, o `null` si la referencia no permite
 * localizar nada. RouterOS combina varios `?` con AND (verificado: `?list=NO-EXISTE` junto
 * a `?address=<existente>` devuelve cero filas).
 */
function addressListQueries(reference: RouterOsAddressListEntryReference): string[] | null {
  if (reference.id !== undefined) {
    return [`?.id=${reference.id}`];
  }
  if (reference.list !== undefined && reference.address !== undefined) {
    return [`?list=${reference.list}`, `?address=${reference.address}`];
  }
  return null;
}

/**
 * RouterOS omite por completo las claves sin valor: una entrada sin comentario no llega
 * como `comment=""`, llega sin la clave. Se conserva esa distinción como `undefined` en
 * lugar de aplanarla a cadena vacía, para que el doble de pruebas pueda replicarla.
 */
function mapReplyToAddressListEntry(reply: RouterOSRecord): RouterOsAddressListEntry {
  return {
    address: reply.address ?? '',
    ...(reply.comment !== undefined ? { comment: reply.comment } : {}),
    ...(reply['creation-time'] !== undefined ? { creationTime: reply['creation-time'] } : {}),
    disabled: parseRouterOsBoolean(reply.disabled),
    dynamic: parseRouterOsBoolean(reply.dynamic),
    id: reply['.id'] ?? '',
    list: reply.list ?? '',
  };
}



const FILTER_RULE_PROPLIST =
  '.id,chain,action,protocol,src-address,dst-address,src-port,dst-port,in-interface,out-interface,connection-state,disabled,comment,dynamic,invalid,jump-target,reject-with,hotspot,log,log-prefix,address-list,bytes,packets';

function mapReplyToFilterRule(reply: RouterOSRecord, index?: number): ObservedFilterRule {
  const comment = reply.comment;
  return {
    id: reply['.id'] ?? '',
    ...(index !== undefined ? { physicalIndex: index } : {}),
    dynamic: parseRouterOsBoolean(reply.dynamic),
    invalid: parseRouterOsBoolean(reply.invalid),
    chain: reply.chain ?? '',
    action: reply.action ?? '',
    ...(comment !== undefined ? { comment } : {}),
    ownership: FilterRuleComment.parseOwnership(comment),
    disabled: parseRouterOsBoolean(reply.disabled),
    ...(reply['jump-target'] !== undefined ? { jumpTarget: reply['jump-target'] } : {}),
    ...(reply['reject-with'] !== undefined ? { rejectWith: reply['reject-with'] } : {}),
    ...(reply.hotspot !== undefined ? { hotspot: reply.hotspot } : {}),
    log: parseRouterOsBoolean(reply.log),
    ...(reply['log-prefix'] !== undefined ? { logPrefix: reply['log-prefix'] } : {}),
    ...(reply['address-list'] !== undefined ? { addressList: reply['address-list'] } : {}),
    ...(reply.protocol !== undefined ? { protocol: reply.protocol } : {}),
    ...(reply['src-port'] !== undefined ? { srcPort: reply['src-port'] } : {}),
    ...(reply['dst-port'] !== undefined ? { dstPort: reply['dst-port'] } : {}),
    ...(reply['in-interface'] !== undefined ? { inInterface: reply['in-interface'] } : {}),
    ...(reply['out-interface'] !== undefined ? { outInterface: reply['out-interface'] } : {}),
    ...(reply['connection-state'] !== undefined ? { connectionState: reply['connection-state'] } : {}),
    ...(reply['src-address'] !== undefined ? { srcAddress: reply['src-address'] } : {}),
    ...(reply['dst-address'] !== undefined ? { dstAddress: reply['dst-address'] } : {}),
    bytes: reply.bytes ? parseInt(reply.bytes, 10) || 0 : 0,
    packets: reply.packets ? parseInt(reply.packets, 10) || 0 : 0,
  };
}

const NAT_RULE_PROPLIST =
  '.id,chain,action,protocol,src-address,dst-address,src-port,dst-port,in-interface,out-interface,connection-state,to-addresses,to-ports,disabled,comment,dynamic,invalid,bytes,packets';

function mapReplyToNatRule(reply: RouterOSRecord, index?: number): ObservedNatRule {
  const comment = reply.comment;
  return {
    id: reply['.id'] ?? '',
    ...(index !== undefined ? { physicalIndex: index } : {}),
    dynamic: parseRouterOsBoolean(reply.dynamic),
    invalid: parseRouterOsBoolean(reply.invalid),
    chain: reply.chain ?? '',
    action: reply.action ?? '',
    ...(comment !== undefined ? { comment } : {}),
    ownership: NatRuleComment.parseOwnership(comment),
    disabled: parseRouterOsBoolean(reply.disabled),
    ...(reply.protocol !== undefined ? { protocol: reply.protocol } : {}),
    ...(reply['src-address'] !== undefined ? { srcAddress: reply['src-address'] } : {}),
    ...(reply['dst-address'] !== undefined ? { dstAddress: reply['dst-address'] } : {}),
    ...(reply['src-port'] !== undefined ? { srcPort: reply['src-port'] } : {}),
    ...(reply['dst-port'] !== undefined ? { dstPort: reply['dst-port'] } : {}),
    ...(reply['in-interface'] !== undefined ? { inInterface: reply['in-interface'] } : {}),
    ...(reply['out-interface'] !== undefined ? { outInterface: reply['out-interface'] } : {}),
    ...(reply['connection-state'] !== undefined ? { connectionState: reply['connection-state'] } : {}),
    ...(reply['to-addresses'] !== undefined ? { toAddresses: reply['to-addresses'] } : {}),
    ...(reply['to-ports'] !== undefined ? { toPorts: reply['to-ports'] } : {}),
    bytes: reply.bytes ? parseInt(reply.bytes, 10) || 0 : 0,
    packets: reply.packets ? parseInt(reply.packets, 10) || 0 : 0,
  };
}

const MANGLE_RULE_PROPLIST =
  '.id,chain,action,protocol,src-address,dst-address,src-port,dst-port,in-interface,out-interface,connection-state,connection-mark,packet-mark,routing-mark,new-connection-mark,new-packet-mark,new-routing-mark,passthrough,disabled,comment';

function mapReplyToMangleRule(reply: RouterOSRecord): RouterOsMangleRule {
  const comment = reply.comment ?? '';
  const ruleReference = MangleRuleComment.extractReference(comment);
  return {
    action: reply.action ?? '',
    chain: reply.chain ?? '',
    comment,
    ...(reply['connection-mark'] ? { connectionMark: reply['connection-mark'] } : {}),
    ...(reply['connection-state'] ? { connectionState: reply['connection-state'] } : {}),
    disabled: reply.disabled === 'true',
    ...(reply['dst-address'] ? { dstAddress: reply['dst-address'] } : {}),
    ...(reply['dst-port'] ? { dstPort: reply['dst-port'] } : {}),
    id: reply['.id'] ?? '',
    ...(reply['in-interface'] ? { inInterface: reply['in-interface'] } : {}),
    ...(reply['new-connection-mark'] ? { newConnectionMark: reply['new-connection-mark'] } : {}),
    ...(reply['new-packet-mark'] ? { newPacketMark: reply['new-packet-mark'] } : {}),
    ...(reply['new-routing-mark'] ? { newRoutingMark: reply['new-routing-mark'] } : {}),
    ...(reply['out-interface'] ? { outInterface: reply['out-interface'] } : {}),
    ...(reply['packet-mark'] ? { packetMark: reply['packet-mark'] } : {}),
    ...(reply.passthrough !== undefined ? { passthrough: reply.passthrough === 'true' } : {}),
    ...(reply.protocol ? { protocol: reply.protocol } : {}),
    ...(reply['routing-mark'] ? { routingMark: reply['routing-mark'] } : {}),
    ...(ruleReference !== null ? { ruleReference } : {}),
    ...(reply['src-address'] ? { srcAddress: reply['src-address'] } : {}),
    ...(reply['src-port'] ? { srcPort: reply['src-port'] } : {}),
  };
}
