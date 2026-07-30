import { z } from 'zod';

const MAX_COMMENT_LENGTH = 255;
const MAX_LIST_NAME_LENGTH = 64;
const noControlChars = /^[\x20-\x7E]*$/;

const ipv4Octet = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])';
const ipv4 = `${ipv4Octet}(\\.${ipv4Octet}){3}`;
const ipv4Pattern = new RegExp(`^${ipv4}(\\/(3[0-2]|[12]?[0-9]))?$`);
const ipv4EndpointPattern = new RegExp(`^${ipv4}$`);

const OCTETS_PER_IPV4 = 4;
const VALUES_PER_OCTET = 256;

function ipv4ToNumber(value: string): number {
  const octets = value.split('.');
  let result = 0;
  for (let index = 0; index < OCTETS_PER_IPV4; index += 1) {
    result = result * VALUES_PER_OCTET + Number(octets[index]);
  }
  return result;
}

/**
 * Espeja `IpAddress` del dominio: `/ip/firewall/address-list` es la tabla IPv4, admite
 * rangos literales y deja fuera IPv6 (recurso `/ipv6/firewall/address-list`) y nombres de
 * dominio (RouterOS los resuelve y crea entradas hijas dinámicas). El VO documenta el
 * detalle de lo verificado en RouterOS 7.21.4.
 */
function isSupportedAddress(value: string): boolean {
  const separator = value.indexOf('-');
  if (separator > 0) {
    const start = value.slice(0, separator);
    const end = value.slice(separator + 1);
    return (
      ipv4EndpointPattern.test(start) &&
      ipv4EndpointPattern.test(end) &&
      ipv4ToNumber(start) <= ipv4ToNumber(end)
    );
  }
  return ipv4Pattern.test(value);
}

const addressSchema = z.string().refine(isSupportedAddress, {
  message:
    'Debe ser una dirección IPv4, una red IPv4 con prefijo CIDR o un rango IPv4 (p. ej. "203.0.113.10-203.0.113.15"). No se aceptan IPv6 ni nombres de dominio.',
});

const listSchema = z
  .string()
  .min(1, 'El nombre de la lista no puede estar vacío.')
  .max(MAX_LIST_NAME_LENGTH, `El nombre de la lista no puede exceder los ${MAX_LIST_NAME_LENGTH} caracteres.`)
  .regex(noControlChars, 'El nombre de la lista contiene caracteres de control no permitidos.');

const commentSchema = z
  .string()
  .max(MAX_COMMENT_LENGTH, `El comentario no puede exceder los ${MAX_COMMENT_LENGTH} caracteres.`)
  .regex(noControlChars, 'El comentario contiene caracteres de control no permitidos.')
  .optional();

const baseRouterOsAddressListSchema = z.object({
  routerId: z.string().min(1, 'El routerId no puede estar vacío.'),
});

/**
 * `timeout` NO forma parte del contrato. Verificado en RouterOS 7.21.4: fijarlo convierte
 * la entrada en `dynamic=true`, es decir, en un objeto efímero que no se guarda en la
 * configuración, no sobrevive a un reinicio y no admite `disable`. Además `/print` devuelve
 * una cuenta regresiva (`1d` -> `23h59m59s`), así que el valor leído nunca coincide con el
 * enviado y la idempotencia es imposible. Pedir un bloqueo permanente, recibir uno que se
 * evapora y que la solicitud se reporte como `completed` es un fallo silencioso que el
 * esquema debe impedir: al ser `.strict()`, un payload con `timeout` se rechaza.
 * Las entradas temporales, si alguna vez hacen falta, necesitan su propio actionType con
 * semántica efímera explícita y sin participación en el Sync.
 */
export const routerOsAddressListAddSchema = baseRouterOsAddressListSchema
  .extend({
    actionType: z.literal('routeros.firewall.address-list.add'),
    address: addressSchema,
    comment: commentSchema,
    disabled: z.boolean().optional(),
    list: listSchema,
  })
  .strict();
export type RouterOsAddressListAddInput = z.infer<typeof routerOsAddressListAddSchema>;

export const routerOsAddressListUpdateSchema = baseRouterOsAddressListSchema
  .extend({
    actionType: z.literal('routeros.firewall.address-list.update'),
    address: addressSchema,
    comment: commentSchema,
    disabled: z.boolean().optional(),
    list: listSchema,
  })
  .strict();
export type RouterOsAddressListUpdateInput = z.infer<typeof routerOsAddressListUpdateSchema>;

export const routerOsAddressListEnableSchema = baseRouterOsAddressListSchema
  .extend({
    actionType: z.literal('routeros.firewall.address-list.enable'),
    address: addressSchema,
    list: listSchema,
  })
  .strict();
export type RouterOsAddressListEnableInput = z.infer<typeof routerOsAddressListEnableSchema>;

export const routerOsAddressListDisableSchema = baseRouterOsAddressListSchema
  .extend({
    actionType: z.literal('routeros.firewall.address-list.disable'),
    address: addressSchema,
    list: listSchema,
  })
  .strict();
export type RouterOsAddressListDisableInput = z.infer<typeof routerOsAddressListDisableSchema>;

export const routerOsAddressListRemoveSchema = baseRouterOsAddressListSchema
  .extend({
    actionType: z.literal('routeros.firewall.address-list.remove'),
    address: addressSchema,
    list: listSchema,
  })
  .strict();
export type RouterOsAddressListRemoveInput = z.infer<typeof routerOsAddressListRemoveSchema>;

export const routerOsAddressListInputSchema = z.discriminatedUnion('actionType', [
  routerOsAddressListAddSchema,
  routerOsAddressListUpdateSchema,
  routerOsAddressListEnableSchema,
  routerOsAddressListDisableSchema,
  routerOsAddressListRemoveSchema,
]);

export type RouterOsAddressListInput = z.infer<typeof routerOsAddressListInputSchema>;
