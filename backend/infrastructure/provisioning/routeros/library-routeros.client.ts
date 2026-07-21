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
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import { FilterRuleComment } from '../../../domain/provisioning/routeros/value-objects/filter-rule-comment.js';
import { NatRuleComment } from '../../../domain/provisioning/routeros/value-objects/nat-rule-comment.js';

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
    await this.client.execute('/queue/simple/add', {
      attributes: {
        comment: queue.comment ?? '',
        disabled: queue.disabled ? 'yes' : 'no',
        'max-limit': queue.maxLimit,
        name: queue.name,
        target: queue.target,
      },
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

    const replies = await this.client.print('/queue/simple/print', {
      attributes: {
        '.proplist': '.id,name,target,max-limit,disabled,comment',
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
      disabled: reply.disabled === 'true',
      id: reply['.id'] ?? '',
      maxLimit: (reply['max-limit'] as string) ?? '',
      name: reply.name ?? '',
      target: reply.target ?? '',
    };
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

    const replies = await this.client.print('/ppp/secret/print', {
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
      disabled: reply.disabled === 'true',
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
    if (user.sharedUsers !== undefined) attributes['shared-users'] = String(user.sharedUsers);
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

    const replies = await this.client.print('/ip/hotspot/user/print', {
      attributes: {
        '.proplist': '.id,name,server,profile,password,disabled,comment,limit-uptime,limit-bytes-total,shared-users',
      },
      queries: [query],
      timeoutMs: this.timeoutMs,
    });

    const reply = replies[0];
    if (!reply) {
      return null;
    }

    const limitBytesTotal = reply['limit-bytes-total'] ? Number(reply['limit-bytes-total']) : undefined;
    const sharedUsers = reply['shared-users'] ? Number(reply['shared-users']) : undefined;

    return {
      comment: reply.comment ?? '',
      disabled: reply.disabled === 'true',
      id: reply['.id'] ?? '',
      ...(limitBytesTotal !== undefined ? { limitBytesTotal } : {}),
      ...(reply['limit-uptime'] ? { limitUptime: reply['limit-uptime'] as string } : {}),
      name: reply.name ?? '',
      password: reply.password ?? '',
      profile: reply.profile ?? '',
      server: reply.server ?? '',
      ...(sharedUsers !== undefined ? { sharedUsers } : {}),
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
    if (data.sharedUsers !== undefined) attributes['shared-users'] = String(data.sharedUsers);
    if (data.disabled !== undefined) attributes.disabled = data.disabled ? 'yes' : 'no';

    if (Object.keys(attributes).length === 1) return;

    await this.client.execute('/ip/hotspot/user/set', {
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
    if (entry.timeout !== undefined) attributes.timeout = entry.timeout;
    if (entry.disabled !== undefined) attributes.disabled = entry.disabled ? 'yes' : 'no';

    await this.client.execute('/ip/firewall/address-list/add', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async disableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    const entry = await this.findAddressListEntry(reference);
    if (!entry) return;

    await this.client.execute('/ip/firewall/address-list/disable', {
      attributes: { numbers: entry.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    const entry = await this.findAddressListEntry(reference);
    if (!entry) return;

    await this.client.execute('/ip/firewall/address-list/enable', {
      attributes: { numbers: entry.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findAddressListEntry(
    reference: RouterOsAddressListEntryReference,
  ): Promise<RouterOsAddressListEntry | null> {
    let queries: string[];
    if (reference.id !== undefined) {
      queries = [`?.id=${reference.id}`];
    } else if (reference.list !== undefined && reference.address !== undefined) {
      queries = [`?list=${reference.list}`, `?address=${reference.address}`];
    } else {
      return null;
    }

    const replies = await this.client.print('/ip/firewall/address-list/print', {
      attributes: {
        '.proplist': '.id,list,address,disabled,comment,timeout',
      },
      queries,
      timeoutMs: this.timeoutMs,
    });

    const reply = replies[0];
    if (!reply) {
      return null;
    }

    return {
      address: reply.address ?? '',
      comment: reply.comment ?? '',
      disabled: reply.disabled === 'true',
      id: reply['.id'] ?? '',
      list: reply.list ?? '',
      timeout: (reply.timeout as string) ?? '',
    };
  }

  public async removeAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void> {
    const entry = await this.findAddressListEntry(reference);
    if (!entry) return;

    await this.client.execute('/ip/firewall/address-list/remove', {
      attributes: { numbers: entry.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateAddressListEntry(
    reference: RouterOsAddressListEntryReference,
    data: RouterOsAddressListEntryUpdateData,
  ): Promise<void> {
    const entry = await this.findAddressListEntry(reference);
    if (!entry) return;

    const attributes: Record<string, string> = { numbers: entry.id };
    if (data.comment !== undefined) attributes.comment = data.comment;
    if (data.timeout !== undefined) attributes.timeout = data.timeout;
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
    if (rule.disabled !== undefined) attributes.disabled = rule.disabled ? 'yes' : 'no';
    if (rule.placeBeforeId !== undefined) attributes['place-before'] = rule.placeBeforeId;

    await this.client.execute('/ip/firewall/filter/add', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async disableFilterRule(reference: RouterOsFilterRuleReference): Promise<void> {
    const rule = await this.findFilterRule(reference);
    if (!rule) return;

    await this.client.execute('/ip/firewall/filter/disable', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enableFilterRule(reference: RouterOsFilterRuleReference): Promise<void> {
    const rule = await this.findFilterRule(reference);
    if (!rule) return;

    await this.client.execute('/ip/firewall/filter/enable', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findFilterRule(reference: RouterOsFilterRuleReference): Promise<RouterOsFilterRule | null> {
    if (reference.id === undefined && reference.ruleReference === undefined) {
      return null;
    }

    if (reference.id !== undefined) {
      const replies = await this.client.print('/ip/firewall/filter/print', {
        attributes: { '.proplist': FILTER_RULE_PROPLIST },
        queries: [`?.id=${reference.id}`],
        timeoutMs: this.timeoutMs,
      });
      const reply = replies[0];
      return reply ? mapReplyToFilterRule(reply) : null;
    }

    const rules = await this.listFilterRules();
    return rules.find((rule) => rule.ruleReference === reference.ruleReference) ?? null;
  }

  public async listFilterRules(): Promise<RouterOsFilterRule[]> {
    const replies = await this.client.print('/ip/firewall/filter/print', {
      attributes: { '.proplist': FILTER_RULE_PROPLIST },
      timeoutMs: this.timeoutMs,
    });
    return replies.map(mapReplyToFilterRule);
  }

  public async moveFilterRule(
    reference: RouterOsFilterRuleReference,
    target: RouterOsFilterRuleMoveTarget,
  ): Promise<void> {
    const rule = await this.findFilterRule(reference);
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

  public async removeFilterRule(reference: RouterOsFilterRuleReference): Promise<void> {
    const rule = await this.findFilterRule(reference);
    if (!rule) return;

    await this.client.execute('/ip/firewall/filter/remove', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateFilterRule(
    reference: RouterOsFilterRuleReference,
    data: RouterOsFilterRuleUpdateData,
  ): Promise<void> {
    const rule = await this.findFilterRule(reference);
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

  public async disableNatRule(reference: RouterOsNatRuleReference): Promise<void> {
    const rule = await this.findNatRule(reference);
    if (!rule) return;

    await this.client.execute('/ip/firewall/nat/disable', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enableNatRule(reference: RouterOsNatRuleReference): Promise<void> {
    const rule = await this.findNatRule(reference);
    if (!rule) return;

    await this.client.execute('/ip/firewall/nat/enable', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findNatRule(reference: RouterOsNatRuleReference): Promise<RouterOsNatRule | null> {
    if (reference.id === undefined && reference.ruleReference === undefined) {
      return null;
    }

    if (reference.id !== undefined) {
      const replies = await this.client.print('/ip/firewall/nat/print', {
        attributes: { '.proplist': NAT_RULE_PROPLIST },
        queries: [`?.id=${reference.id}`],
        timeoutMs: this.timeoutMs,
      });
      const reply = replies[0];
      return reply ? mapReplyToNatRule(reply) : null;
    }

    const rules = await this.listNatRules();
    return rules.find((rule) => rule.ruleReference === reference.ruleReference) ?? null;
  }

  public async listNatRules(): Promise<RouterOsNatRule[]> {
    const replies = await this.client.print('/ip/firewall/nat/print', {
      attributes: { '.proplist': NAT_RULE_PROPLIST },
      timeoutMs: this.timeoutMs,
    });
    return replies.map(mapReplyToNatRule);
  }

  public async moveNatRule(reference: RouterOsNatRuleReference, target: RouterOsNatRuleMoveTarget): Promise<void> {
    const rule = await this.findNatRule(reference);
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

  public async removeNatRule(reference: RouterOsNatRuleReference): Promise<void> {
    const rule = await this.findNatRule(reference);
    if (!rule) return;

    await this.client.execute('/ip/firewall/nat/remove', {
      attributes: { numbers: rule.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateNatRule(reference: RouterOsNatRuleReference, data: RouterOsNatRuleUpdateData): Promise<void> {
    const rule = await this.findNatRule(reference);
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
}

const FILTER_RULE_PROPLIST =
  '.id,chain,action,protocol,src-address,dst-address,src-port,dst-port,in-interface,out-interface,connection-state,disabled,comment';

function mapReplyToFilterRule(reply: RouterOSRecord): RouterOsFilterRule {
  const comment = reply.comment ?? '';
  const ruleReference = FilterRuleComment.extractReference(comment);
  return {
    action: reply.action ?? '',
    chain: reply.chain ?? '',
    comment,
    ...(reply['connection-state'] ? { connectionState: reply['connection-state'] } : {}),
    disabled: reply.disabled === 'true',
    ...(reply['dst-address'] ? { dstAddress: reply['dst-address'] } : {}),
    ...(reply['dst-port'] ? { dstPort: reply['dst-port'] } : {}),
    id: reply['.id'] ?? '',
    ...(reply['in-interface'] ? { inInterface: reply['in-interface'] } : {}),
    ...(reply['out-interface'] ? { outInterface: reply['out-interface'] } : {}),
    ...(reply.protocol ? { protocol: reply.protocol } : {}),
    ...(ruleReference !== null ? { ruleReference } : {}),
    ...(reply['src-address'] ? { srcAddress: reply['src-address'] } : {}),
    ...(reply['src-port'] ? { srcPort: reply['src-port'] } : {}),
  };
}

const NAT_RULE_PROPLIST =
  '.id,chain,action,protocol,src-address,dst-address,src-port,dst-port,in-interface,out-interface,connection-state,to-addresses,to-ports,disabled,comment';

function mapReplyToNatRule(reply: RouterOSRecord): RouterOsNatRule {
  const comment = reply.comment ?? '';
  const ruleReference = NatRuleComment.extractReference(comment);
  return {
    action: reply.action ?? '',
    chain: reply.chain ?? '',
    comment,
    ...(reply['connection-state'] ? { connectionState: reply['connection-state'] } : {}),
    disabled: reply.disabled === 'true',
    ...(reply['dst-address'] ? { dstAddress: reply['dst-address'] } : {}),
    ...(reply['dst-port'] ? { dstPort: reply['dst-port'] } : {}),
    id: reply['.id'] ?? '',
    ...(reply['in-interface'] ? { inInterface: reply['in-interface'] } : {}),
    ...(reply['out-interface'] ? { outInterface: reply['out-interface'] } : {}),
    ...(reply.protocol ? { protocol: reply.protocol } : {}),
    ...(ruleReference !== null ? { ruleReference } : {}),
    ...(reply['src-address'] ? { srcAddress: reply['src-address'] } : {}),
    ...(reply['src-port'] ? { srcPort: reply['src-port'] } : {}),
    ...(reply['to-addresses'] ? { toAddresses: reply['to-addresses'] } : {}),
    ...(reply['to-ports'] ? { toPorts: reply['to-ports'] } : {}),
  };
}
