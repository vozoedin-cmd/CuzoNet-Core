/**
 * Result of comparing one resource's desired configuration against its
 * actual state on the router:
 * - in_sync: present in both, all compared fields match.
 * - missing: desired but absent on the router.
 * - drifted: present in both, but one or more fields differ.
 * - unexpected: present on the router but not desired (including
 *   RouterOS-native rules CuzoNet never provisioned, since those carry no
 *   stable-reference marker and cannot be desired by definition).
 */
export type ReconciliationStatus = 'in_sync' | 'missing' | 'drifted' | 'unexpected';
