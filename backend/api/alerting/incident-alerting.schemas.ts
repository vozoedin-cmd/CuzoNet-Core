import { z } from 'zod';

import { ApplicationError } from '../../shared/errors/application-error.js';

const identifier = z.string().trim().min(1).max(200);

export const incidentIdParamsSchema = z.strictObject({ incidentId: identifier });
export const companyQuerySchema = z.strictObject({ companyId: identifier });
export const incidentListQuerySchema = z.strictObject({
  companyId: identifier,
  equipmentId: identifier.optional(),
  ruleId: identifier.optional(),
  severity: z.enum(['info', 'warning', 'minor', 'major', 'critical']).optional(),
  status: z.enum(['open', 'acknowledged', 'resolved']).optional(),
});
export const acknowledgeIncidentBodySchema = z.strictObject({
  acknowledgedBy: identifier,
  companyId: identifier,
});

export function parseAlertingRequest<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ApplicationError({
    code: 'VALIDATION_ERROR',
    details: result.error.issues.map((issue) => ({
      message: issue.message,
      path: issue.path.join('.'),
    })),
    message: 'La solicitud de alerting no es válida.',
  });
}
