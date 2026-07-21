/**
 * A RouterOS resource (Simple Queue, Address List entry, Filter/NAT/Mangle
 * rule) reduced to a vendor-agnostic shape so the reconciliation comparator
 * can diff "desired" and "actual" records for any resource type with the
 * same logic. `reference` is the resource's stable business identity (a
 * comment marker for rule-based resources, a natural key for the rest) —
 * never RouterOS's mutable ".id".
 */
export interface NormalizedResourceRecord {
  readonly disabled: boolean;
  readonly fields: Readonly<Record<string, string>>;
  readonly reference: string;
}
