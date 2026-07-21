import { z } from 'zod';

const MAX_COMMENT_LENGTH = 200;
const MAX_RULE_REFERENCE_LENGTH = 128;
const noControlChars = /^[\x20-\x7E]*$/;

const ruleReferenceSchema = z
  .string()
  .min(1, 'La referencia de la regla no puede estar vacía.')
  .max(MAX_RULE_REFERENCE_LENGTH, `La referencia de la regla no puede exceder los ${MAX_RULE_REFERENCE_LENGTH} caracteres.`)
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    'La referencia de la regla solo puede contener letras, números, guiones, guiones bajos y puntos.',
  );

const chainSchema = z.enum(['srcnat', 'dstnat'], {
  message: 'Debe ser una de: srcnat, dstnat.',
});

const actionSchema = z.enum(['masquerade', 'src-nat', 'dst-nat', 'netmap', 'redirect'], {
  message: 'Debe ser una de: masquerade, src-nat, dst-nat, netmap, redirect.',
});

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
const ipv4Plain = new RegExp(`^${ipv4Octet}(\\.${ipv4Octet}){3}$`);
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

const toAddressesSchema = z
  .string()
  .refine(
    (value) => {
      if (value.includes('-')) {
        const parts = value.split('-');
        return parts.length === 2 && ipv4Plain.test(parts[0]!) && ipv4Plain.test(parts[1]!);
      }
      return ipv4CidrPattern.test(value) || ipv6Pattern.test(value);
    },
    {
      message:
        'Debe ser una dirección IPv4/IPv6 válida (con CIDR opcional) o un rango IPv4 "inicio-fin" (p.ej. "192.168.1.10-192.168.1.20").',
    },
  )
  .optional();

const portToken = /^(6553[0-5]|655[0-2][0-9]|65[0-4][0-9]{2}|6[0-4][0-9]{3}|[1-5][0-9]{4}|[1-9][0-9]{0,3})$/;
const portSpecPattern = (value: string): boolean => {
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
};
const portMessage = 'Debe ser un puerto, lista separada por comas y/o rangos válidos (1-65535), p.ej. "80,443,1000-2000".';
const portSpecSchema = z.string().refine(portSpecPattern, { message: portMessage }).optional();
const toPortsSchema = z.string().refine(portSpecPattern, { message: portMessage }).optional();

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

const baseRouterOsNatRuleSchema = z.object({
  routerId: z.string().min(1, 'El routerId no puede estar vacío.'),
  ruleReference: ruleReferenceSchema,
});

export const routerOsNatRuleAddSchema = baseRouterOsNatRuleSchema.extend({
  action: actionSchema,
  actionType: z.literal('routeros.firewall.nat.add'),
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
  toAddresses: toAddressesSchema,
  toPorts: toPortsSchema,
});
export type RouterOsNatRuleAddInput = z.infer<typeof routerOsNatRuleAddSchema>;

export const routerOsNatRuleUpdateSchema = baseRouterOsNatRuleSchema.extend({
  action: actionSchema.optional(),
  actionType: z.literal('routeros.firewall.nat.update'),
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
  toAddresses: toAddressesSchema,
  toPorts: toPortsSchema,
});
export type RouterOsNatRuleUpdateInput = z.infer<typeof routerOsNatRuleUpdateSchema>;

export const routerOsNatRuleMoveSchema = baseRouterOsNatRuleSchema.extend({
  actionType: z.literal('routeros.firewall.nat.move'),
  position: positionSchema,
});
export type RouterOsNatRuleMoveInput = z.infer<typeof routerOsNatRuleMoveSchema>;

export const routerOsNatRuleEnableSchema = baseRouterOsNatRuleSchema.extend({
  actionType: z.literal('routeros.firewall.nat.enable'),
});
export type RouterOsNatRuleEnableInput = z.infer<typeof routerOsNatRuleEnableSchema>;

export const routerOsNatRuleDisableSchema = baseRouterOsNatRuleSchema.extend({
  actionType: z.literal('routeros.firewall.nat.disable'),
});
export type RouterOsNatRuleDisableInput = z.infer<typeof routerOsNatRuleDisableSchema>;

export const routerOsNatRuleRemoveSchema = baseRouterOsNatRuleSchema.extend({
  actionType: z.literal('routeros.firewall.nat.remove'),
});
export type RouterOsNatRuleRemoveInput = z.infer<typeof routerOsNatRuleRemoveSchema>;

export const routerOsNatRuleInputSchema = z.discriminatedUnion('actionType', [
  routerOsNatRuleAddSchema,
  routerOsNatRuleUpdateSchema,
  routerOsNatRuleMoveSchema,
  routerOsNatRuleEnableSchema,
  routerOsNatRuleDisableSchema,
  routerOsNatRuleRemoveSchema,
]);

export type RouterOsNatRuleInput = z.infer<typeof routerOsNatRuleInputSchema>;
