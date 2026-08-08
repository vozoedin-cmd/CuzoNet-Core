import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';

const CHAINS = ['prerouting', 'output'] as const;
export type RawChainName = (typeof CHAINS)[number];

/**
 * Chain de `/ip/firewall/raw`, restringida a las dos integradas.
 *
 * ESTA RESTRICCIÓN ES UNA DECISIÓN DE PRODUCTO, NO UNA VALIDACIÓN DEL ROUTER. La sonda de
 * la Fase 0-bis contra RouterOS 7.21.4 demostró que el router acepta CUALQUIER cadena como
 * nombre de chain en Raw — `input`, `forward`, `postrouting`, `srcnat`, `dstnat` e incluso
 * `inexistente` fueron aceptadas sin protestar — porque Raw admite chains personalizadas
 * creadas al vuelo por `action=jump`.
 *
 * Esa permisividad es precisamente el peligro: un `preroutng` mal escrito se crearía como
 * chain personalizada, no recibiría tráfico jamás y no daría ningún síntoma. El router no
 * puede distinguir el typo de la intención; CuzoNet sí, porque no ofrece chains
 * personalizadas. Contrasta con `action`, que el router SÍ valida
 * (`input does not match any value of action`) y donde por tanto la validación local es
 * solo una cortesía.
 *
 * Si algún día se ofrecieran chains personalizadas, este VO es el punto donde se abriría —
 * y `jumpTarget` es el campo que las nombraría.
 */
export class RawChain {
  private constructor(public readonly value: RawChainName) {}

  public static create(raw: string): RawChain {
    const value = raw.trim().toLowerCase();
    if (!(CHAINS as readonly string[]).includes(value)) {
      throw new InvalidProvisioningDataError('chain', `Debe ser una de: ${CHAINS.join(', ')}.`);
    }
    return new RawChain(value as RawChainName);
  }
}
