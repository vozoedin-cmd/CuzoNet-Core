import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { IncidentAlertingController } from '../../../backend/api/alerting/incident-alerting.controller.js';
import { createIncidentAlertingRouter } from '../../../backend/api/alerting/incident-alerting.routes.js';
import { createApp } from '../../../backend/api/http/app.js';
import type { IncidentOutboxPort } from '../../../backend/application/ports/alerting/incident-outbox.port.js';
import type {
  AlertRuleRepository,
  IncidentEventRepository,
  IncidentListFilters,
  IncidentRepository,
} from '../../../backend/application/ports/alerting/incident-repositories.js';
import { AcknowledgeIncidentUseCase } from '../../../backend/application/use-cases/alerting/acknowledge-incident.usecase.js';
import { GetIncidentUseCase } from '../../../backend/application/use-cases/alerting/get-incident.usecase.js';
import { IncidentEngine } from '../../../backend/application/use-cases/alerting/incident-engine.js';
import { ListAlertRulesUseCase } from '../../../backend/application/use-cases/alerting/list-alert-rules.usecase.js';
import { ListIncidentsUseCase } from '../../../backend/application/use-cases/alerting/list-incidents.usecase.js';
import type { AlertRule } from '../../../backend/domain/alerting/alert-rule.js';
import {
  createDefaultAlertRule,
  defaultAlertRuleDefinitions,
} from '../../../backend/domain/alerting/default-alert-rules.js';
import type { IncidentDomainEvent } from '../../../backend/domain/alerting/incident-domain-events.js';
import type { IncidentEvent } from '../../../backend/domain/alerting/incident-event.js';
import { Incident } from '../../../backend/domain/alerting/incident.js';

const now = new Date('2026-07-18T12:00:00.000Z');

class RuleRepository implements AlertRuleRepository {
  public constructor(private readonly rules: AlertRule[]) {}
  public findActiveByCompany(companyId: string): Promise<AlertRule[]> {
    return Promise.resolve(this.rules.filter((rule) => rule.props.companyId === companyId));
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
  public listByCompany(companyId: string): Promise<AlertRule[]> {
    return Promise.resolve(this.rules.filter((rule) => rule.props.companyId === companyId));
  }
  public save(rule: AlertRule): Promise<void> {
    this.rules.push(rule);
    return Promise.resolve();
  }
}

class IncidentRepositoryMemory implements IncidentRepository {
  public readonly values = new Map<string, Incident>();
  public findActiveByCorrelationKey(companyId: string, key: string): Promise<Incident | null> {
    return Promise.resolve(
      [...this.values.values()].find(
        (incident) =>
          incident.props.companyId === companyId &&
          incident.props.correlationKey === key &&
          incident.props.status !== 'resolved',
      ) ?? null,
    );
  }
  public findById(companyId: string, id: string): Promise<Incident | null> {
    const incident = this.values.get(id);
    return Promise.resolve(incident?.props.companyId === companyId ? incident : null);
  }
  public list(companyId: string, filters: IncidentListFilters = {}): Promise<Incident[]> {
    return Promise.resolve(
      [...this.values.values()].filter(
        (incident) =>
          incident.props.companyId === companyId &&
          (filters.status === undefined || incident.props.status === filters.status),
      ),
    );
  }
  public save(incident: Incident): Promise<void> {
    this.values.set(incident.props.id, incident);
    return Promise.resolve();
  }
}

class EventRepositoryMemory implements IncidentEventRepository {
  public readonly values: IncidentEvent[] = [];
  public append(events: readonly IncidentEvent[]): Promise<void> {
    this.values.push(...events);
    return Promise.resolve();
  }
  public listByIncident(companyId: string, incidentId: string): Promise<IncidentEvent[]> {
    return Promise.resolve(
      this.values.filter(
        (event) => event.props.companyId === companyId && event.props.incidentId === incidentId,
      ),
    );
  }
}

class OutboxMemory implements IncidentOutboxPort {
  public readonly values: IncidentDomainEvent[] = [];
  public append(events: readonly IncidentDomainEvent[]): Promise<void> {
    this.values.push(...events);
    return Promise.resolve();
  }
}

describe('Incident Alerting API', () => {
  let app: ReturnType<typeof createApp>;
  let incident: Incident;
  let outbox: OutboxMemory;

  beforeEach(async () => {
    const rule = createDefaultAlertRule(
      'company-1',
      defaultAlertRuleDefinitions[0]!,
      'rule-1',
      now,
    );
    const rules = new RuleRepository([rule]);
    const incidents = new IncidentRepositoryMemory();
    const events = new EventRepositoryMemory();
    outbox = new OutboxMemory();
    incident = Incident.open({
      causationId: 'observation-1',
      companyId: 'company-1',
      correlationId: 'correlation-1',
      correlationKey: 'company-1:rule-1:equipment-1',
      domainEventId: 'domain-open',
      equipmentId: 'equipment-1',
      eventId: 'event-open',
      id: 'incident-1',
      openedAt: now,
      ruleId: 'rule-1',
      severity: 'critical',
      title: 'Equipment DOWN',
    });
    incident.pullDomainEvents();
    await events.append(incident.pullIncidentEvents());
    await incidents.save(incident);
    let nextId = 0;
    const engine = new IncidentEngine(
      incidents,
      events,
      outbox,
      { execute: (work) => work() },
      { generate: () => `generated-${++nextId}` },
    );
    const controller = new IncidentAlertingController({
      acknowledgeIncident: new AcknowledgeIncidentUseCase(engine, {
        now: () => new Date(now.getTime() + 30_000),
      }),
      getIncident: new GetIncidentUseCase(incidents),
      listAlertRules: new ListAlertRulesUseCase(rules),
      listIncidents: new ListIncidentsUseCase(incidents),
    });
    app = createApp({ alertingRouter: createIncidentAlertingRouter(controller) });
  });

  it('lists tenant incidents and alert rules', async () => {
    const incidents = await request(app).get('/api/v1/incidents?companyId=company-1').expect(200);
    expect(incidents.body.items).toHaveLength(1);
    const rules = await request(app).get('/api/v1/alert-rules?companyId=company-1').expect(200);
    expect(rules.body.items.map((rule: { code: string }) => rule.code)).toEqual(['equipment-down']);
  });

  it('acknowledges with explicit identity and preserves X-Correlation-Id', async () => {
    const response = await request(app)
      .post('/api/v1/incidents/incident-1/acknowledge')
      .set('X-Correlation-Id', 'request-123')
      .send({ acknowledgedBy: 'operator-1', companyId: 'company-1' })
      .expect(200);
    expect(response.headers['x-correlation-id']).toBe('request-123');
    expect(response.body.status).toBe('acknowledged');
    expect(outbox.values.map((event) => event.eventType)).toEqual(['IncidentAcknowledged.v1']);
  });

  it('hides foreign incidents and rejects non-strict request bodies', async () => {
    await request(app).get('/api/v1/incidents/incident-1?companyId=company-2').expect(404);
    const response = await request(app)
      .post('/api/v1/incidents/incident-1/acknowledge')
      .send({ acknowledgedBy: 'operator-1', companyId: 'company-1', unexpected: true })
      .expect(422);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(incident.props.status).toBe('open');
  });
});
