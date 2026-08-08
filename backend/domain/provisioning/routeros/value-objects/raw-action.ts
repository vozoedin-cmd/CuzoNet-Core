import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const ACTIONS = [
  'accept',
  'drop',
  'log',
  'passthrough',
  'return',
  'jump',
  'add-src-to-address-list',
  'add-dst-to-address-list',
] as const;
export type RawActionName = (typeof ACTIONS)[number];

/** Campo que una acción exige para ser ejecutable. `null` si la acción se basta sola. */
export type RawCompanionField = 'jumpTarget' | 'addressList';

const REQUIRED_COMPANION_FIELD: Record<RawActionName, RawCompanionField | null> = {
  accept: null,
  'add-dst-to-address-list': 'addressList',
  'add-src-to-address-list': 'addressList',
  drop: null,
  jump: 'jumpTarget',
  log: null,
  passthrough: null,
  return: null,
};

/**
 * Acción de `/ip/firewall/raw`, limitada a las OCHO observadas contra RouterOS 7.21.4 en la
 * sonda de la Fase 0-bis. Cada una se creó y releyó en el router; ninguna se infirió de la
 * documentación ni por analogía con Filter.
 *
 * `notrack` QUEDA FUERA y es CAPACIDAD NO CERTIFICADA. Es la acción que da sentido a Raw
 * —exime del connection tracking al tráfico que matchea— y por eso mismo no se sondeó: en
 * un router con NAT y firewall con estado, una regla `notrack` habilitada puede cortar la
 * conectividad de clientes. Incorporarla exige su propia sonda autorizada, y hasta entonces
 * el contrato no la admite. Que el router la acepte no está en duda; lo que no está
 * observado es su forma exacta en la respuesta ni sus campos acompañantes.
 *
 * `passthrough` aquí es una ACCIÓN, no el booleano de Mangle: la sonda confirmó que Raw
 * rechaza el parámetro `passthrough` con `unknown parameter passthrough`.
 */
export class RawAction {
  private constructor(public readonly value: RawActionName) {}

  public static create(raw: string): RawAction {
    const value = raw.trim().toLowerCase();
    if (!(ACTIONS as readonly string[]).includes(value)) {
      throw new InvalidProvisioningDataError('action', `Debe ser una de: ${ACTIONS.join(', ')}.`);
    }
    return new RawAction(value as RawActionName);
  }

  /**
   * Campo que esta acción exige, o `null` si no exige ninguno. `jump` sin `jumpTarget` y
   * `add-*-to-address-list` sin `addressList` producen reglas que el router acepta y que no
   * hacen nada útil.
   */
  public requiredCompanionField(): RawCompanionField | null {
    return REQUIRED_COMPANION_FIELD[this.value];
  }
}
