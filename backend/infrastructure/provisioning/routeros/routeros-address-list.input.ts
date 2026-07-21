import { z } from 'zod';

const MAX_COMMENT_LENGTH = 255;
const MAX_LIST_NAME_LENGTH = 64;
const noControlChars = /^[\x20-\x7E]*$/;

const ipv4Octet = '(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])';
const ipv4Pattern = new RegExp(`^${ipv4Octet}(\\.${ipv4Octet}){3}(\\/(3[0-2]|[12]?[0-9]))?$`);
const ipv6Pattern =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))(\/(12[0-8]|1[01][0-9]|[1-9]?[0-9]))?$/;
const timeoutPattern = /^(?:(?:\d+[wdhms])+|\d{1,3}:[0-5]\d:[0-5]\d|none)$/i;

const addressSchema = z
  .string()
  .refine((value) => ipv4Pattern.test(value) || ipv6Pattern.test(value), {
    message: 'Debe ser una dirección IPv4 o IPv6 válida, con prefijo CIDR opcional.',
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

const timeoutSchema = z
  .string()
  .regex(timeoutPattern, 'Debe ser "none" o tener el formato RouterOS de duración (p.ej. "1d", "4h30m" o "00:30:00").')
  .optional();

const baseRouterOsAddressListSchema = z.object({
  routerId: z.string().min(1, 'El routerId no puede estar vacío.'),
});

export const routerOsAddressListAddSchema = baseRouterOsAddressListSchema.extend({
  actionType: z.literal('routeros.firewall.address-list.add'),
  address: addressSchema,
  comment: commentSchema,
  disabled: z.boolean().optional(),
  list: listSchema,
  timeout: timeoutSchema,
});
export type RouterOsAddressListAddInput = z.infer<typeof routerOsAddressListAddSchema>;

export const routerOsAddressListUpdateSchema = baseRouterOsAddressListSchema.extend({
  actionType: z.literal('routeros.firewall.address-list.update'),
  address: addressSchema,
  comment: commentSchema,
  disabled: z.boolean().optional(),
  list: listSchema,
  timeout: timeoutSchema,
});
export type RouterOsAddressListUpdateInput = z.infer<typeof routerOsAddressListUpdateSchema>;

export const routerOsAddressListEnableSchema = baseRouterOsAddressListSchema.extend({
  actionType: z.literal('routeros.firewall.address-list.enable'),
  address: addressSchema,
  list: listSchema,
});
export type RouterOsAddressListEnableInput = z.infer<typeof routerOsAddressListEnableSchema>;

export const routerOsAddressListDisableSchema = baseRouterOsAddressListSchema.extend({
  actionType: z.literal('routeros.firewall.address-list.disable'),
  address: addressSchema,
  list: listSchema,
});
export type RouterOsAddressListDisableInput = z.infer<typeof routerOsAddressListDisableSchema>;

export const routerOsAddressListRemoveSchema = baseRouterOsAddressListSchema.extend({
  actionType: z.literal('routeros.firewall.address-list.remove'),
  address: addressSchema,
  list: listSchema,
});
export type RouterOsAddressListRemoveInput = z.infer<typeof routerOsAddressListRemoveSchema>;

export const routerOsAddressListInputSchema = z.discriminatedUnion('actionType', [
  routerOsAddressListAddSchema,
  routerOsAddressListUpdateSchema,
  routerOsAddressListEnableSchema,
  routerOsAddressListDisableSchema,
  routerOsAddressListRemoveSchema,
]);

export type RouterOsAddressListInput = z.infer<typeof routerOsAddressListInputSchema>;
