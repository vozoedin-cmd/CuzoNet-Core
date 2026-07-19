import { describe, expect, it } from 'vitest';

import { AlertDecisions } from '../../../../backend/domain/alerting/alert-decision.js';
import { AlertEvaluationState } from '../../../../backend/domain/alerting/alert-evaluation-state.js';
import { AlertEvaluator } from '../../../../backend/domain/alerting/alert-evaluator.js';
import { AlertRule } from '../../../../backend/domain/alerting/alert-rule.js';
import {
  createDefaultAlertRule,
  defaultAlertRuleDefinitions,
} from '../../../../backend/domain/alerting/default-alert-rules.js';
import { Incident } from '../../../../backend/domain/alerting/incident.js';
import { EquipmentState } from '../../../../backend/domain/monitoring/equipment-state.js';
import { Observation } from '../../../../backend/domain/monitoring/observation.js';

const now = new Date('2026-07-18T12:00:00.000Z');

function defaultRules(): readonly AlertRule[] {
  return defaultAlertRuleDefinitions.map((definition, index) =>
    createDefaultAlertRule('company-1', definition, `rule-${index}`, now),
  );
}

function observation(metricType: string, value: number, at = now): Observation {
  return Observation.create({
    equipmentId: 'equipment-1',
    id: `${metricType}-${at.toISOString()}`,
    metricType,
    occurredAt: at,
    source: 'test',
    unit: 'percent',
    value,
  });
}

function metadata(id: string): {
  causationId: string;
  correlationId: string;
  domainEventId: string;
  eventId: string;
} {
  return {
    causationId: `cause-${id}`,
    correlationId: 'correlation-1',
    domainEventId: `domain-${id}`,
    eventId: `event-${id}`,
  };
}

describe('AlertRule and AlertEvaluator domain', () => {
  it('defines the three contractual rules including recovery windows', () => {
    expect(
      defaultRules().map(({ props }) => [
        props.code,
        props.durationSeconds,
        props.recoveryDurationSeconds,
        props.severity,
      ]),
    ).toEqual([
      ['equipment-down', 30, 30, 'critical'],
      ['high-cpu', 300, 120, 'major'],
      ['high-packet-loss', 120, 60, 'warning'],
    ]);
  });

  it('rejects invalid windows and metric thresholds', () => {
    const base = defaultRules()[1] as AlertRule;
    expect(() => AlertRule.create({ ...base.props, durationSeconds: 0 })).toThrow(
      'durationSeconds',
    );
    expect(() =>
      AlertRule.create({
        ...base.props,
        condition: {
          ...base.props.condition,
          threshold: Number.NaN,
        } as AlertRule['props']['condition'],
      }),
    ).toThrow('threshold');
  });

  it('evaluates metrics without repositories or persistence', () => {
    const evaluator = new AlertEvaluator();
    const rule = defaultRules()[1] as AlertRule;
    const state = EquipmentState.create({ equipmentId: 'equipment-1', status: 'UP' });
    expect(
      evaluator.evaluate({
        equipmentState: state,
        observation: observation('cpu_usage', 91),
        rule,
      }),
    ).toEqual(AlertDecisions.trigger);
    expect(
      evaluator.evaluate({
        equipmentState: state,
        observation: observation('cpu_usage', 90),
        rule,
      }),
    ).toEqual(AlertDecisions.recover);
    expect(
      evaluator.evaluate({
        equipmentState: state,
        observation: observation('packet_loss', 100),
        rule,
      }),
    ).toEqual(AlertDecisions.ignore);
  });
});

describe('AlertEvaluationState', () => {
  it('persists trigger and recovery windows and rejects isolated samples', () => {
    const state = AlertEvaluationState.create({
      companyId: 'company-1',
      equipmentId: 'equipment-1',
      ruleId: 'rule-1',
      updatedAt: now,
    });
    expect(
      state.apply({
        decision: AlertDecisions.trigger,
        durationSeconds: 30,
        observedAt: now,
        recoveryDurationSeconds: 30,
      }),
    ).toEqual(AlertDecisions.keepOpen);
    expect(
      state.apply({
        decision: AlertDecisions.trigger,
        durationSeconds: 30,
        observedAt: new Date(now.getTime() + 30_000),
        recoveryDurationSeconds: 30,
      }),
    ).toEqual(AlertDecisions.trigger);
    expect(
      state.apply({
        decision: AlertDecisions.recover,
        durationSeconds: 30,
        observedAt: new Date(now.getTime() + 40_000),
        recoveryDurationSeconds: 30,
      }),
    ).toEqual(AlertDecisions.keepOpen);
    expect(
      state.apply({
        decision: AlertDecisions.recover,
        durationSeconds: 30,
        observedAt: new Date(now.getTime() + 70_000),
        recoveryDurationSeconds: 30,
      }),
    ).toEqual(AlertDecisions.recover);
  });

  it('breaks continuity for out-of-order samples and gaps over 120 seconds', () => {
    const state = AlertEvaluationState.create({
      companyId: 'company-1',
      equipmentId: 'equipment-1',
      ruleId: 'rule-1',
      updatedAt: now,
    });
    state.apply({
      decision: AlertDecisions.trigger,
      durationSeconds: 300,
      observedAt: now,
      recoveryDurationSeconds: 60,
    });
    expect(
      state.apply({
        decision: AlertDecisions.trigger,
        durationSeconds: 300,
        observedAt: new Date(now.getTime() - 1),
        recoveryDurationSeconds: 60,
      }),
    ).toEqual(AlertDecisions.ignore);
    expect(state.props.conditionStartedAt).toBeUndefined();
    expect(
      state.apply({
        decision: AlertDecisions.trigger,
        durationSeconds: 300,
        observedAt: new Date(now.getTime() + 121_000),
        recoveryDurationSeconds: 60,
      }),
    ).toEqual(AlertDecisions.keepOpen);
    expect(state.props.conditionStartedAt?.toISOString()).toBe('2026-07-18T12:02:01.000Z');
  });
});

describe('Incident aggregate', () => {
  it('opens, reconfirms, acknowledges and resolves with internal and domain events', () => {
    const incident = Incident.open({
      ...metadata('open'),
      companyId: 'company-1',
      correlationKey: 'company-1:rule-1:equipment-1',
      equipmentId: 'equipment-1',
      id: 'incident-1',
      openedAt: now,
      ruleId: 'rule-1',
      severity: 'critical',
      title: 'Equipment DOWN',
      value: 100,
    });
    incident.reconfirm('event-reconfirm', new Date(now.getTime() + 30_000), 100);
    incident.acknowledge(metadata('ack'), 'operator-1', new Date(now.getTime() + 40_000));
    incident.resolve(metadata('resolve'), new Date(now.getTime() + 95_900), 0);

    expect(incident.props).toMatchObject({
      acknowledgedBy: 'operator-1',
      durationSeconds: 95,
      status: 'resolved',
    });
    expect(incident.pullIncidentEvents().map(({ props }) => props.type)).toEqual([
      'opened',
      'condition_reconfirmed',
      'acknowledged',
      'resolved',
    ]);
    expect(incident.pullDomainEvents().map((event) => event.eventType)).toEqual([
      'IncidentOpened.v1',
      'IncidentAcknowledged.v1',
      'IncidentResolved.v1',
    ]);
  });

  it('rejects acknowledge and duplicate resolve transitions', () => {
    const incident = Incident.open({
      ...metadata('open'),
      companyId: 'company-1',
      correlationKey: 'key',
      equipmentId: 'equipment-1',
      id: 'incident-1',
      openedAt: now,
      ruleId: 'rule-1',
      severity: 'warning',
      title: 'Packet loss',
    });
    incident.resolve(metadata('resolve'), new Date(now.getTime() + 60_000));
    expect(() =>
      incident.acknowledge(metadata('ack'), 'operator', new Date(now.getTime() + 70_000)),
    ).toThrow();
    expect(() => incident.resolve(metadata('again'), new Date(now.getTime() + 80_000))).toThrow();
  });
});
