import type { NotificationChannelType, NotificationEventType } from './types.js';

export interface NotificationDestinationProps {
  channel: NotificationChannelType;
  companyId: string;
  configurationReference: string;
  address?: string;
  createdAt: Date;
  enabled: boolean;
  eventTypes: readonly NotificationEventType[];
  id: string;
  minimumSeverity?: 'info' | 'warning' | 'minor' | 'major' | 'critical';
  name: string;
  updatedAt: Date;
}

export class NotificationDestination {
  private constructor(public readonly props: NotificationDestinationProps) {}

  public static create(props: NotificationDestinationProps): NotificationDestination {
    if (props.id.trim().length === 0 || props.companyId.trim().length === 0)
      throw new TypeError('id y companyId son requeridos.');
    if (props.name.trim().length === 0) throw new TypeError('name es requerido.');
    if (!/^[A-Z][A-Z0-9_]{2,99}$/.test(props.configurationReference))
      throw new TypeError('configurationReference debe ser una referencia de entorno válida.');
    if (props.eventTypes.length === 0) throw new TypeError('Debe configurarse al menos un evento.');
    
    if (props.channel === 'whatsapp' && props.enabled) {
      if (typeof props.address !== 'string' || props.address.trim().length === 0) {
        throw new TypeError('address es obligatorio para destinos WhatsApp habilitados.');
      }
    }

    return new NotificationDestination({
      ...props,
      eventTypes: Object.freeze([...new Set(props.eventTypes)]),
      name: props.name.trim(),
    });
  }

  public static reconstitute(props: NotificationDestinationProps): NotificationDestination {
    return new NotificationDestination({
      ...props,
      eventTypes: Object.freeze([...props.eventTypes]),
    });
  }
}
