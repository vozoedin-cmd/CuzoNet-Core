import { z } from 'zod';

const MAX_NAME_LENGTH = 255;
const noControlChars = /^[\x20-\x7E]*$/;
/** Duración RouterOS compuesta ("1h", "4w2d"), formato reloj ("00:30:00") o el literal "none". */
const durationPattern = /^(?:none|(?:\d+[wdhms])+|\d{1,3}:[0-5]\d:[0-5]\d)$/i;
/** Par "RX/TX" con sufijos opcionales k/M/G. */
const rateLimitPattern = /^\d+[kKmMgG]?\/\d+[kKmMgG]?$/;
/** Entero >= 1 o el literal "unlimited" (el perfil default de RouterOS lo reporta así). */
const sharedUsersPattern = /^(?:unlimited|[1-9]\d*)$/i;

const baseRouterOsHotspotUserProfileSchema = z.object({
  routerId: z.string().min(1, 'El routerId no puede estar vacío.'),
});

const profileName = z
  .string()
  .min(1, 'El nombre del perfil no puede estar vacío.')
  .max(MAX_NAME_LENGTH, `El nombre del perfil no puede exceder los ${MAX_NAME_LENGTH} caracteres.`)
  .regex(noControlChars, 'El nombre del perfil contiene caracteres de control no permitidos.');

const addressPool = z
  .string()
  .min(1, 'El address pool no puede estar vacío; use "none" para no asignar ninguno.')
  .max(MAX_NAME_LENGTH)
  .regex(noControlChars, 'El address pool contiene caracteres de control no permitidos.')
  .optional();

const addressList = z
  .string()
  .max(MAX_NAME_LENGTH)
  .regex(noControlChars, 'La address list contiene caracteres de control no permitidos.')
  .optional();

const duration = (field: string) =>
  z
    .string()
    .regex(durationPattern, `${field} debe ser una duración RouterOS (p.ej. "1h", "4w2d") o "none".`)
    .optional();

const rateLimit = z
  .string()
  .regex(rateLimitPattern, 'El rate limit debe tener el formato "RX/TX" (p.ej. "5M/10M").')
  .optional();

const sharedUsers = z
  .string()
  .regex(sharedUsersPattern, 'shared-users debe ser un entero mayor o igual a uno, o "unlimited".')
  .optional();

/**
 * Campos configurables de un Hotspot User Profile.
 *
 * `onLogin`/`onLogout` NO forman parte del contrato: son scripts RouterOS que pueden
 * contener credenciales embebidas y el guard SENSITIVE_KEYS de ProvisioningRequest solo
 * inspecciona claves, no valores. Al ser schemas `.strict()`, enviarlos produce un
 * ROUTEROS_VALIDATION_ERROR explícito en vez de descartarse en silencio.
 *
 * Tampoco existe `disabled`: los perfiles no se habilitan ni deshabilitan.
 */
const profileFields = {
  addMacCookie: z.boolean().optional(),
  addressList,
  addressPool,
  idleTimeout: duration('idle-timeout'),
  keepaliveTimeout: duration('keepalive-timeout'),
  macCookieTimeout: duration('mac-cookie-timeout'),
  rateLimit,
  sessionTimeout: duration('session-timeout'),
  sharedUsers,
  statusAutorefresh: duration('status-autorefresh'),
  transparentProxy: z.boolean().optional(),
};

export const routerOsHotspotUserProfileCreateSchema = baseRouterOsHotspotUserProfileSchema
  .extend({
    actionType: z.literal('routeros.hotspot.user_profile.create'),
    ...profileFields,
    name: profileName,
  })
  .strict();
export type RouterOsHotspotUserProfileCreateInput = z.infer<typeof routerOsHotspotUserProfileCreateSchema>;

export const routerOsHotspotUserProfileUpdateSchema = baseRouterOsHotspotUserProfileSchema
  .extend({
    actionType: z.literal('routeros.hotspot.user_profile.update'),
    ...profileFields,
    name: profileName.optional(),
    profileReference: z.string().min(1, 'La referencia del perfil no puede estar vacía.'),
  })
  .strict();
export type RouterOsHotspotUserProfileUpdateInput = z.infer<typeof routerOsHotspotUserProfileUpdateSchema>;

export const routerOsHotspotUserProfileRemoveSchema = baseRouterOsHotspotUserProfileSchema
  .extend({
    actionType: z.literal('routeros.hotspot.user_profile.remove'),
    profileReference: z.string().min(1, 'La referencia del perfil no puede estar vacía.'),
  })
  .strict();
export type RouterOsHotspotUserProfileRemoveInput = z.infer<typeof routerOsHotspotUserProfileRemoveSchema>;

/**
 * La validación cruzada se aplica al union, no a cada miembro: `z.discriminatedUnion`
 * exige ZodObject y `.superRefine()` devuelve ZodEffects, que no sería aceptado dentro.
 *
 * Regla: RouterOS 7.21.4 fuerza `add-mac-cookie=true` en silencio cuando el comando
 * incluye `mac-cookie-timeout`, ignorando un `add-mac-cookie=false` presente. Verificado
 * de forma aislada contra un hEX real. Permitir esa combinación dejaría el recurso en
 * conflicto perpetuo: se pediría `false`, el router guardaría `true`, y cada reintento
 * volvería a detectar una diferencia irreconciliable. Se rechaza en la frontera.
 */
export const routerOsHotspotUserProfileInputSchema = z
  .discriminatedUnion('actionType', [
    routerOsHotspotUserProfileCreateSchema,
    routerOsHotspotUserProfileUpdateSchema,
    routerOsHotspotUserProfileRemoveSchema,
  ])
  .superRefine((command, context) => {
    if (command.actionType === 'routeros.hotspot.user_profile.remove') {
      return;
    }
    if (command.addMacCookie === false && command.macCookieTimeout !== undefined) {
      context.addIssue({
        code: 'custom',
        message:
          'No se puede combinar addMacCookie=false con macCookieTimeout: RouterOS fuerza addMacCookie=true al fijar el timeout de la cookie.',
        path: ['addMacCookie'],
      });
    }
  });

export type RouterOsHotspotUserProfileInput = z.infer<typeof routerOsHotspotUserProfileInputSchema>;
