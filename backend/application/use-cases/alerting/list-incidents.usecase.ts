import type {
  IncidentListFilters,
  IncidentRepository,
} from '../../ports/alerting/incident-repositories.js';
import type { Incident } from '../../../domain/alerting/incident.js';

export class ListIncidentsUseCase {
  public constructor(private readonly repository: IncidentRepository) {}

  public execute(companyId: string, filters: IncidentListFilters): Promise<Incident[]> {
    return this.repository.list(companyId, filters);
  }
}
