import type { ClientCreatedEvent } from '../../../domain/clients/events/client-created.event.js';

export interface ClientOutboxPort {
  append(events: readonly ClientCreatedEvent[]): Promise<void>;
}

export interface ClientUnitOfWork {
  execute<T>(work: () => Promise<T>): Promise<T>;
}
