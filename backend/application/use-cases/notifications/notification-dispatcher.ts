import type {
  NotificationChannel,
  NotificationCredentialProvider,
  NotificationSendResult,
} from '../../ports/notifications/channels.js';
import type { Notification } from '../../../domain/notifications/notification.js';
import type { NotificationDestination } from '../../../domain/notifications/notification-destination.js';
import type { NotificationTemplateRenderer } from '../../../domain/notifications/notification-template.js';
import type { NotificationChannelType } from '../../../domain/notifications/types.js';

export class NotificationChannelRegistry {
  private readonly channels: ReadonlyMap<NotificationChannelType, NotificationChannel>;

  public constructor(channels: readonly NotificationChannel[]) {
    this.channels = new Map(channels.map((channel) => [channel.type, channel]));
    if (this.channels.size !== channels.length)
      throw new Error('No se permiten canales de notificación duplicados.');
  }

  public get(type: NotificationChannelType): NotificationChannel | null {
    return this.channels.get(type) ?? null;
  }
}

export class NotificationDispatcher {
  public constructor(
    private readonly registry: NotificationChannelRegistry,
    private readonly renderer: NotificationTemplateRenderer,
    private readonly credentials: NotificationCredentialProvider,
  ) {}

  public async dispatch(
    notification: Notification,
    destination: NotificationDestination | null,
  ): Promise<NotificationSendResult> {
    if (destination === null)
      return permanent('DESTINATION_NOT_FOUND', 'El destino de notificación ya no existe.');
    if (destination.props.companyId !== notification.props.companyId)
      return permanent(
        'DESTINATION_NOT_FOUND',
        'El destino de notificación no pertenece a la compañía.',
      );
    if (!destination.props.enabled)
      return permanent('DESTINATION_DISABLED', 'El destino de notificación está deshabilitado.');
    if (destination.props.channel !== notification.props.channel)
      return permanent('DESTINATION_CHANNEL_MISMATCH', 'El canal del destino no coincide.');

    const channel = this.registry.get(notification.props.channel);
    if (channel === null)
      return permanent('CHANNEL_NOT_REGISTERED', 'El canal de notificación no está registrado.');

    let rendered;
    try {
      rendered = this.renderer.render({
        channel: notification.props.channel,
        event: notification.props.payload,
        notificationId: notification.props.id,
        priority: notification.props.priority,
        templateCode: notification.props.templateCode,
      });
    } catch {
      return permanent('INVALID_TEMPLATE', 'La plantilla de notificación no es válida.');
    }

    const credentials = await this.credentials.get({
      channel: notification.props.channel,
      companyId: notification.props.companyId,
      destination,
    });
    if (credentials === null || credentials.channel !== notification.props.channel)
      return permanent('MISSING_CONFIGURATION', 'No existe configuración segura para el destino.');

    try {
      return await channel.send({ credentials, destination, rendered });
    } catch (error) {
      return {
        errorCode: 'CHANNEL_EXCEPTION',
        errorMessage: error instanceof Error ? error.message : 'Fallo desconocido del canal.',
        type: 'retryableFailure',
      };
    }
  }
}

function permanent(errorCode: string, errorMessage: string): NotificationSendResult {
  return { errorCode, errorMessage, type: 'permanentFailure' };
}
