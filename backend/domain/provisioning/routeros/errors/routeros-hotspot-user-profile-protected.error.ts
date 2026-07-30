/**
 * Se lanza al intentar eliminar un Hotspot User Profile marcado por RouterOS como
 * `default = true`. Ese perfil es la configuración base del hotspot y suele contener
 * scripts `on-login`/`on-logout` con lógica de negocio; el borrado se rechaza en el
 * dominio ANTES de emitir cualquier comando al router.
 */
export class RouterOsHotspotUserProfileProtectedError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'RouterOsHotspotUserProfileProtectedError';
    Object.setPrototypeOf(this, RouterOsHotspotUserProfileProtectedError.prototype);
  }
}
