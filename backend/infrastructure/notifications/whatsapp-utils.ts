export function normalizeWhatsAppRecipient(
  address: string,
  defaultCountryCode?: string,
): string {
  if (address.trim().length === 0) {
    throw new Error('El número de WhatsApp no puede estar vacío.');
  }

  // Reject explicitly @g.us or other domains
  if (address.includes('@')) {
    const [_, domain] = address.split('@');
    if (domain === 'g.us') {
      throw new Error('No se admiten envíos a grupos.');
    }
    if (domain !== 's.whatsapp.net') {
      throw new Error('El dominio JID no es válido.');
    }
  }

  // Remove spaces, dashes, parenthesis, + and domain
  let digits = (address.split('@')[0] || '').replace(/[\s\-()+]/g, '');

  if (!/^\d+$/.test(digits)) {
    throw new Error('El número contiene caracteres no permitidos.');
  }

  // Apply defaultCountryCode if provided and not already starting with it
  if (
    defaultCountryCode !== undefined &&
    defaultCountryCode.trim().length > 0 &&
    !digits.startsWith(defaultCountryCode)
  ) {
    // Basic heuristic: if it's very short, it probably needs the country code
    if (digits.length <= 10) {
      digits = `${defaultCountryCode}${digits}`;
    }
  }

  if (digits.length < 8) {
    throw new Error('El número es demasiado corto.');
  }

  if (digits.length > 15) {
    throw new Error('El número es demasiado largo.');
  }

  return digits;
}

export function maskWhatsAppRecipient(address: string): string {
  try {
    const normalized = normalizeWhatsAppRecipient(address);
    const length = normalized.length;
    if (length <= 6) return '***';
    const firstPart = normalized.slice(0, 3);
    const lastPart = normalized.slice(-3);
    const asterisks = '*'.repeat(length - 6);
    return `${firstPart}${asterisks}${lastPart}`;
  } catch {
    return '***';
  }
}
