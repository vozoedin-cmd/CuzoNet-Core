import { z } from 'zod';

const MAX_COMMENT_LENGTH = 255;
const MAX_NAME_LENGTH = 64;
const noControlChars = /^[\x20-\x7E]*$/;
const limitUptimePattern = /^(?:(?:\d+[wdhms])+|\d{1,3}:[0-5]\d:[0-5]\d)$/;

const baseRouterOsHotspotUserSchema = z.object({
  routerId: z.string().min(1, 'El routerId no puede estar vacío.'),
});

const comment = z
  .string()
  .max(MAX_COMMENT_LENGTH, `El comentario no puede exceder los ${MAX_COMMENT_LENGTH} caracteres.`)
  .regex(noControlChars, 'El comentario contiene caracteres de control no permitidos.')
  .optional();

const limitUptime = z
  .string()
  .regex(limitUptimePattern, 'Debe tener el formato RouterOS de duración (p.ej. "1d", "4h30m" o "00:30:00").')
  .optional();

const limitBytesTotal = z.number().int().min(0, 'Debe ser un entero mayor o igual a cero.').optional();

/**
 * NOTA: `sharedUsers` fue removido del contrato. RouterOS lo expone en
 * /ip/hotspot/user/profile, no en /ip/hotspot/user; enviarlo en un add/set de
 * usuario provoca "unknown parameter shared-users". Corresponde a un futuro
 * módulo de perfiles de Hotspot.
 */

export const routerOsHotspotUserCreateSchema = baseRouterOsHotspotUserSchema.extend({
  actionType: z.literal('routeros.hotspot.user.create'),
  comment,
  /** Referencia resuelta vía SecretProviderPort; nunca la contraseña en texto plano. */
  credentialReference: z
    .string()
    .min(1, 'La referencia de la credencial no puede estar vacía.'),
  disabled: z.boolean().optional(),
  limitBytesTotal,
  limitUptime,
  name: z
    .string()
    .min(1, 'El nombre no puede estar vacío.')
    .max(MAX_NAME_LENGTH, `El nombre no puede exceder los ${MAX_NAME_LENGTH} caracteres.`)
    .regex(noControlChars, 'El nombre contiene caracteres de control no permitidos.'),
  profile: z
    .string()
    .min(1, 'El perfil no puede estar vacío.')
    .regex(noControlChars, 'El perfil contiene caracteres de control no permitidos.'),
  server: z
    .string()
    .min(1, 'El servidor no puede estar vacío.')
    .regex(noControlChars, 'El servidor contiene caracteres de control no permitidos.')
    .optional(),
});
export type RouterOsHotspotUserCreateInput = z.infer<typeof routerOsHotspotUserCreateSchema>;

export const routerOsHotspotUserUpdateSchema = baseRouterOsHotspotUserSchema.extend({
  actionType: z.literal('routeros.hotspot.user.update'),
  comment,
  /** Referencia resuelta vía SecretProviderPort; nunca la contraseña en texto plano. */
  credentialReference: z
    .string()
    .min(1, 'La referencia de la credencial no puede estar vacía.')
    .optional(),
  disabled: z.boolean().optional(),
  limitBytesTotal,
  limitUptime,
  name: z
    .string()
    .min(1, 'El nombre no puede estar vacío.')
    .max(MAX_NAME_LENGTH, `El nombre no puede exceder los ${MAX_NAME_LENGTH} caracteres.`)
    .regex(noControlChars, 'El nombre contiene caracteres de control no permitidos.')
    .optional(),
  profile: z
    .string()
    .min(1, 'El perfil no puede estar vacío.')
    .regex(noControlChars, 'El perfil contiene caracteres de control no permitidos.')
    .optional(),
  server: z
    .string()
    .min(1, 'El servidor no puede estar vacío.')
    .regex(noControlChars, 'El servidor contiene caracteres de control no permitidos.')
    .optional(),
  userReference: z.string().min(1, 'La referencia del usuario no puede estar vacía.'),
});
export type RouterOsHotspotUserUpdateInput = z.infer<typeof routerOsHotspotUserUpdateSchema>;

export const routerOsHotspotUserEnableSchema = baseRouterOsHotspotUserSchema.extend({
  actionType: z.literal('routeros.hotspot.user.enable'),
  userReference: z.string().min(1, 'La referencia del usuario no puede estar vacía.'),
});
export type RouterOsHotspotUserEnableInput = z.infer<typeof routerOsHotspotUserEnableSchema>;

export const routerOsHotspotUserDisableSchema = baseRouterOsHotspotUserSchema.extend({
  actionType: z.literal('routeros.hotspot.user.disable'),
  userReference: z.string().min(1, 'La referencia del usuario no puede estar vacía.'),
});
export type RouterOsHotspotUserDisableInput = z.infer<typeof routerOsHotspotUserDisableSchema>;

export const routerOsHotspotUserRemoveSchema = baseRouterOsHotspotUserSchema.extend({
  actionType: z.literal('routeros.hotspot.user.remove'),
  userReference: z.string().min(1, 'La referencia del usuario no puede estar vacía.'),
});
export type RouterOsHotspotUserRemoveInput = z.infer<typeof routerOsHotspotUserRemoveSchema>;

export const routerOsHotspotUserInputSchema = z.discriminatedUnion('actionType', [
  routerOsHotspotUserCreateSchema,
  routerOsHotspotUserUpdateSchema,
  routerOsHotspotUserEnableSchema,
  routerOsHotspotUserDisableSchema,
  routerOsHotspotUserRemoveSchema,
]);

export type RouterOsHotspotUserInput = z.infer<typeof routerOsHotspotUserInputSchema>;
