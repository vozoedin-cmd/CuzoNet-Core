import { z } from 'zod';

import { ApplicationError } from '../../shared/errors/application-error.js';

const identifier = z.string().trim().min(1).max(200);
const optionalReason = z.string().trim().min(1).max(500).optional();
const channelSchema = z.enum(['webhook', 'whatsapp', 'telegram', 'email']);
const eventTypeSchema = z.enum(['incident_opened', 'incident_acknowledged', 'incident_resolved']);
const severitySchema = z.enum(['info', 'warning', 'minor', 'major', 'critical']);

export const notificationIdParamsSchema = z.strictObject({ notificationId: identifier });
export const destinationIdParamsSchema = z.strictObject({ destinationId: identifier });
export const companyQuerySchema = z.strictObject({ companyId: identifier });
export const notificationListQuerySchema = z.strictObject({
  channel: channelSchema.optional(),
  companyId: identifier,
  dateFrom: z.iso.datetime({ offset: true }).optional(),
  dateTo: z.iso.datetime({ offset: true }).optional(),
  destinationId: identifier.optional(),
  incidentId: identifier.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  status: z
    .enum(['pending', 'processing', 'sent', 'retrying', 'failed', 'cancelled', 'skipped'])
    .optional(),
});
export const retryNotificationBodySchema = z.strictObject({ companyId: identifier });
export const cancelNotificationBodySchema = z.strictObject({
  companyId: identifier,
  reason: optionalReason,
});
export const saveDestinationBodySchema = z.strictObject({
  channel: channelSchema,
  companyId: identifier,
  configurationReference: z.string().regex(/^[A-Z][A-Z0-9_]{2,99}$/),
  enabled: z.boolean(),
  eventTypes: z.array(eventTypeSchema).min(1),
  minimumSeverity: severitySchema.optional(),
  name: z.string().trim().min(1).max(200),
});

export function parseNotificationRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ApplicationError({
    code: 'VALIDATION_ERROR',
    details: result.error.issues.map((issue) => ({
      message: issue.message,
      path: issue.path.join('.'),
    })),
    message: 'La solicitud de notificaciones no es válida.',
  });
}
