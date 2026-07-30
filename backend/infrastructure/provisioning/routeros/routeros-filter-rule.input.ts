import { z } from 'zod';

const MAX_COMMENT_LENGTH = 200;
const MAX_RULE_REFERENCE_LENGTH = 128;
const MAX_ROUTEROS_COMMENT_LENGTH = 255;
const noControlChars = /^[\x20-\x7E]*$/;

const ruleReferenceSchema = z
  .string()
  .min(1, 'La referencia de la regla no puede estar vacía.')
  .max(MAX_RULE_REFERENCE_LENGTH, `La referencia de la regla no puede exceder los ${MAX_RULE_REFERENCE_LENGTH} caracteres.`)
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    'La referencia de la regla solo puede contener letras, números, guiones, guiones bajos y puntos.',
  );

const chainSchema = z.enum(['input', 'forward', 'output'], {
  message: 'Debe ser una de: input, forward, output.',
});

const actionSchema = z.enum(['accept', 'drop', 'reject', 'log', 'passthrough'], {
  message: 'Debe ser una de: accept, drop, reject, log, passthrough.',
});

const KNOWN_PROTOCOLS = [
  'tcp',
  'udp',
  'icmp',
  'gre',
  'ipsec-esp',
  'ipsec-ah',
  'ospf',
  'igmp',
  'vrrp',
  'sctp',
  'ipencap',
] as const;
const numericProtocolPattern = /^(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])$/;
const protocolSchema = z
  .string()
  .refine(
    (value) => (KNOWN_PROTOCOLS as readonly string[]).includes(value.toLowerCase()) || numericProtocolPattern.test(value),
    { message: 'Debe ser un protocolo RouterOS conocido (tcp, udp, icmp, ...) o un número de protocolo IP (0-255).' },
  )
  .optional();

const ipv4Octet = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])';
const ipv4Pattern = new RegExp(`^${ipv4Octet}(\\.${ipv4Octet}){3}(\\/(3[0-2]|[12]?[0-9]))?$`);
const addressSpecSchema = z
  .string()
  .refine(
    (value) => {
      const address = value.startsWith('!') ? value.slice(1) : value;
      return ipv4Pattern.test(address);
    },
    { message: 'Debe ser una dirección IPv4 válida, con prefijo CIDR y negación "!" opcionales. IPv6 no está soportado en esta fase.' },
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
          if (parts.length === 2) {
            const min = parseInt(parts[0]!, 10);
            const max = parseInt(parts[1]!, 10);
            return portToken.test(parts[0]!) && portToken.test(parts[1]!) && min <= max;
          }
          return false;
        })
      );
    },
    { message: 'Debe ser un puerto, lista separada por comas y/o rangos válidos (1-65535), sin rangos invertidos.' },
  )
  .optional();

const interfaceSchema = z
  .string()
  .max(63, 'El nombre de interfaz no puede exceder los 63 caracteres.')
  .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Debe ser un nombre de interfaz RouterOS válido.')
  .optional();

const CONNECTION_STATES = ['new', 'established', 'related', 'invalid', 'untracked'] as const;
const connectionStateSchema = z
  .string()
  .refine(
    (value) => {
      const tokens = value.split(',').map((token) => token.trim().toLowerCase());
      return tokens.length > 0 && tokens.every((token) => (CONNECTION_STATES as readonly string[]).includes(token));
    },
    { message: `Debe ser una lista separada por comas de: ${CONNECTION_STATES.join(', ')}.` },
  )
  .optional();

const commentSchema = z
  .string()
  .max(MAX_COMMENT_LENGTH, `El comentario no puede exceder los ${MAX_COMMENT_LENGTH} caracteres.`)
  .regex(noControlChars, 'El comentario contiene caracteres de control no permitidos.')
  .optional();

const positionSchema = z.number().int().min(0, 'La posición debe ser un entero mayor o igual a cero.');

const baseRouterOsFilterRuleSchema = z.object({
  routerId: z.string().min(1, 'El routerId no puede estar vacío.'),
  ruleReference: ruleReferenceSchema,
});

const PROTOCOLS_WITH_PORTS = ['tcp', 'udp', 'sctp', 'dccp'];

function checkPortsRequireProtocol(data: { protocol?: string | undefined, srcPort?: string | undefined, dstPort?: string | undefined }) {
  if (data.srcPort !== undefined || data.dstPort !== undefined) {
    if (!data.protocol || !PROTOCOLS_WITH_PORTS.includes(data.protocol.toLowerCase())) {
      return false;
    }
  }
  return true;
}

function checkCompositeCommentLength(data: { ruleReference: string, comment?: string | undefined }) {
  const marker = `cuzonet:firewall-filter:${data.ruleReference}`;
  const trimmed = data.comment?.trim();
  const total = trimmed && trimmed.length > 0 ? marker.length + 1 + trimmed.length : marker.length;
  return total <= MAX_ROUTEROS_COMMENT_LENGTH;
}

export const routerOsFilterRuleAddSchema = baseRouterOsFilterRuleSchema.extend({
  action: actionSchema,
  actionType: z.literal('routeros.firewall.filter.add'),
  chain: chainSchema,
  comment: commentSchema,
  connectionState: connectionStateSchema,
  disabled: z.boolean().optional(),
  dstAddress: addressSpecSchema,
  dstPort: portSpecSchema,
  inInterface: interfaceSchema,
  outInterface: interfaceSchema,
  position: positionSchema.optional(),
  protocol: protocolSchema,
  srcAddress: addressSpecSchema,
  srcPort: portSpecSchema,
}).strict()
.refine(checkPortsRequireProtocol, {
  message: 'Para usar srcPort o dstPort se requiere que el protocolo sea tcp, udp, sctp o dccp.',
  path: ['protocol'],
})
.refine(checkCompositeCommentLength, {
  message: `El comentario técnico compuesto excede el límite de ${MAX_ROUTEROS_COMMENT_LENGTH} caracteres.`,
  path: ['comment'],
});
export type RouterOsFilterRuleAddInput = z.infer<typeof routerOsFilterRuleAddSchema>;

export const routerOsFilterRuleUpdateSchema = baseRouterOsFilterRuleSchema.extend({
  action: actionSchema.optional(),
  actionType: z.literal('routeros.firewall.filter.update'),
  chain: chainSchema.optional(),
  comment: commentSchema,
  connectionState: connectionStateSchema,
  disabled: z.boolean().optional(),
  dstAddress: addressSpecSchema,
  dstPort: portSpecSchema,
  inInterface: interfaceSchema,
  outInterface: interfaceSchema,
  protocol: protocolSchema,
  srcAddress: addressSpecSchema,
  srcPort: portSpecSchema,
}).strict()
.refine(checkPortsRequireProtocol, {
  message: 'Para usar srcPort o dstPort se requiere que el protocolo sea tcp, udp, sctp o dccp.',
  path: ['protocol'],
})
.refine(checkCompositeCommentLength, {
  message: `El comentario técnico compuesto excede el límite de ${MAX_ROUTEROS_COMMENT_LENGTH} caracteres.`,
  path: ['comment'],
});
export type RouterOsFilterRuleUpdateInput = z.infer<typeof routerOsFilterRuleUpdateSchema>;

export const routerOsFilterRuleMoveSchema = baseRouterOsFilterRuleSchema.extend({
  actionType: z.literal('routeros.firewall.filter.move'),
  position: positionSchema,
}).strict();
export type RouterOsFilterRuleMoveInput = z.infer<typeof routerOsFilterRuleMoveSchema>;

export const routerOsFilterRuleEnableSchema = baseRouterOsFilterRuleSchema.extend({
  actionType: z.literal('routeros.firewall.filter.enable'),
}).strict();
export type RouterOsFilterRuleEnableInput = z.infer<typeof routerOsFilterRuleEnableSchema>;

export const routerOsFilterRuleDisableSchema = baseRouterOsFilterRuleSchema.extend({
  actionType: z.literal('routeros.firewall.filter.disable'),
}).strict();
export type RouterOsFilterRuleDisableInput = z.infer<typeof routerOsFilterRuleDisableSchema>;

export const routerOsFilterRuleRemoveSchema = baseRouterOsFilterRuleSchema.extend({
  actionType: z.literal('routeros.firewall.filter.remove'),
}).strict();
export type RouterOsFilterRuleRemoveInput = z.infer<typeof routerOsFilterRuleRemoveSchema>;

export const routerOsFilterRuleInputSchema = z.discriminatedUnion('actionType', [
  routerOsFilterRuleAddSchema,
  routerOsFilterRuleUpdateSchema,
  routerOsFilterRuleMoveSchema,
  routerOsFilterRuleEnableSchema,
  routerOsFilterRuleDisableSchema,
  routerOsFilterRuleRemoveSchema,
]);

export type RouterOsFilterRuleInput = z.infer<typeof routerOsFilterRuleInputSchema>;
