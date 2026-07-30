/**
 * Result of comparing one resource's desired configuration against its
 * actual state on the router:
 * - in_sync: present in both, all compared fields match.
 * - missing: desired but absent on the router.
 * - drifted: present in both, but one or more fields differ.
 * - unexpected: present on the router but not desired (including
 *   RouterOS-native rules CuzoNet never provisioned, since those carry no
 *   stable-reference marker and cannot be desired by definition).
 * - ambiguous: more than one actual record has the same stable reference, so
 *   no candidate can be selected safely.
 *
 * INVARIANT for any future apply step: `unexpected` means "CuzoNet does not
 * own this", never "delete this". Applying a plan may act on `missing` and
 * `drifted`, which describe resources CuzoNet provisioned; `in_sync`,
 * `unexpected`, and `ambiguous` may only ever be reported. A router carries
 * configuration that
 * predates CuzoNet or belongs to other operators — the lab router holds
 * seven address-list entries from 2023 that nothing references — and
 * deleting it because it is absent from the desired state would destroy
 * third-party configuration. Plans are `dry-run` today, so nothing enforces
 * this yet; whoever builds apply must.
 */
export type ReconciliationStatus = 'in_sync' | 'missing' | 'drifted' | 'unexpected' | 'ambiguous';

export type ActionableReconciliationStatus = Extract<ReconciliationStatus, 'missing' | 'drifted'>;

/** Explicit allowlist for a future apply step; ambiguous references are never actionable. */
export function isActionableReconciliationStatus(
  status: ReconciliationStatus,
): status is ActionableReconciliationStatus {
  return status === 'missing' || status === 'drifted';
}
