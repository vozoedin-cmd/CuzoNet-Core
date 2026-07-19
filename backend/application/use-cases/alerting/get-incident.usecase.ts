import type { IncidentRepository } from '../../ports/alerting/incident-repositories.js';
import { IncidentNotFoundError } from '../../../domain/alerting/errors/incident-not-found.error.js';
import type { Incident } from '../../../domain/alerting/incident.js';

export class GetIncidentUseCase {
  public constructor(private readonly repository: IncidentRepository) {}

  public async execute(companyId: string, incidentId: string): Promise<Incident> {
    const incident = await this.repository.findById(companyId, incidentId);
    if (incident === null) throw new IncidentNotFoundError();
    return incident;
  }
}
