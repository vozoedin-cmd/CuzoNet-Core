import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const ACTIONS = ['mark-connection', 'mark-packet', 'mark-routing', 'passthrough'] as const;
export type MangleActionName = (typeof ACTIONS)[number];

export type MangleMarkField = 'newConnectionMark' | 'newPacketMark' | 'newRoutingMark';

const REQUIRED_MARK_FIELD: Record<MangleActionName, MangleMarkField | null> = {
  'mark-connection': 'newConnectionMark',
  'mark-packet': 'newPacketMark',
  'mark-routing': 'newRoutingMark',
  passthrough: null,
};

/**
 * RouterOS firewall Mangle action, scoped to Phase 1 of this adapter:
 * mark-connection/mark-packet/mark-routing (the three marking actions) and
 * passthrough (a no-op that only lets processing continue). Actions
 * requiring extra parameters beyond marks — jump/return, change-ttl,
 * change-dscp, route, set-priority, etc. — are Phase 2 and out of scope.
 */
export class MangleAction {
  private constructor(public readonly value: MangleActionName) {}

  public static create(raw: string): MangleAction {
    const value = raw.trim().toLowerCase();
    if (!(ACTIONS as readonly string[]).includes(value)) {
      throw new InvalidProvisioningDataError('action', `Debe ser una de: ${ACTIONS.join(', ')}.`);
    }
    return new MangleAction(value as MangleActionName);
  }

  /** The new-*-mark field this action must set, or null for actions (passthrough) that set no mark. */
  public requiredNewMarkField(): MangleMarkField | null {
    return REQUIRED_MARK_FIELD[this.value];
  }
}
