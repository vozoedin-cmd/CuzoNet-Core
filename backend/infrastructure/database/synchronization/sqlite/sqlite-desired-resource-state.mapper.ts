import type { DesiredResourceStateTable } from '../../sqlite/database-schema.js';
import { DesiredResourceState } from '../../../../domain/synchronization/desired-resource-state.js';
import type { SyncResourceType } from '../../../../domain/synchronization/sync-resource-type.js';

export const SqliteDesiredResourceStateMapper = {
  toDomain(row: DesiredResourceStateTable): DesiredResourceState {
    return DesiredResourceState.rehydrate({
      companyId: row.company_id,
      createdAt: new Date(row.created_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      desiredFields: JSON.parse(row.desired_fields_json) as Record<string, string>,
      desiredPosition: row.desired_position ?? undefined,
      disabled: row.disabled === 1,
      id: row.id,
      reference: row.resource_reference,
      resourceType: row.resource_type as SyncResourceType,
      revision: row.revision,
      routerId: row.router_id,
      updatedAt: new Date(row.updated_at),
    });
  },

  toPersistence(domain: DesiredResourceState): DesiredResourceStateTable {
    const props = domain.toProps();
    return {
      company_id: props.companyId,
      created_at: props.createdAt.toISOString(),
      deleted_at: props.deletedAt ? props.deletedAt.toISOString() : null,
      desired_fields_json: JSON.stringify(props.desiredFields),
      desired_position: props.desiredPosition ?? null,
      disabled: props.disabled ? 1 : 0,
      id: props.id,
      resource_reference: props.reference,
      resource_type: props.resourceType,
      revision: props.revision,
      router_id: props.routerId,
      updated_at: props.updatedAt.toISOString(),
    };
  },
};
