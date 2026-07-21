import type { NormalizedResourceRecord } from './normalized-resource-record.js';
import type { ReconciliationItem } from './reconciliation-item.js';
import type { SyncResourceType } from './sync-resource-type.js';

const DISABLED_FIELD = 'disabled';

function diffFields(desired: NormalizedResourceRecord, actual: NormalizedResourceRecord): string[] {
  const differing: string[] = [];
  if (desired.disabled !== actual.disabled) {
    differing.push(DISABLED_FIELD);
  }
  const keys = new Set([...Object.keys(desired.fields), ...Object.keys(actual.fields)]);
  for (const key of keys) {
    if ((desired.fields[key] ?? '') !== (actual.fields[key] ?? '')) {
      differing.push(key);
    }
  }
  return differing;
}

/**
 * Compares one resource type's desired records against its actual
 * (RouterOS-read) records, matching purely by `reference`. Produces one
 * ReconciliationItem per reference seen on either side — desired-only
 * references are "missing", actual-only references are "unexpected", and
 * references on both sides are "in_sync" or "drifted" depending on whether
 * any field (including "disabled") differs.
 */
export function compareNormalizedRecords(
  resourceType: SyncResourceType,
  desired: readonly NormalizedResourceRecord[],
  actual: readonly NormalizedResourceRecord[],
): ReconciliationItem[] {
  const desiredByReference = new Map(desired.map((record) => [record.reference, record]));
  const actualByReference = new Map(actual.map((record) => [record.reference, record]));
  const items: ReconciliationItem[] = [];

  for (const [reference, desiredRecord] of desiredByReference) {
    const actualRecord = actualByReference.get(reference);
    if (actualRecord === undefined) {
      items.push({
        actualFields: undefined,
        desiredFields: desiredRecord.fields,
        differingFields: undefined,
        reference,
        resourceType,
        status: 'missing',
      });
      continue;
    }
    const differingFields = diffFields(desiredRecord, actualRecord);
    items.push({
      actualFields: actualRecord.fields,
      desiredFields: desiredRecord.fields,
      differingFields: differingFields.length > 0 ? differingFields : undefined,
      reference,
      resourceType,
      status: differingFields.length === 0 ? 'in_sync' : 'drifted',
    });
  }

  for (const [reference, actualRecord] of actualByReference) {
    if (!desiredByReference.has(reference)) {
      items.push({
        actualFields: actualRecord.fields,
        desiredFields: undefined,
        differingFields: undefined,
        reference,
        resourceType,
        status: 'unexpected',
      });
    }
  }

  return items;
}
