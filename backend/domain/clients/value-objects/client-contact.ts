import { InvalidClientDataError } from '../errors/invalid-client-data.error.js';

export const clientContactTypes = ['phone', 'email', 'whatsapp'] as const;
export type ClientContactType = (typeof clientContactTypes)[number];

export interface ClientContactPrimitives {
  isPrimary: boolean;
  type: ClientContactType;
  value: string;
}

export class ClientContact {
  private constructor(
    public readonly type: ClientContactType,
    public readonly value: string,
    public readonly normalizedValue: string,
    public readonly isPrimary: boolean,
  ) {}

  public static create({ type, value, isPrimary }: ClientContactPrimitives): ClientContact {
    if (!clientContactTypes.some((contactType) => contactType === type)) {
      throw new InvalidClientDataError('contacts.type', 'Tipo de contacto no permitido.');
    }

    const displayValue = value.trim();
    if (displayValue.length < 1 || displayValue.length > 180) {
      throw new InvalidClientDataError('contacts.value', 'Debe contener entre 1 y 180 caracteres.');
    }

    const normalizedValue = ClientContact.normalize(type, displayValue);
    return new ClientContact(type, displayValue, normalizedValue, isPrimary);
  }

  private static normalize(type: ClientContactType, value: string): string {
    if (type === 'email') {
      const normalizedEmail = value.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        throw new InvalidClientDataError('contacts.value', 'Debe ser un correo válido.');
      }
      return normalizedEmail;
    }

    const normalizedPhone = value.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
      throw new InvalidClientDataError('contacts.value', 'Los teléfonos deben usar formato E.164.');
    }
    return normalizedPhone;
  }

  public toPrimitives(): ClientContactPrimitives {
    return {
      isPrimary: this.isPrimary,
      type: this.type,
      value: this.value,
    };
  }
}
