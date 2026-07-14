
import { Notification } from '../../../domain/notifications/notification.js';
import type { NotificationRepository, NotificationTemplateRepository, NotificationIdempotencyPort } from '../../ports/notifications/repositories.js';
import type { CreateNotificationRequest, NotificationDto } from '../../dto/notifications/notification.dto.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';

export class CreateNotificationUseCase {
  constructor(
    private readonly repo: NotificationRepository,
    private readonly templateRepo: NotificationTemplateRepository,
    private readonly idempotencyPort: NotificationIdempotencyPort,
    private readonly idGenerator: IdGenerator
  ) {}

  public async execute(req: CreateNotificationRequest): Promise<NotificationDto> {
    if (req.idempotencyKey) {
      const isNew = await this.idempotencyPort.checkAndLock(req.idempotencyKey);
      if (!isNew) {
        throw new Error('Duplicate request (Idempotency Key already used)');
      }
    }

    const template = await this.templateRepo.findByCode(req.companyId, req.templateCode);
    if (!template) throw new Error('Template not found');

    const publishedVersion = template.getPublishedVersion();
    if (!publishedVersion) throw new Error('No published version available for template');

    const notification = Notification.create({
      id: this.idGenerator.generate(),
      companyId: req.companyId,
      templateId: template.props.id,
      templateVersionId: publishedVersion.id,
      variables: req.variables,
      idempotencyKey: req.idempotencyKey,
      destinations: req.destinations,
      deliveryIdGenerator: () => this.idGenerator.generate()
    });

    await this.repo.save(notification);

    return {
      id: notification.props.id,
      status: notification.props.status,
      createdAt: notification.props.createdAt
    };
  }
}
