import type { IncidentDomainEvent } from '../../../domain/alerting/incident-domain-events.js';

export interface IncidentOutboxPort {
  append(events: readonly IncidentDomainEvent[]): Promise<void>;
}

export interface IncidentUnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
