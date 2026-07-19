import type { Clock } from '../../ports/clock.port.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { NotificationDestinationRepository } from '../../ports/notifications/repositories.js';
import { NotificationDestination } from '../../../domain/notifications/notification-destination.js';
import {
  NotificationDestinationConflictError,
  NotificationDestinationNotFoundError,
} from '../../../domain/notifications/notification-errors.js';
import type {
  NotificationChannelType,
  NotificationEventType,
} from '../../../domain/notifications/types.js';

export interface SaveNotificationDestinationInput {
  channel: NotificationChannelType;
  companyId: string;
  configurationReference: string;
  enabled: boolean;
  eventTypes: readonly NotificationEventType[];
  minimumSeverity?: 'info' | 'warning' | 'minor' | 'major' | 'critical';
  name: string;
}

export class CreateNotificationDestinationUseCase {
  public constructor(
    private readonly destinations: NotificationDestinationRepository,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  public async execute(input: SaveNotificationDestinationInput) {
    if ((await this.destinations.findByName(input.companyId, input.name)) !== null)
      throw new NotificationDestinationConflictError('Ya existe un destino con ese nombre.');
    const now = this.clock.now();
    const destination = NotificationDestination.create({
      ...input,
      createdAt: now,
      id: this.idGenerator.generate(),
      updatedAt: now,
    });
    await this.destinations.save(destination);
    return destination;
  }
}

export class UpdateNotificationDestinationUseCase {
  public constructor(
    private readonly destinations: NotificationDestinationRepository,
    private readonly clock: Clock,
  ) {}

  public async execute(destinationId: string, input: SaveNotificationDestinationInput) {
    const current = await this.destinations.findById(input.companyId, destinationId);
    if (current === null) throw new NotificationDestinationNotFoundError();
    const duplicate = await this.destinations.findByName(input.companyId, input.name);
    if (duplicate !== null && duplicate.props.id !== destinationId)
      throw new NotificationDestinationConflictError('Ya existe un destino con ese nombre.');
    const destination = NotificationDestination.create({
      ...input,
      createdAt: current.props.createdAt,
      id: current.props.id,
      updatedAt: this.clock.now(),
    });
    await this.destinations.save(destination);
    return destination;
  }
}

export class DeleteNotificationDestinationUseCase {
  public constructor(private readonly destinations: NotificationDestinationRepository) {}

  public async execute(companyId: string, destinationId: string): Promise<void> {
    if (!(await this.destinations.delete(companyId, destinationId)))
      throw new NotificationDestinationNotFoundError();
  }
}

export class ListNotificationDestinationsUseCase {
  public constructor(private readonly destinations: NotificationDestinationRepository) {}

  public execute(companyId: string) {
    return this.destinations.list(companyId);
  }
}
