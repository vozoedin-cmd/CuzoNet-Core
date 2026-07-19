import type { RequestHandler } from 'express';

import type { AcknowledgeIncidentUseCase } from '../../application/use-cases/alerting/acknowledge-incident.usecase.js';
import type { GetIncidentUseCase } from '../../application/use-cases/alerting/get-incident.usecase.js';
import type { ListAlertRulesUseCase } from '../../application/use-cases/alerting/list-alert-rules.usecase.js';
import type { ListIncidentsUseCase } from '../../application/use-cases/alerting/list-incidents.usecase.js';
import type { AlertRule } from '../../domain/alerting/alert-rule.js';
import type { Incident } from '../../domain/alerting/incident.js';
import {
  acknowledgeIncidentBodySchema,
  companyQuerySchema,
  incidentIdParamsSchema,
  incidentListQuerySchema,
  parseAlertingRequest,
} from './incident-alerting.schemas.js';

export interface IncidentAlertingControllerDependencies {
  acknowledgeIncident: AcknowledgeIncidentUseCase;
  getIncident: GetIncidentUseCase;
  listAlertRules: ListAlertRulesUseCase;
  listIncidents: ListIncidentsUseCase;
}

export class IncidentAlertingController {
  public constructor(private readonly dependencies: IncidentAlertingControllerDependencies) {}

  public readonly listIncidents: RequestHandler = async (request, response) => {
    const query = parseAlertingRequest(incidentListQuerySchema, request.query);
    const incidents = await this.dependencies.listIncidents.execute(query.companyId, {
      ...(query.equipmentId === undefined ? {} : { equipmentId: query.equipmentId }),
      ...(query.ruleId === undefined ? {} : { ruleId: query.ruleId }),
      ...(query.severity === undefined ? {} : { severity: query.severity }),
      ...(query.status === undefined ? {} : { status: query.status }),
    });
    response.status(200).json({ items: incidents.map(toIncidentDto) });
  };

  public readonly getIncident: RequestHandler = async (request, response) => {
    const params = parseAlertingRequest(incidentIdParamsSchema, request.params);
    const query = parseAlertingRequest(companyQuerySchema, request.query);
    const incident = await this.dependencies.getIncident.execute(
      query.companyId,
      params.incidentId,
    );
    response.status(200).json(toIncidentDto(incident));
  };

  public readonly acknowledgeIncident: RequestHandler = async (request, response) => {
    const params = parseAlertingRequest(incidentIdParamsSchema, request.params);
    const body = parseAlertingRequest(acknowledgeIncidentBodySchema, request.body);
    const incident = await this.dependencies.acknowledgeIncident.execute({
      acknowledgedBy: body.acknowledgedBy,
      companyId: body.companyId,
      correlationId: request.correlationId,
      incidentId: params.incidentId,
    });
    response.status(200).json(toIncidentDto(incident));
  };

  public readonly listAlertRules: RequestHandler = async (request, response) => {
    const query = parseAlertingRequest(companyQuerySchema, request.query);
    const rules = await this.dependencies.listAlertRules.execute(query.companyId);
    response.status(200).json({ items: rules.map(toAlertRuleDto) });
  };
}

function toIncidentDto(incident: Incident): Record<string, unknown> {
  const props = incident.props;
  return {
    ...props,
    acknowledgedAt: props.acknowledgedAt?.toISOString() ?? null,
    createdAt: props.createdAt.toISOString(),
    lastEvaluatedAt: props.lastEvaluatedAt.toISOString(),
    lastTriggeredAt: props.lastTriggeredAt.toISOString(),
    openedAt: props.openedAt.toISOString(),
    resolvedAt: props.resolvedAt?.toISOString() ?? null,
    updatedAt: props.updatedAt.toISOString(),
  };
}

function toAlertRuleDto(rule: AlertRule): Record<string, unknown> {
  return {
    ...rule.props,
    createdAt: rule.props.createdAt.toISOString(),
    updatedAt: rule.props.updatedAt.toISOString(),
  };
}
