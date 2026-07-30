import { InvalidDesiredResourceStateError } from './errors/invalid-desired-resource-state.error.js';
import type { NormalizedResourceRecord } from './normalized-resource-record.js';
import type { ReconciliationActualCandidate, ReconciliationItem } from './reconciliation-item.js';
import type { SyncResourceType } from './sync-resource-type.js';

const DISABLED_FIELD = 'disabled';

function groupByReference(
  records: readonly NormalizedResourceRecord[],
): Map<string, NormalizedResourceRecord[]> {
  const recordsByReference = new Map<string, NormalizedResourceRecord[]>();
  for (const record of records) {
    const matchingRecords = recordsByReference.get(record.reference);
    if (matchingRecords === undefined) {
      recordsByReference.set(record.reference, [record]);
    } else {
      matchingRecords.push(record);
    }
  }
  return recordsByReference;
}

function assertUniqueDesiredReferences(
  desiredByReference: ReadonlyMap<string, readonly NormalizedResourceRecord[]>,
): void {
  for (const [reference, matchingRecords] of desiredByReference) {
    if (matchingRecords.length > 1) {
      throw new InvalidDesiredResourceStateError(
        'reference',
        `La referencia deseada "${reference}" aparece ${matchingRecords.length} veces.`,
      );
    }
  }
}

function toActualCandidate(record: NormalizedResourceRecord): ReconciliationActualCandidate {
  return {
    disabled: record.disabled,
    fields: { ...record.fields },
  };
}

function ambiguousItem(
  resourceType: SyncResourceType,
  reference: string,
  desiredRecord: NormalizedResourceRecord | undefined,
  actualRecords: readonly NormalizedResourceRecord[],
): ReconciliationItem {
  return {
    actualCandidates: actualRecords.map(toActualCandidate),
    actualFields: undefined,
    actualMatchCount: actualRecords.length,
    desiredFields: desiredRecord?.fields,
    differingFields: undefined,
    reference,
    resourceType,
    status: 'ambiguous',
  };
}

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
 * Two or more actual matches are always "ambiguous"; duplicate desired references fail explicitly.
 */
export function compareNormalizedRecords(
  resourceType: SyncResourceType,
  desired: readonly NormalizedResourceRecord[],
  actual: readonly NormalizedResourceRecord[],
): ReconciliationItem[] {
  const desiredByReference = groupByReference(desired);
  assertUniqueDesiredReferences(desiredByReference);
  const actualByReference = groupByReference(actual);
  const items: ReconciliationItem[] = [];

  for (const [reference, desiredRecords] of desiredByReference) {
    const desiredRecord = desiredRecords[0];
    if (desiredRecord === undefined) {
      continue;
    }
    const actualRecords = actualByReference.get(reference);
    if (actualRecords === undefined) {
      items.push({
        actualCandidates: undefined,
        actualFields: undefined,
        actualMatchCount: undefined,
        desiredFields: desiredRecord.fields,
        differingFields: undefined,
        reference,
        resourceType,
        status: 'missing',
      });
      continue;
    }
    if (actualRecords.length > 1) {
      items.push(ambiguousItem(resourceType, reference, desiredRecord, actualRecords));
      continue;
    }
    const actualRecord = actualRecords[0];
    if (actualRecord === undefined) {
      continue;
    }
    const differingFields = diffFields(desiredRecord, actualRecord);
    items.push({
      actualCandidates: undefined,
      actualFields: actualRecord.fields,
      actualMatchCount: undefined,
      desiredFields: desiredRecord.fields,
      differingFields: differingFields.length > 0 ? differingFields : undefined,
      reference,
      resourceType,
      status: differingFields.length === 0 ? 'in_sync' : 'drifted',
    });
  }

  for (const [reference, actualRecords] of actualByReference) {
    if (!desiredByReference.has(reference)) {
      if (actualRecords.length > 1) {
        items.push(ambiguousItem(resourceType, reference, undefined, actualRecords));
        continue;
      }
      const actualRecord = actualRecords[0];
      if (actualRecord === undefined) {
        continue;
      }
      items.push({
        actualCandidates: undefined,
        actualFields: actualRecord.fields,
        actualMatchCount: undefined,
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
