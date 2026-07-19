export const alertDecisionTypes = ['trigger', 'recover', 'keepOpen', 'ignore'] as const;
export type AlertDecisionType = (typeof alertDecisionTypes)[number];

export interface AlertDecision {
  readonly type: AlertDecisionType;
}

export const AlertDecisions = Object.freeze({
  ignore: Object.freeze({ type: 'ignore' as const }),
  keepOpen: Object.freeze({ type: 'keepOpen' as const }),
  recover: Object.freeze({ type: 'recover' as const }),
  trigger: Object.freeze({ type: 'trigger' as const }),
});
