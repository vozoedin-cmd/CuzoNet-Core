import { z } from 'zod';

const MAX_COMMENT_LENGTH = 200;
const MAX_RULE_REFERENCE_LENGTH = 128;
const MAX_MARK_LENGTH = 64;
const noControlChars = /^[\x20-\x7E]*$/;

const ruleReferenceSchema = z
  .string()
  .min(1, 'La referencia de la regla no puede estar vacía.')
  .max(MAX_RULE_REFERENCE_LENGTH, `La referencia de la regla no puede exceder los ${MAX_RULE_REFERENCE_LENGTH} caracteres.`)
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    'La referencia de la regla solo puede contener letras, números, guiones, guiones bajos y puntos.',
  );

const chainSchema = z.enum(['prerouting', 'input', 'forward', 'output', 'postrouting'], {
  message: 'Debe ser una de: prerouting, input, forward, output, postrouting.',
});

const actionSchema = z.enum(['mark-connection', 'mark-packet', 'mark-routing', 'passthrough'], {
  message: 'Debe ser una de: mark-connection, mark-packet, mark-routing, passthrough.',
});

const markSchema = z
  .string()
  .min(1, 'El nombre de la marca no puede estar vacío.')
  .max(MAX_MARK_LENGTH, `El nombre de la marca no puede exceder los ${MAX_MARK_LENGTH} caracteres.`)
  .regex(/^[A-Za-z0-9_.-]+$/, 'El nombre de la marca solo puede contener letras, números, guiones, guiones bajos y puntos.')
  .optional();

const KNOWN_PROTOCOLS = [
  'tcp',
  'udp',
  'icmp',
  'icmpv6',
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
const ipv4CidrPattern = new RegExp(`^${ipv4Octet}(\\.${ipv4Octet}){3}(\\/(3[0-2]|[12]?[0-9]))?$`);
const ipv6Pattern =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))(\/(12[0-8]|1[01][0-9]|[1-9]?[0-9]))?$/;
const addressSpecSchema = z
  .string()
  .refine(
    (value) => {
      const address = value.startsWith('!') ? value.slice(1) : value;
      return ipv4CidrPattern.test(address) || ipv6Pattern.test(address);
    },
    { message: 'Debe ser una dirección IPv4 o IPv6 válida, con prefijo CIDR y negación "!" opcionales.' },
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
          if (parts.length === 2) return portToken.test(parts[0]!) && portToken.test(parts[1]!);
          return false;
        })
      );
    },
    { message: 'Debe ser un puerto, lista separada por comas y/o rangos válidos (1-65535), p.ej. "80,443,1000-2000".' },
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

const baseRouterOsMangleRuleSchema = z.object({
  routerId: z.string().min(1, 'El routerId no puede estar vacío.'),
  ruleReference: ruleReferenceSchema,
});

const mangleMatchFields = {
  connectionMark: markSchema,
  connectionState: connectionStateSchema,
  dstAddress: addressSpecSchema,
  dstPort: portSpecSchema,
  inInterface: interfaceSchema,
  outInterface: interfaceSchema,
  packetMark: markSchema,
  protocol: protocolSchema,
  routingMark: markSchema,
  srcAddress: addressSpecSchema,
  srcPort: portSpecSchema,
};

export const routerOsMangleRuleAddSchema = baseRouterOsMangleRuleSchema.extend({
  ...mangleMatchFields,
  action: actionSchema,
  actionType: z.literal('routeros.firewall.mangle.add'),
  chain: chainSchema,
  comment: commentSchema,
  disabled: z.boolean().optional(),
  newConnectionMark: markSchema,
  newPacketMark: markSchema,
  newRoutingMark: markSchema,
  passthrough: z.boolean().optional(),
  position: positionSchema.optional(),
});
export type RouterOsMangleRuleAddInput = z.infer<typeof routerOsMangleRuleAddSchema>;

export const routerOsMangleRuleUpdateSchema = baseRouterOsMangleRuleSchema.extend({
  ...mangleMatchFields,
  action: actionSchema.optional(),
  actionType: z.literal('routeros.firewall.mangle.update'),
  chain: chainSchema.optional(),
  comment: commentSchema,
  disabled: z.boolean().optional(),
  newConnectionMark: markSchema,
  newPacketMark: markSchema,
  newRoutingMark: markSchema,
  passthrough: z.boolean().optional(),
});
export type RouterOsMangleRuleUpdateInput = z.infer<typeof routerOsMangleRuleUpdateSchema>;

export const routerOsMangleRuleMoveSchema = baseRouterOsMangleRuleSchema.extend({
  actionType: z.literal('routeros.firewall.mangle.move'),
  position: positionSchema,
});
export type RouterOsMangleRuleMoveInput = z.infer<typeof routerOsMangleRuleMoveSchema>;

export const routerOsMangleRuleEnableSchema = baseRouterOsMangleRuleSchema.extend({
  actionType: z.literal('routeros.firewall.mangle.enable'),
});
export type RouterOsMangleRuleEnableInput = z.infer<typeof routerOsMangleRuleEnableSchema>;

export const routerOsMangleRuleDisableSchema = baseRouterOsMangleRuleSchema.extend({
  actionType: z.literal('routeros.firewall.mangle.disable'),
});
export type RouterOsMangleRuleDisableInput = z.infer<typeof routerOsMangleRuleDisableSchema>;

export const routerOsMangleRuleRemoveSchema = baseRouterOsMangleRuleSchema.extend({
  actionType: z.literal('routeros.firewall.mangle.remove'),
});
export type RouterOsMangleRuleRemoveInput = z.infer<typeof routerOsMangleRuleRemoveSchema>;

export const routerOsMangleRuleInputSchema = z.discriminatedUnion('actionType', [
  routerOsMangleRuleAddSchema,
  routerOsMangleRuleUpdateSchema,
  routerOsMangleRuleMoveSchema,
  routerOsMangleRuleEnableSchema,
  routerOsMangleRuleDisableSchema,
  routerOsMangleRuleRemoveSchema,
]);

export type RouterOsMangleRuleInput = z.infer<typeof routerOsMangleRuleInputSchema>;
