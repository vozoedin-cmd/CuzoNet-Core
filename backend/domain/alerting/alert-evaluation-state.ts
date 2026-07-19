import type { AlertDecision } from './alert-decision.js';
import { AlertDecisions } from './alert-decision.js';

export const maximumContinuousSampleGapSeconds = 120;

export interface AlertEvaluationStateProps {
  readonly companyId: string;
  conditionStartedAt?: Date;
  readonly equipmentId: string;
  lastConditionMatched: boolean;
  lastObservedAt?: Date;
  recoveryStartedAt?: Date;
  readonly ruleId: string;
  updatedAt: Date;
}

export interface ApplyAlertEvaluationInput {
  readonly decision: AlertDecision;
  readonly durationSeconds: number;
  readonly observedAt: Date;
  readonly recoveryDurationSeconds: number;
}

export class AlertEvaluationState {
  private constructor(public readonly props: AlertEvaluationStateProps) {}

  public static create(
    props: Pick<AlertEvaluationStateProps, 'companyId' | 'equipmentId' | 'ruleId'> & {
      updatedAt: Date;
    },
  ): AlertEvaluationState {
    return new AlertEvaluationState({
      companyId: required(props.companyId, 'companyId'),
      equipmentId: required(props.equipmentId, 'equipmentId'),
      lastConditionMatched: false,
      ruleId: required(props.ruleId, 'ruleId'),
      updatedAt: validDate(props.updatedAt, 'updatedAt'),
    });
  }

  public static reconstitute(props: AlertEvaluationStateProps): AlertEvaluationState {
    return new AlertEvaluationState({
      ...props,
      companyId: required(props.companyId, 'companyId'),
      equipmentId: required(props.equipmentId, 'equipmentId'),
      ruleId: required(props.ruleId, 'ruleId'),
      updatedAt: validDate(props.updatedAt, 'updatedAt'),
      ...(props.conditionStartedAt === undefined
        ? {}
        : { conditionStartedAt: validDate(props.conditionStartedAt, 'conditionStartedAt') }),
      ...(props.lastObservedAt === undefined
        ? {}
        : { lastObservedAt: validDate(props.lastObservedAt, 'lastObservedAt') }),
      ...(props.recoveryStartedAt === undefined
        ? {}
        : { recoveryStartedAt: validDate(props.recoveryStartedAt, 'recoveryStartedAt') }),
    });
  }

  public apply(input: ApplyAlertEvaluationInput): AlertDecision {
    const observedAt = validDate(input.observedAt, 'observedAt');
    const previousObservedAt = this.props.lastObservedAt;
    if (previousObservedAt !== undefined && observedAt <= previousObservedAt) {
      this.clearWindows();
      this.props.lastConditionMatched = false;
      this.props.updatedAt = observedAt;
      return AlertDecisions.ignore;
    }

    if (
      previousObservedAt !== undefined &&
      observedAt.getTime() - previousObservedAt.getTime() >
        maximumContinuousSampleGapSeconds * 1_000
    ) {
      this.clearWindows();
      this.props.lastConditionMatched = false;
    }

    this.props.lastObservedAt = observedAt;
    this.props.updatedAt = observedAt;
    if (input.decision.type === 'ignore') return AlertDecisions.ignore;
    if (input.decision.type === 'keepOpen') return AlertDecisions.keepOpen;

    if (input.decision.type === 'trigger') {
      delete this.props.recoveryStartedAt;
      if (!this.props.lastConditionMatched || this.props.conditionStartedAt === undefined) {
        this.props.conditionStartedAt = observedAt;
      }
      this.props.lastConditionMatched = true;
      return elapsedSeconds(this.props.conditionStartedAt, observedAt) >= input.durationSeconds
        ? AlertDecisions.trigger
        : AlertDecisions.keepOpen;
    }

    delete this.props.conditionStartedAt;
    if (this.props.lastConditionMatched || this.props.recoveryStartedAt === undefined) {
      this.props.recoveryStartedAt = observedAt;
    }
    this.props.lastConditionMatched = false;
    return elapsedSeconds(this.props.recoveryStartedAt, observedAt) >= input.recoveryDurationSeconds
      ? AlertDecisions.recover
      : AlertDecisions.keepOpen;
  }

  public suppress(observedAt: Date): void {
    const safeObservedAt = validDate(observedAt, 'observedAt');
    if (this.props.lastObservedAt === undefined || safeObservedAt > this.props.lastObservedAt) {
      this.props.lastObservedAt = safeObservedAt;
    }
    this.clearWindows();
    this.props.lastConditionMatched = false;
    this.props.updatedAt = safeObservedAt;
  }

  private clearWindows(): void {
    delete this.props.conditionStartedAt;
    delete this.props.recoveryStartedAt;
  }
}

function elapsedSeconds(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 1_000);
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error(`AlertEvaluationState ${name} is required.`);
  return normalized;
}

function validDate(value: Date, name: string): Date {
  if (Number.isNaN(value.getTime())) {
    throw new RangeError(`AlertEvaluationState ${name} must be valid.`);
  }
  return new Date(value);
}
