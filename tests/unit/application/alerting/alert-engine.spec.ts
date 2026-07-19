import { describe, expect, it } from 'vitest';

import type { AlertEvaluationStateRepository } from '../../../../backend/application/ports/alerting/alert-evaluation-state.repository.js';
import type { IncidentOutboxPort } from '../../../../backend/application/ports/alerting/incident-outbox.port.js';
import type {
  AlertRuleRepository,
  IncidentEventRepository,
  IncidentListFilters,
  IncidentRepository,
} from '../../../../backend/application/ports/alerting/incident-repositories.js';
import type { MaintenanceWindowProvider } from '../../../../backend/application/ports/alerting/maintenance-window.provider.js';
import { EvaluateAlertsUseCase } from '../../../../backend/application/use-cases/alerting/evaluate-alerts.usecase.js';
import { IncidentEngine } from '../../../../backend/application/use-cases/alerting/incident-engine.js';
import type { AlertEvaluationState } from '../../../../backend/domain/alerting/alert-evaluation-state.js';
import { AlertEvaluator } from '../../../../backend/domain/alerting/alert-evaluator.js';
import type { AlertRule } from '../../../../backend/domain/alerting/alert-rule.js';
import {
  createDefaultAlertRule,
  defaultAlertRuleDefinitions,
} from '../../../../backend/domain/alerting/default-alert-rules.js';
import type { IncidentDomainEvent } from '../../../../backend/domain/alerting/incident-domain-events.js';
import type { IncidentEvent } from '../../../../backend/domain/alerting/incident-event.js';
import type { Incident } from '../../../../backend/domain/alerting/incident.js';
import { EquipmentState } from '../../../../backend/domain/monitoring/equipment-state.js';
import { Observation } from '../../../../backend/domain/monitoring/observation.js';

const baseTime = new Date('2026-07-18T12:00:00.000Z');

class MemoryStore
  implements
    AlertRuleRepository,
    AlertEvaluationStateRepository,
    IncidentRepository,
    IncidentEventRepository
{
  public readonly rules: AlertRule[] = [];
  public readonly states = new Map<string, AlertEvaluationState>();
  public readonly incidents = new Map<string, Incident>();
  public readonly events: IncidentEvent[] = [];

  public findActiveByCompany(companyId: string): Promise<AlertRule[]> {
    return Promise.resolve(
      this.rules.filter((rule) => rule.props.companyId === companyId && rule.props.enabled),
    );
  }
  public findByCode(companyId: string, code: string): Promise<AlertRule | null> {
    return Promise.resolve(
      this.rules.find((rule) => rule.props.companyId === companyId && rule.props.code === code) ??
        null,
    );
  }
  public findRuleById(companyId: string, id: string): Promise<AlertRule | null> {
    return Promise.resolve(
      this.rules.find((rule) => rule.props.companyId === companyId && rule.props.id === id) ?? null,
    );
  }
  public findById(companyId: string, id: string): Promise<Incident | null> {
    return Promise.resolve(
      [...this.incidents.values()].find(
        (incident) => incident.props.companyId === companyId && incident.props.id === id,
      ) ?? null,
    );
  }
  public listByCompany(companyId: string): Promise<AlertRule[]> {
    return Promise.resolve(this.rules.filter((rule) => rule.props.companyId === companyId));
  }
  public save(value: AlertRule): Promise<void>;
  public save(value: AlertEvaluationState): Promise<void>;
  public save(value: Incident): Promise<void>;
  public save(value: AlertRule | AlertEvaluationState | Incident): Promise<void> {
    if ('code' in value.props) this.rules.push(value as AlertRule);
    else if ('conditionStartedAt' in value.props || 'lastConditionMatched' in value.props) {
      const state = value as AlertEvaluationState;
      this.states.set(
        `${state.props.companyId}:${state.props.ruleId}:${state.props.equipmentId}`,
        state,
      );
    } else {
      const incident = value as Incident;
      this.incidents.set(incident.props.id, incident);
    }
    return Promise.resolve();
  }
  public find(
    companyId: string,
    ruleId: string,
    equipmentId: string,
  ): Promise<AlertEvaluationState | null> {
    return Promise.resolve(this.states.get(`${companyId}:${ruleId}:${equipmentId}`) ?? null);
  }
  public findActiveByCorrelationKey(
    companyId: string,
    correlationKey: string,
  ): Promise<Incident | null> {
    return Promise.resolve(
      [...this.incidents.values()].find(
        (incident) =>
          incident.props.companyId === companyId &&
          incident.props.correlationKey === correlationKey &&
          incident.props.status !== 'resolved',
      ) ?? null,
    );
  }
  public list(companyId: string, _filters?: IncidentListFilters): Promise<Incident[]> {
    return Promise.resolve(
      [...this.incidents.values()].filter((incident) => incident.props.companyId === companyId),
    );
  }
  public append(events: readonly IncidentEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
  public listByIncident(companyId: string, incidentId: string): Promise<IncidentEvent[]> {
    return Promise.resolve(
      this.events.filter(
        (event) => event.props.companyId === companyId && event.props.incidentId === incidentId,
      ),
    );
  }
}

class MemoryOutbox implements IncidentOutboxPort {
  public readonly events: IncidentDomainEvent[] = [];
  public append(events: readonly IncidentDomainEvent[]): Promise<void> {
    this.events.push(...events);
    return Promise.resolve();
  }
}

function setup(suppressed = false): {
  evaluate: EvaluateAlertsUseCase;
  outbox: MemoryOutbox;
  store: MemoryStore;
} {
  const store = new MemoryStore();
  for (const [index, definition] of defaultAlertRuleDefinitions.entries()) {
    store.rules.push(createDefaultAlertRule('company-1', definition, `rule-${index}`, baseTime));
  }
  let nextId = 0;
  const outbox = new MemoryOutbox();
  const maintenance: MaintenanceWindowProvider = {
    isSuppressed: () => Promise.resolve(suppressed),
  };
  const engine = new IncidentEngine(
    store,
    store,
    outbox,
    { execute: (work) => work() },
    { generate: () => `generated-${++nextId}` },
  );
  return {
    evaluate: new EvaluateAlertsUseCase(store, store, new AlertEvaluator(), engine, maintenance),
    outbox,
    store,
  };
}

function observation(metricType: string, value: number, seconds: number): Observation {
  return Observation.create({
    equipmentId: 'equipment-1',
    id: `${metricType}-${seconds}`,
    metricType,
    occurredAt: new Date(baseTime.getTime() + seconds * 1_000),
    source: 'test',
    unit: 'percent',
    value,
  });
}

async function evaluate(
  useCase: EvaluateAlertsUseCase,
  sample: Observation,
  status: 'UP' | 'DOWN' = 'UP',
): Promise<void> {
  await useCase.evaluate({
    companyId: 'company-1',
    equipmentStates: [EquipmentState.create({ equipmentId: 'equipment-1', status })],
    observations: [sample],
  });
}

describe('EvaluateAlertsUseCase', () => {
  it('does not open DOWN immediately and opens after 30 continuous seconds', async () => {
    const { evaluate: useCase, store } = setup();
    await evaluate(useCase, observation('packet_loss', 100, 0), 'DOWN');
    expect(store.incidents).toHaveLength(0);
    await evaluate(useCase, observation('packet_loss', 100, 30), 'DOWN');
    expect([...store.incidents.values()][0]?.props).toMatchObject({
      severity: 'critical',
      status: 'open',
    });
  });

  it('opens CPU and packet-loss incidents only after their complete windows', async () => {
    const cpu = setup();
    for (const seconds of [0, 60, 120, 180, 240])
      await evaluate(cpu.evaluate, observation('cpu_usage', 95, seconds));
    expect(cpu.store.incidents).toHaveLength(0);
    await evaluate(cpu.evaluate, observation('cpu_usage', 95, 300));
    expect([...cpu.store.incidents.values()][0]?.props.severity).toBe('major');

    const loss = setup();
    await evaluate(loss.evaluate, observation('packet_loss', 25, 0));
    await evaluate(loss.evaluate, observation('packet_loss', 25, 60));
    expect(loss.store.incidents).toHaveLength(0);
    await evaluate(loss.evaluate, observation('packet_loss', 25, 120));
    expect([...loss.store.incidents.values()][0]?.props.severity).toBe('warning');
  });

  it('requires the full recovery window and keeps acknowledged incidents active', async () => {
    const { evaluate: useCase, store } = setup();
    for (const seconds of [0, 60, 120])
      await evaluate(useCase, observation('packet_loss', 30, seconds));
    await evaluate(useCase, observation('packet_loss', 0, 150));
    await evaluate(useCase, observation('packet_loss', 0, 180));
    expect([...store.incidents.values()][0]?.props.status).toBe('open');
    await evaluate(useCase, observation('packet_loss', 0, 210));
    expect([...store.incidents.values()][0]?.props.status).toBe('resolved');
  });

  it('resets a broken condition and ignores missing or out-of-order metrics', async () => {
    const { evaluate: useCase, store } = setup();
    await evaluate(useCase, observation('cpu_usage', 95, 0));
    await evaluate(useCase, observation('cpu_usage', 50, 60));
    await evaluate(useCase, observation('cpu_usage', 95, 120));
    await evaluate(useCase, observation('memory_used', 10, 180));
    await evaluate(useCase, observation('cpu_usage', 95, 100));
    await evaluate(useCase, observation('cpu_usage', 95, 300));
    expect(store.incidents).toHaveLength(0);
  });

  it('suppresses maintenance without opening, updating or resolving incidents', async () => {
    const { evaluate: useCase, store } = setup(true);
    await evaluate(useCase, observation('packet_loss', 100, 0), 'DOWN');
    await evaluate(useCase, observation('packet_loss', 100, 30), 'DOWN');
    expect(store.incidents).toHaveLength(0);
    expect([...store.states.values()][0]?.props.conditionStartedAt).toBeUndefined();
  });

  it('survives a simulated restart through the evaluation-state repository', async () => {
    const first = setup();
    await evaluate(first.evaluate, observation('packet_loss', 100, 0), 'DOWN');
    const engine = new IncidentEngine(
      first.store,
      first.store,
      first.outbox,
      { execute: (work) => work() },
      { generate: () => crypto.randomUUID() },
    );
    const restarted = new EvaluateAlertsUseCase(
      first.store,
      first.store,
      new AlertEvaluator(),
      engine,
      { isSuppressed: () => Promise.resolve(false) },
    );
    await evaluate(restarted, observation('packet_loss', 100, 30), 'DOWN');
    expect(first.store.incidents).toHaveLength(1);
    expect(first.outbox.events.map((event) => event.eventType)).toEqual(['IncidentOpened.v1']);
  });
});
