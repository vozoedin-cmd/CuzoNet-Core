import { z } from 'zod';

/**
 * Contrato de entrada de `/ip/firewall/raw`, construido SOLO con capacidades observadas
 * contra RouterOS 7.21.4 en la sonda de la Fase 0-bis.
 *
 * Dos endurecimientos respecto a Filter/NAT/Mangle, ambos deliberados:
 *
 * 1. Todos los esquemas son `.strict()`. Los otros recursos usan el modo por defecto de Zod,
 *    que descarta las claves desconocidas EN SILENCIO: un `connectionState` enviado a Raw se
 *    perdería sin avisar y el llamador creería que se aplicó. Aquí se rechaza.
 * 2. Las direcciones son IPv4 exclusivamente. Este recurso escribe en `/ip/firewall/raw`,
 *    la tabla IPv4; `/ipv6/firewall/raw` es otro recurso con su propio contrato, y aceptar
 *    una dirección IPv6 aquí produciría una regla que el router no puede aplicar.
 */

const MAX_COMMENT_LENGTH = 200;
const MAX_RULE_REFERENCE_LENGTH = 128;
const MAX_MARK_LENGTH = 64;
const MAX_ADDRESS_LIST_LENGTH = 64;
const MAX_LOG_PREFIX_LENGTH = 64;
const noControlChars = /^[\x20-\x7E]*$/;

const ruleReferenceSchema = z
  .string()
  .min(1, 'La referencia de la regla no puede estar vacía.')
  .max(MAX_RULE_REFERENCE_LENGTH, `La referencia de la regla no puede exceder los ${MAX_RULE_REFERENCE_LENGTH} caracteres.`)
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    'La referencia de la regla solo puede contener letras, números, guiones, guiones bajos y puntos.',
  );

/** Solo las dos chains integradas. Ver `RawChain`: el router acepta cualquier string. */
const chainSchema = z.enum(['prerouting', 'output'], {
  message: 'Debe ser una de: prerouting, output.',
});

/** Las ocho acciones observadas. `notrack` queda fuera: capacidad no certificada. */
const actionSchema = z.enum(
  ['accept', 'drop', 'log', 'passthrough', 'return', 'jump', 'add-src-to-address-list', 'add-dst-to-address-list'],
  {
    message:
      'Debe ser una de: accept, drop, log, passthrough, return, jump, add-src-to-address-list, add-dst-to-address-list.',
  },
);

const KNOWN_PROTOCOLS = [
  'tcp', 'udp', 'icmp', 'gre', 'ipsec-esp', 'ipsec-ah', 'ospf', 'igmp', 'vrrp', 'sctp', 'ipencap',
] as const;
/** Protocolos que llevan puertos. `srcPort`/`dstPort` sin uno de estos no matchea nada. */
const PORT_BEARING_PROTOCOLS = ['tcp', 'udp', 'sctp'] as const;
const numericProtocolPattern = /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/;
const protocolSchema = z
  .string()
  .refine(
    (value) => (KNOWN_PROTOCOLS as readonly string[]).includes(value.toLowerCase()) || numericProtocolPattern.test(value),
    { message: 'Debe ser un protocolo RouterOS conocido (tcp, udp, icmp, ...) o un número de protocolo IP (0-255).' },
  )
  .optional();

const ipv4Octet = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])';
const ipv4CidrPattern = new RegExp(`^${ipv4Octet}(\\.${ipv4Octet}){3}(\\/(3[0-2]|[12]?[0-9]))?$`);
const addressSpecSchema = z
  .string()
  .refine(
    (value) => ipv4CidrPattern.test(value.startsWith('!') ? value.slice(1) : value),
    {
      message:
        'Debe ser una dirección IPv4 válida, con prefijo CIDR y negación "!" opcionales. ' +
        'IPv6 no se admite: este recurso escribe en /ip/firewall/raw.',
    },
  )
  .optional();

const portToken = /^(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3})$/;
const portSpecSchema = z
  .string()
  .refine(
    (value) => {
      const tokens = value.split(',');
      return (
        tokens.length > 0 &&
        tokens.every((token) => {
          const parts = token.split('-');
          if (parts.length === 1) return portToken.test(parts[0]!);
          if (parts.length !== 2) return false;
          if (!portToken.test(parts[0]!) || !portToken.test(parts[1]!)) return false;
          // Rango invertido: RouterOS lo acepta y no matchea nada. Se rechaza aqui.
          return Number(parts[0]) <= Number(parts[1]);
        })
      );
    },
    {
      message:
        'Debe ser un puerto, lista separada por comas y/o rangos válidos (1-65535) con el ' +
        'extremo inferior primero, p.ej. "80,443,1000-2000".',
    },
  )
  .optional();

const interfaceSchema = z
  .string()
  .max(63, 'El nombre de interfaz no puede exceder los 63 caracteres.')
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Debe ser un nombre de interfaz RouterOS válido.')
  .optional();

const addressListNameSchema = z
  .string()
  .min(1, 'El nombre de la address list no puede estar vacío.')
  .max(MAX_ADDRESS_LIST_LENGTH, `El nombre de la address list no puede exceder los ${MAX_ADDRESS_LIST_LENGTH} caracteres.`)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Debe ser un nombre de address list RouterOS válido.')
  .optional();

const TCP_FLAGS = ['fin', 'syn', 'rst', 'psh', 'ack', 'urg', 'ece', 'cwr'] as const;
const tcpFlagsSchema = z
  .string()
  .refine(
    (value) =>
      value
        .split(',')
        .map((token) => token.trim().toLowerCase())
        .every((token) => (TCP_FLAGS as readonly string[]).includes(token.startsWith('!') ? token.slice(1) : token)),
    { message: `Debe ser una lista separada por comas de: ${TCP_FLAGS.join(', ')}, con "!" opcional.` },
  )
  .optional();

const markSchema = z
  .string()
  .min(1, 'El nombre de la marca no puede estar vacío.')
  .max(MAX_MARK_LENGTH, `El nombre de la marca no puede exceder los ${MAX_MARK_LENGTH} caracteres.`)
  .regex(/^[A-Za-z0-9_.-]+$/, 'El nombre de la marca solo puede contener letras, números, guiones, guiones bajos y puntos.')
  .optional();

/** Duración RouterOS observada en la sonda como `1m`. `0` significa "sin expiración". */
const durationSchema = z
  .string()
  .regex(/^(0|(\d+[dhms])+)$/, 'Debe ser una duración RouterOS, p.ej. "30s", "10m", "1h30m" o "0".')
  .optional();

const logPrefixSchema = z
  .string()
  .max(MAX_LOG_PREFIX_LENGTH, `El prefijo de log no puede exceder los ${MAX_LOG_PREFIX_LENGTH} caracteres.`)
  .regex(noControlChars, 'El prefijo de log contiene caracteres de control no permitidos.')
  .optional();

const commentSchema = z
  .string()
  .max(MAX_COMMENT_LENGTH, `El comentario no puede exceder los ${MAX_COMMENT_LENGTH} caracteres.`)
  .regex(noControlChars, 'El comentario contiene caracteres de control no permitidos.')
  .optional();

const positionSchema = z.number().int().min(0, 'La posición debe ser un entero mayor o igual a cero.');

const baseRouterOsRawRuleSchema = z.object({
  routerId: z.string().min(1, 'El routerId no puede estar vacío.'),
  ruleReference: ruleReferenceSchema,
});

const rawMatchFields = {
  dstAddress: addressSpecSchema,
  dstAddressList: addressListNameSchema,
  dstPort: portSpecSchema,
  inInterface: interfaceSchema,
  outInterface: interfaceSchema,
  packetMark: markSchema,
  protocol: protocolSchema,
  srcAddress: addressSpecSchema,
  srcAddressList: addressListNameSchema,
  srcPort: portSpecSchema,
  tcpFlags: tcpFlagsSchema,
};

const rawEffectFields = {
  addressList: addressListNameSchema,
  addressListTimeout: durationSchema,
  jumpTarget: interfaceSchema,
  log: z.boolean().optional(),
  logPrefix: logPrefixSchema,
};

/** Campos que exigen un protocolo con puertos para significar algo. */
function checkPortProtocol(
  value: { dstPort?: string | undefined; protocol?: string | undefined; srcPort?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  for (const field of ['srcPort', 'dstPort'] as const) {
    if (value[field] === undefined) continue;
    const protocol = value.protocol?.toLowerCase();
    if (protocol === undefined || !(PORT_BEARING_PROTOCOLS as readonly string[]).includes(protocol)) {
      ctx.addIssue({
        code: 'custom',
        message: `"${field}" exige un protocolo con puertos: ${PORT_BEARING_PROTOCOLS.join(', ')}.`,
        path: [field],
      });
    }
  }
}

/** `tcpFlags` solo tiene sentido sobre TCP. */
function checkTcpFlagsProtocol(
  value: { protocol?: string | undefined; tcpFlags?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (value.tcpFlags !== undefined && value.protocol?.toLowerCase() !== 'tcp') {
    ctx.addIssue({ code: 'custom', message: '"tcpFlags" exige protocol=tcp.', path: ['tcpFlags'] });
  }
}

/** Coherencia acción/acompañante observada: jump exige jumpTarget, add-*-to-address-list exige addressList. */
function checkActionCompanion(
  value: { action?: string | undefined; addressList?: string | undefined; jumpTarget?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (value.action === 'jump' && (value.jumpTarget === undefined || value.jumpTarget.length === 0)) {
    ctx.addIssue({ code: 'custom', message: 'La acción "jump" requiere especificar jumpTarget.', path: ['jumpTarget'] });
  }
  if (
    (value.action === 'add-src-to-address-list' || value.action === 'add-dst-to-address-list') &&
    (value.addressList === undefined || value.addressList.length === 0)
  ) {
    ctx.addIssue({
      code: 'custom',
      message: `La acción "${value.action}" requiere especificar addressList.`,
      path: ['addressList'],
    });
  }
}

/**
 * Direccion INVERSA de la coherencia, y solo para `jumpTarget`: `jump` es la unica accion que
 * lo usa, asi que declararlo con cualquier otra es una contradiccion.
 *
 * Encontrado por la certificacion E2E de la Fase 6 contra RouterOS 7.21.4: al crear una regla
 * `action=accept` con `jumpTarget`, el ROUTER DESCARTA EL CAMPO EN SILENCIO. La regla se
 * creaba sin el, y lo unico que salvaba la situacion era la postcondicion del adapter, que
 * detectaba la divergencia y devolvia `ROUTEROS_RAW_RULE_POSTCONDITION_FAILED` — un fallo
 * honesto, pero tardio y con la regla ya creada en el router. Rechazarlo en la frontera
 * convierte ese fallo de postcondicion en una validacion clara y sin efectos.
 *
 * Solo aplica cuando la carga util declara AMBOS: asi un patch que solo cambia la accion
 * puede seguir apoyandose en el `jumpTarget` que la regla ya tiene en el router, que es la
 * conducta de `update` certificada en la Fase 6.
 *
 * `addressList` NO lleva la prohibicion inversa: la comparten dos acciones y no se ha
 * observado que el router lo descarte, asi que anadirla seria inventar una regla.
 */
function checkJumpTargetProhibition(
  value: { action?: string | undefined; jumpTarget?: string | undefined },
  ctx: z.RefinementCtx,
): void {
  if (value.jumpTarget !== undefined && value.action !== undefined && value.action !== 'jump') {
    ctx.addIssue({
      code: 'custom',
      message: `"jumpTarget" solo es válido con action="jump"; con "${value.action}" el router lo descarta en silencio.`,
      path: ['jumpTarget'],
    });
  }
}

export const routerOsRawRuleAddSchema = baseRouterOsRawRuleSchema
  .extend({
    ...rawMatchFields,
    ...rawEffectFields,
    action: actionSchema,
    actionType: z.literal('routeros.firewall.raw.add'),
    chain: chainSchema,
    comment: commentSchema,
    disabled: z.boolean().optional(),
    position: positionSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    checkPortProtocol(value, ctx);
    checkTcpFlagsProtocol(value, ctx);
    checkActionCompanion(value, ctx);
    checkJumpTargetProhibition(value, ctx);
  });
export type RouterOsRawRuleAddInput = z.infer<typeof routerOsRawRuleAddSchema>;

/**
 * En `update` la coherencia acción/acompañante NO se comprueba aquí: un patch puede cambiar
 * solo la acción y apoyarse en el `jumpTarget` que la regla ya tiene en el router. Esa
 * comprobación necesita el estado observado y corresponde al adapter de la Fase 4, igual que
 * en Mangle.
 */
export const routerOsRawRuleUpdateSchema = baseRouterOsRawRuleSchema
  .extend({
    ...rawMatchFields,
    ...rawEffectFields,
    action: actionSchema.optional(),
    actionType: z.literal('routeros.firewall.raw.update'),
    chain: chainSchema.optional(),
    comment: commentSchema,
    disabled: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    checkPortProtocol(value, ctx);
    checkTcpFlagsProtocol(value, ctx);
    // Solo dispara cuando el propio patch declara accion y jumpTarget a la vez, que es una
    // contradiccion visible sin consultar el router. Un patch que declara solo uno de los dos
    // sigue resolviendose contra el estado observado en el adapter.
    checkJumpTargetProhibition(value, ctx);
  });
export type RouterOsRawRuleUpdateInput = z.infer<typeof routerOsRawRuleUpdateSchema>;

export const routerOsRawRuleMoveSchema = baseRouterOsRawRuleSchema
  .extend({ actionType: z.literal('routeros.firewall.raw.move'), position: positionSchema })
  .strict();
export type RouterOsRawRuleMoveInput = z.infer<typeof routerOsRawRuleMoveSchema>;

export const routerOsRawRuleEnableSchema = baseRouterOsRawRuleSchema
  .extend({ actionType: z.literal('routeros.firewall.raw.enable') })
  .strict();
export type RouterOsRawRuleEnableInput = z.infer<typeof routerOsRawRuleEnableSchema>;

export const routerOsRawRuleDisableSchema = baseRouterOsRawRuleSchema
  .extend({ actionType: z.literal('routeros.firewall.raw.disable') })
  .strict();
export type RouterOsRawRuleDisableInput = z.infer<typeof routerOsRawRuleDisableSchema>;

export const routerOsRawRuleRemoveSchema = baseRouterOsRawRuleSchema
  .extend({ actionType: z.literal('routeros.firewall.raw.remove') })
  .strict();
export type RouterOsRawRuleRemoveInput = z.infer<typeof routerOsRawRuleRemoveSchema>;

export const routerOsRawRuleInputSchema = z.discriminatedUnion('actionType', [
  routerOsRawRuleAddSchema,
  routerOsRawRuleUpdateSchema,
  routerOsRawRuleMoveSchema,
  routerOsRawRuleEnableSchema,
  routerOsRawRuleDisableSchema,
  routerOsRawRuleRemoveSchema,
]);

export type RouterOsRawRuleInput = z.infer<typeof routerOsRawRuleInputSchema>;

/** targetType que debe declarar toda solicitud de aprovisionamiento de reglas Raw. */
export const RAW_RULE_TARGET_TYPE = 'Firewall Raw Rule';

export interface RawRuleCoherenceViolation {
  readonly errorCode: 'ROUTEROS_INVALID_TARGET_TYPE' | 'ROUTEROS_ACTION_MISMATCH' | 'ROUTEROS_TARGET_MISMATCH';
  readonly errorMessage: string;
}

/**
 * Coherencia entre el SOBRE de la solicitud y su carga útil, siguiendo el endurecimiento que
 * hoy solo tiene Filter.
 *
 * El sobre (`actionType`, `target`) y el payload viajan por separado, así que pueden
 * contradecirse: una solicitud etiquetada `remove` con un payload `add`, o dirigida a un
 * `targetId` que no es la regla que el payload nombra. Sin esta comprobación mandaría el
 * payload y el sobre quedaría como una etiqueta engañosa en el historial — que es
 * exactamente de donde el estado deseado reconstruye la configuración.
 *
 * Devuelve la violación o `null`. El adapter de la Fase 4 la conectará a su `execute`; se
 * entrega ya aislada y probada para que ese cableado no arrastre lógica nueva.
 */
export function findRawRuleCoherenceViolation(envelope: {
  readonly actionType: string;
  readonly inputSnapshotJson: string;
  readonly target: { readonly id: string; readonly type: string };
}): RawRuleCoherenceViolation | null {
  if (envelope.target.type !== RAW_RULE_TARGET_TYPE) {
    return {
      errorCode: 'ROUTEROS_INVALID_TARGET_TYPE',
      errorMessage: `El targetType (${envelope.target.type}) es inválido para reglas Raw; se esperaba "${RAW_RULE_TARGET_TYPE}".`,
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(envelope.inputSnapshotJson);
  } catch {
    // El JSON inválido lo reporta la validación de esquema, no esta comprobación.
    return null;
  }
  if (payload === null || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;

  if (typeof record.actionType === 'string' && record.actionType !== envelope.actionType) {
    return {
      errorCode: 'ROUTEROS_ACTION_MISMATCH',
      errorMessage: `El actionType externo (${envelope.actionType}) no coincide con el interno (${record.actionType}).`,
    };
  }

  if (typeof record.ruleReference === 'string' && record.ruleReference !== envelope.target.id) {
    return {
      errorCode: 'ROUTEROS_TARGET_MISMATCH',
      errorMessage: `El targetId externo (${envelope.target.id}) no coincide con ruleReference (${record.ruleReference}).`,
    };
  }

  return null;
}
