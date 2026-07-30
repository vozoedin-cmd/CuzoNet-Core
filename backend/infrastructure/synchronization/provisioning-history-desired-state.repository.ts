import type { DesiredStateRepository } from '../../application/ports/synchronization/desired-state-repository.port.js';
import type { ProvisioningRequest } from '../../domain/provisioning/provisioning-request.js';
import type { ProvisioningRequestRepository } from '../../application/ports/provisioning/provisioning-request-repository.port.js';
import type { NormalizedResourceRecord } from '../../domain/synchronization/normalized-resource-record.js';
import type { SyncResourceType } from '../../domain/synchronization/sync-resource-type.js';
import { extractRouterId, splitActionType } from '../../application/use-cases/provisioning/shared/provisioning-event-parsing.util.js';
import { RULE_FIELD_NAMES } from './rule-field-names.js';

interface MutableDesiredRecord {
  disabled: boolean;
  fields: Record<string, string>;
}

interface ResourceHistoryConfig {
  readonly actionTypes: readonly string[];
  applyAction(current: MutableDesiredRecord | null, operation: string, payload: Record<string, unknown>): MutableDesiredRecord | null;
  extractReference(payload: Record<string, unknown>): string | undefined;
}

function pickPayloadFields(payload: Record<string, unknown>, fieldNames: readonly string[]): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const key of fieldNames) {
    const value = payload[key];
    if (value !== undefined) {
      fields[key] = String(value);
    }
  }
  return fields;
}

function payloadDisabled(payload: Record<string, unknown>, fallback: boolean): boolean {
  return typeof payload.disabled === 'boolean' ? payload.disabled : fallback;
}

function extractSimpleQueueReference(payload: Record<string, unknown>): string | undefined {
  const reference = payload.queueName ?? payload.queueReference;
  return typeof reference === 'string' ? reference : undefined;
}

function applySimpleQueueAction(
  current: MutableDesiredRecord | null,
  operation: string,
  payload: Record<string, unknown>,
): MutableDesiredRecord | null {
  switch (operation) {
    case 'create':
      return {
        disabled: payloadDisabled(payload, false),
        fields: {
          comment: payload.comment !== undefined ? String(payload.comment) : '',
          maxLimit: `${String(payload.maxLimitUpload)}/${String(payload.maxLimitDownload)}`,
          target: String(payload.target),
        },
      };
    case 'update': {
      if (current === null) return null;
      const fields = { ...current.fields };
      if (payload.maxLimitUpload !== undefined && payload.maxLimitDownload !== undefined) {
        fields.maxLimit = `${String(payload.maxLimitUpload)}/${String(payload.maxLimitDownload)}`;
      }
      if (payload.target !== undefined) fields.target = String(payload.target);
      if (payload.comment !== undefined) fields.comment = String(payload.comment);
      return { disabled: current.disabled, fields };
    }
    case 'enable':
      return current === null ? null : { ...current, disabled: false };
    case 'disable':
      return current === null ? null : { ...current, disabled: true };
    case 'remove':
      return null;
    default:
      return current;
  }
}

function extractAddressListReference(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.list !== 'string' || typeof payload.address !== 'string') {
    return undefined;
  }
  return `${payload.list}:${payload.address}`;
}

function applyAddressListAction(
  current: MutableDesiredRecord | null,
  operation: string,
  payload: Record<string, unknown>,
): MutableDesiredRecord | null {
  switch (operation) {
    // `timeout` quedó fuera del contrato: una entrada con timeout es dinámica y efímera,
    // y el estado real ya no lo expone. Mantenerlo aquí dejaría todo el recurso en
    // `drifted` permanente, porque el deseado tendría un campo que el actual nunca trae.
    case 'add':
      return {
        disabled: payloadDisabled(payload, false),
        fields: {
          comment: payload.comment !== undefined ? String(payload.comment) : '',
        },
      };
    case 'update': {
      if (current === null) return null;
      const fields = { ...current.fields };
      if (payload.comment !== undefined) fields.comment = String(payload.comment);
      return { disabled: payloadDisabled(payload, current.disabled), fields };
    }
    case 'enable':
      return current === null ? null : { ...current, disabled: false };
    case 'disable':
      return current === null ? null : { ...current, disabled: true };
    case 'remove':
      return null;
    default:
      return current;
  }
}

function extractRuleReference(payload: Record<string, unknown>): string | undefined {
  return typeof payload.ruleReference === 'string' ? payload.ruleReference : undefined;
}

/** add/update/enable/disable/remove behave identically across Filter, NAT and Mangle; only the field list differs. "move" never affects desired configuration fields — position/order is out of scope for Phase 1 comparison. */
function applyRuleLikeAction(
  current: MutableDesiredRecord | null,
  operation: string,
  payload: Record<string, unknown>,
  fieldNames: readonly string[],
): MutableDesiredRecord | null {
  switch (operation) {
    case 'add':
      return { disabled: payloadDisabled(payload, false), fields: pickPayloadFields(payload, fieldNames) };
    case 'update': {
      if (current === null) return null;
      return {
        disabled: payloadDisabled(payload, current.disabled),
        fields: { ...current.fields, ...pickPayloadFields(payload, fieldNames) },
      };
    }
    case 'enable':
      return current === null ? null : { ...current, disabled: false };
    case 'disable':
      return current === null ? null : { ...current, disabled: true };
    case 'remove':
      return null;
    case 'move':
      return current;
    default:
      return current;
  }
}

function createRuleLikeConfig(actionPrefix: string, resourceType: 'filter-rule' | 'nat-rule' | 'mangle-rule'): ResourceHistoryConfig {
  const fieldNames = RULE_FIELD_NAMES[resourceType];
  return {
    actionTypes: ['add', 'update', 'move', 'enable', 'disable', 'remove'].map((operation) => `${actionPrefix}.${operation}`),
    applyAction: (current, operation, payload) => applyRuleLikeAction(current, operation, payload, fieldNames),
    extractReference: extractRuleReference,
  };
}

const RESOURCE_HISTORY_CONFIG: Record<SyncResourceType, ResourceHistoryConfig> = {
  'address-list-entry': {
    actionTypes: [
      'routeros.firewall.address-list.add',
      'routeros.firewall.address-list.update',
      'routeros.firewall.address-list.enable',
      'routeros.firewall.address-list.disable',
      'routeros.firewall.address-list.remove',
    ],
    applyAction: applyAddressListAction,
    extractReference: extractAddressListReference,
  },
  'filter-rule': createRuleLikeConfig('routeros.firewall.filter', 'filter-rule'),
  'mangle-rule': createRuleLikeConfig('routeros.firewall.mangle', 'mangle-rule'),
  'nat-rule': createRuleLikeConfig('routeros.firewall.nat', 'nat-rule'),
  'simple-queue': {
    actionTypes: [
      'routeros.simple_queue.create',
      'routeros.simple_queue.update',
      'routeros.simple_queue.enable',
      'routeros.simple_queue.disable',
      'routeros.simple_queue.remove',
    ],
    applyAction: applySimpleQueueAction,
    extractReference: extractSimpleQueueReference,
  },
};

const PAGE_SIZE = 200;

/**
 * Phase 1 implementation of DesiredStateRepository: reconstructs "desired
 * state" by replaying every completed ProvisioningRequest for a router,
 * per resource type, in chronological order — an "add" seeds the full
 * record, "update" merges a partial patch, "enable"/"disable" flip the
 * disabled flag, and "remove" tombstones the reference (excluding it from
 * the result). This is a read model derived from the Provisioning Engine's
 * own dispatch history, NOT a separate source of truth — the engine that
 * consumes this port neither knows nor cares that this is how it is
 * implemented, so it can later be replaced with a genuine declarative
 * configuration store without any change to GenerateReconciliationPlan.
 */
export class ProvisioningHistoryDesiredStateRepository implements DesiredStateRepository {
  public constructor(private readonly requestRepository: ProvisioningRequestRepository) {}

  public async getDesiredState(
    companyId: string,
    routerId: string,
    resourceType: SyncResourceType,
  ): Promise<readonly NormalizedResourceRecord[]> {
    const config = RESOURCE_HISTORY_CONFIG[resourceType];
    const requests = await this.fetchCompletedRequests(companyId, config.actionTypes);
    const forRouter = requests
      .filter((request) => extractRouterId(request.inputSnapshotJson) === routerId)
      .sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0));

    const byReference = new Map<string, MutableDesiredRecord | null>();
    for (const request of forRouter) {
      const payload = this.parsePayload(request.inputSnapshotJson);
      if (payload === undefined) continue;
      const reference = config.extractReference(payload);
      if (reference === undefined) continue;
      const operation = splitActionType(request.actionType).action;
      const current = byReference.get(reference) ?? null;
      byReference.set(reference, config.applyAction(current, operation, payload));
    }

    const records: NormalizedResourceRecord[] = [];
    for (const [reference, record] of byReference) {
      if (record === null) continue; // Tombstoned: no longer desired
      records.push({ disabled: record.disabled, fields: record.fields, reference });
    }
    return records;
  }

  private parsePayload(inputSnapshotJson: string): Record<string, unknown> | undefined {
    try {
      const parsed: unknown = JSON.parse(inputSnapshotJson);
      return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined;
    } catch {
      return undefined;
    }
  }

  private async fetchCompletedRequests(
    companyId: string,
    actionTypes: readonly string[],
  ): Promise<ProvisioningRequest[]> {
    const requests: ProvisioningRequest[] = [];
    for (const actionType of actionTypes) {
      let offset = 0;
      for (;;) {
        const page = await this.requestRepository.list(
          { actionType, companyId, status: 'completed' },
          { limit: PAGE_SIZE, offset },
        );
        requests.push(...page.items);
        offset += PAGE_SIZE;
        if (page.items.length < PAGE_SIZE || offset >= page.total) break;
      }
    }
    return requests;
  }
}
