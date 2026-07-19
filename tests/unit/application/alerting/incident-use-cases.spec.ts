import { describe, expect, it } from 'vitest';

import type { IncidentOutboxPort } from '../../../../backend/application/ports/alerting/incident-outbox.port.js';
import type {
  IncidentEventRepository,
  IncidentListFilters,
  IncidentRepository,
} from '../../../../backend/application/ports/alerting/incident-repositories.js';
import { AcknowledgeIncidentUseCase } from '../../../../backend/application/use-cases/alerting/acknowledge-incident.usecase.js';
import { IncidentEngine } from '../../../../backend/application/use-cases/alerting/incident-engine.js';
import { OpenIncidentUseCase } from '../../../../backend/application/use-cases/alerting/open-incident.usecase.js';
import { ResolveIncidentUseCase } from '../../../../backend/application/use-cases/alerting/resolve-incident.usecase.js';
import {
  createDefaultAlertRule,
  defaultAlertRuleDefinitions,
} from '../../../../backend/domain/alerting/default-alert-rules.js';
import type { IncidentDomainEvent } from '../../../../backend/domain/alerting/incident-domain-events.js';
import type { IncidentEvent } from '../../../../backend/domain/alerting/incident-event.js';
import type { Incident } from '../../../../backend/domain/alerting/incident.js';

const baseTime = new Date('2026-07-18T12:00:00.000Z');
const rule = createDefaultAlertRule(
  'company-1',
  defaultAlertRuleDefinitions[0]!,
  'rule-1',
  baseTime,
);

class MemoryIncidentStore
  implements IncidentRepository, IncidentEventRepository, IncidentOutboxPort
{
  public readonly incidents = new Map<string, Incident>();
  public readonly events: IncidentEvent[] = [];
  public readonly domainEvents: IncidentDomainEvent[] = [];

  public findActiveByCorrelationKey(companyId: string, key: string): Promise<Incident | null> {
    return Promise.resolve(
      [...this.incidents.values()].find(
        (incident) =>
          incident.props.companyId === companyId &&
          incident.props.correlationKey === key &&
          incident.props.status !== 'resolved',
      ) ?? null,
    );
  }
  public findById(companyId: string, id: string): Promise<Incident | null> {
    const incident = this.incidents.get(id);
    return Promise.resolve(incident?.props.companyId === companyId ? incident : null);
  }
  public list(companyId: string, _filters?: IncidentListFilters): Promise<Incident[]> {
    return Promise.resolve(
      [...this.incidents.values()].filter((incident) => incident.props.companyId === companyId),
    );
  }
  public save(incident: Incident): Promise<void> {
    this.incidents.set(incident.props.id, incident);
    return Promise.resolve();
  }
  public append(values: readonly IncidentEvent[]): Promise<void>;
  public append(values: readonly IncidentDomainEvent[]): Promise<void>;
  public append(values: readonly (IncidentEvent | IncidentDomainEvent)[]): Promise<void> {
    for (const value of values) {
      if ('eventType' in value) this.domainEvents.push(value);
      else this.events.push(value);
    }
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

function setup(): {
  acknowledge: AcknowledgeIncidentUseCase;
  open: OpenIncidentUseCase;
  resolve: ResolveIncidentUseCase;
  store: MemoryIncidentStore;
} {
  const store = new MemoryIncidentStore();
  let nextId = 0;
  const engine = new IncidentEngine(
    store,
    store,
    store,
    { execute: (work) => work() },
    { generate: () => `id-${++nextId}` },
  );
  return {
    acknowledge: new AcknowledgeIncidentUseCase(engine, {
      now: () => new Date(baseTime.getTime() + 40_000),
    }),
    open: new OpenIncidentUseCase(engine),
    resolve: new ResolveIncidentUseCase(engine),
    store,
  };
}

describe('IncidentEngine use cases', () => {
  it('opens once and reconfirms without duplicating an active incident', async () => {
    const { open, store } = setup();
    const command = {
      causationId: 'observation-1',
      companyId: 'company-1',
      equipmentId: 'equipment-1',
      occurredAt: baseTime,
      rule,
      value: 100,
    };
    const opened = await open.execute(command);
    const updated = await open.execute({
      ...command,
      causationId: 'observation-2',
      occurredAt: new Date(baseTime.getTime() + 30_000),
    });
    expect(updated?.props.id).toBe(opened?.props.id);
    expect(store.incidents).toHaveLength(1);
    expect(store.events.map(({ props }) => props.type)).toEqual([
      'opened',
      'condition_reconfirmed',
    ]);
    expect(store.domainEvents.map((event) => event.eventType)).toEqual(['IncidentOpened.v1']);
  });

  it('acknowledges only open incidents and hides cross-company access', async () => {
    const { acknowledge, open, store } = setup();
    const incident = await open.execute({
      causationId: 'observation',
      companyId: 'company-1',
      equipmentId: 'equipment-1',
      occurredAt: baseTime,
      rule,
    });
    await expect(
      acknowledge.execute({
        acknowledgedBy: 'operator-1',
        companyId: 'other-company',
        correlationId: 'request-1',
        incidentId: incident!.props.id,
      }),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    await acknowledge.execute({
      acknowledgedBy: 'operator-1',
      companyId: 'company-1',
      correlationId: 'request-2',
      incidentId: incident!.props.id,
    });
    expect(incident?.props.status).toBe('acknowledged');
    await expect(
      acknowledge.execute({
        acknowledgedBy: 'operator-2',
        companyId: 'company-1',
        correlationId: 'request-3',
        incidentId: incident!.props.id,
      }),
    ).rejects.toMatchObject({ code: 'INCIDENT_STATE_CONFLICT' });
    expect(store.domainEvents.map((event) => event.eventType)).toContain('IncidentAcknowledged.v1');
  });

  it('resolves acknowledged incidents and creates a new incident for a later failure', async () => {
    const { acknowledge, open, resolve, store } = setup();
    const first = await open.execute({
      causationId: 'observation-1',
      companyId: 'company-1',
      equipmentId: 'equipment-1',
      occurredAt: baseTime,
      rule,
    });
    await acknowledge.execute({
      acknowledgedBy: 'operator',
      companyId: 'company-1',
      correlationId: 'request',
      incidentId: first!.props.id,
    });
    const resolved = await resolve.execute({
      causationId: 'observation-2',
      companyId: 'company-1',
      equipmentId: 'equipment-1',
      occurredAt: new Date(baseTime.getTime() + 90_000),
      rule,
    });
    expect(resolved?.props).toMatchObject({ durationSeconds: 90, status: 'resolved' });
    const second = await open.execute({
      causationId: 'observation-3',
      companyId: 'company-1',
      equipmentId: 'equipment-1',
      occurredAt: new Date(baseTime.getTime() + 120_000),
      rule,
    });
    expect(second?.props.id).not.toBe(first?.props.id);
    expect(store.incidents).toHaveLength(2);
    expect(store.domainEvents.map((event) => event.eventType)).toEqual([
      'IncidentOpened.v1',
      'IncidentAcknowledged.v1',
      'IncidentResolved.v1',
      'IncidentOpened.v1',
    ]);
  });
});
