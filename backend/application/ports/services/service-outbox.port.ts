import type { ServiceCreatedEvent } from '../../../domain/services/events/service-created.event.js';

export interface ServiceOutboxPort {
  append(events: readonly ServiceCreatedEvent[]): Promise<void>;
}

export interface ServiceUnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
