import { z } from 'zod';

const MAX_COMMENT_LENGTH = 255;
const noControlChars = /^[\x20-\x7E]*$/;

const baseRouterOsPppoeSchema = z.object({
  routerId: z.string().min(1, 'El routerId no puede estar vacío.'),
});

export const routerOsPppoeCreateSchema = baseRouterOsPppoeSchema.extend({
  actionType: z.literal('routeros.pppoe.create'),
  comment: z
    .string()
    .max(MAX_COMMENT_LENGTH, `El comentario no puede exceder los ${MAX_COMMENT_LENGTH} caracteres.`)
    .regex(noControlChars, 'El comentario contiene caracteres de control no permitidos.')
    .optional(),
  /** Referencia resuelta vía SecretProviderPort; nunca la contraseña en texto plano. */
  credentialReference: z
    .string()
    .min(1, 'La referencia de la credencial no puede estar vacía.'),
  disabled: z.boolean().optional(),
  name: z
    .string()
    .min(1, 'El nombre no puede estar vacío.')
    .regex(noControlChars, 'El nombre contiene caracteres de control no permitidos.'),
  profile: z
    .string()
    .min(1, 'El perfil no puede estar vacío.')
    .regex(noControlChars, 'El perfil contiene caracteres de control no permitidos.'),
  service: z.literal('pppoe').optional(),
});
export type RouterOsPppoeCreateInput = z.infer<typeof routerOsPppoeCreateSchema>;

export const routerOsPppoeUpdateSchema = baseRouterOsPppoeSchema.extend({
  actionType: z.literal('routeros.pppoe.update'),
  comment: z
    .string()
    .max(MAX_COMMENT_LENGTH, `El comentario no puede exceder los ${MAX_COMMENT_LENGTH} caracteres.`)
    .regex(noControlChars, 'El comentario contiene caracteres de control no permitidos.')
    .optional(),
  /** Referencia resuelta vía SecretProviderPort; nunca la contraseña en texto plano. */
  credentialReference: z
    .string()
    .min(1, 'La referencia de la credencial no puede estar vacía.')
    .optional(),
  disabled: z.boolean().optional(),
  name: z
    .string()
    .min(1, 'El nombre no puede estar vacío.')
    .regex(noControlChars, 'El nombre contiene caracteres de control no permitidos.')
    .optional(),
  profile: z
    .string()
    .min(1, 'El perfil no puede estar vacío.')
    .regex(noControlChars, 'El perfil contiene caracteres de control no permitidos.')
    .optional(),
  pppoeReference: z.string().min(1, 'La referencia del secreto PPPoE no puede estar vacía.'),
});
export type RouterOsPppoeUpdateInput = z.infer<typeof routerOsPppoeUpdateSchema>;

export const routerOsPppoeEnableSchema = baseRouterOsPppoeSchema.extend({
  actionType: z.literal('routeros.pppoe.enable'),
  pppoeReference: z.string().min(1, 'La referencia del secreto PPPoE no puede estar vacía.'),
});
export type RouterOsPppoeEnableInput = z.infer<typeof routerOsPppoeEnableSchema>;

export const routerOsPppoeDisableSchema = baseRouterOsPppoeSchema.extend({
  actionType: z.literal('routeros.pppoe.disable'),
  pppoeReference: z.string().min(1, 'La referencia del secreto PPPoE no puede estar vacía.'),
});
export type RouterOsPppoeDisableInput = z.infer<typeof routerOsPppoeDisableSchema>;

export const routerOsPppoeRemoveSchema = baseRouterOsPppoeSchema.extend({
  actionType: z.literal('routeros.pppoe.remove'),
  pppoeReference: z.string().min(1, 'La referencia del secreto PPPoE no puede estar vacía.'),
});
export type RouterOsPppoeRemoveInput = z.infer<typeof routerOsPppoeRemoveSchema>;

export const routerOsPppoeInputSchema = z.discriminatedUnion('actionType', [
  routerOsPppoeCreateSchema,
  routerOsPppoeUpdateSchema,
  routerOsPppoeEnableSchema,
  routerOsPppoeDisableSchema,
  routerOsPppoeRemoveSchema,
]);

export type RouterOsPppoeInput = z.infer<typeof routerOsPppoeInputSchema>;
