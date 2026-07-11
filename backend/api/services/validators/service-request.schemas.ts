import { z } from 'zod';

import { ApplicationError } from '../../../shared/errors/application-error.js';

const createServiceSchema = z
  .object({
    planVersionId: z.string().uuid(),
    serviceType: z.enum(['simple_queue', 'pppoe', 'hotspot']),
    billingDay: z.number().int().min(1).max(28),
  })
  .strict();

const clientIdParamsSchema = z.object({ clientId: z.string().uuid() }).strict();
const serviceIdParamsSchema = z.object({ serviceId: z.string().uuid() }).strict();
const idempotencyKeySchema = z.string().min(16).max(128);

function parse<T>(schema: z.ZodType<T>, input: unknown, rootPath: string): T {
  const result = schema.safeParse(input);

  if (!result.success) {
    throw new ApplicationError({
      code: 'VALIDATION_ERROR',
      details: result.error.issues.map((issue) => ({
        message: issue.message,
        path: [rootPath, ...issue.path.map(String)].filter(Boolean).join('.'),
      })),
      message: 'La solicitud contiene datos inválidos.',
    });
  }

  return result.data;
}

export type CreateServiceRequest = z.infer<typeof createServiceSchema>;

export function parseCreateServiceRequest(input: unknown): CreateServiceRequest {
  return parse(createServiceSchema, input, 'body');
}

export function parseClientIdParams(input: unknown): { clientId: string } {
  return parse(clientIdParamsSchema, input, 'params');
}

export function parseServiceIdParams(input: unknown): { serviceId: string } {
  return parse(serviceIdParamsSchema, input, 'params');
}

export function parseIdempotencyKey(input: unknown): string {
  return parse(idempotencyKeySchema, input, 'headers.Idempotency-Key');
}
