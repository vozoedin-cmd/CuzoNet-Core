import type { PlanVersionCreatedEvent } from '../../../domain/plans/events/plan-version-created.event.js';

export interface PlanOutboxPort {
  append(events: readonly PlanVersionCreatedEvent[]): Promise<void>;
}

export interface PlanUnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
