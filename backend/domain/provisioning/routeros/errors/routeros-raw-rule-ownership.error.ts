/**
 * La regla Raw resuelta no lleva un marcador de propiedad válido de esta instalación.
 *
 * Se rechazan `foreign`, `malformed` y `unmanaged`. Hoy la guarda nunca dispara: la
 * resolución es siempre por referencia administrada y `parseOwnership` solo adjunta
 * `ruleReference` al estado `valid`, así que una regla ajena no llega hasta aquí. Se deja de
 * forma defensiva para que la garantía sea EXIGIDA y no emergente: si algún día la
 * resolución se afloja —por `.id`, por chain+action, por posición— una regla ajena se
 * rechaza en vez de mutarse en silencio.
 *
 * En Raw lo que protege es especialmente delicado: estas reglas deciden qué tráfico entra al
 * connection tracking, y un `notrack` o un `drop` escritos a mano por el operador suelen ser
 * la primera línea de defensa del router. Reescribirlos redirigiría o expondría tráfico sin
 * que nadie lo haya pedido.
 *
 * `malformed` también se rechaza: repararla exigiría reescribir su comentario para reclamar
 * su propiedad, decisión de producto que el dominio no ha tomado.
 */
export class RouterOsRawRuleOwnershipError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsRawRuleOwnershipError';
    Object.setPrototypeOf(this, RouterOsRawRuleOwnershipError.prototype);
  }
}
