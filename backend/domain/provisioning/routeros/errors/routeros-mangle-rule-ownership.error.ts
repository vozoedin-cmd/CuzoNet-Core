/**
 * La regla Mangle resuelta no lleva un marcador de propiedad válido de esta instalación.
 *
 * Se rechazan `foreign`, `malformed` y `unmanaged`. Hoy la guarda nunca dispara: la
 * resolución es siempre por referencia administrada y `parseOwnership` solo adjunta
 * `ruleReference` al estado `valid`, así que una regla ajena no llega hasta aquí. Se deja
 * de forma defensiva para que la garantía sea EXIGIDA y no emergente: si algún día la
 * resolución se afloja —por `.id`, por chain+action, por posición— una regla ajena se
 * rechaza en vez de mutarse en silencio.
 *
 * En Mangle lo que protege es concreto: las reglas de marcado que un operador escribió a
 * mano suelen ser la base de todo el QoS del router, y reescribir su acción o su marca
 * redirige tráfico de clientes sin que nadie lo haya pedido.
 *
 * `malformed` también se rechaza: repararla exigiría reescribir su comentario para
 * reclamar su propiedad, decisión de producto que el dominio no ha tomado.
 */
export class RouterOsMangleRuleOwnershipError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsMangleRuleOwnershipError';
    Object.setPrototypeOf(this, RouterOsMangleRuleOwnershipError.prototype);
  }
}
