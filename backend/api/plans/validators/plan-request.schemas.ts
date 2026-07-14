import { z } from 'zod';

import { ApplicationError } from '../../../shared/errors/application-error.js';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const createPlanSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9_-]{2,32}$/),
    name: z.string().min(2).max(120),
    serviceType: z.enum(['simple_queue', 'pppoe', 'hotspot']),
    priceCents: z.number().int().min(0),
    downloadKbps: z.number().int().positive(),
    uploadKbps: z.number().int().positive(),
  })
  .strict();

const revisePlanSchema = z
  .object({
    priceCents: z.number().int().min(0),
    downloadKbps: z.number().int().positive(),
    uploadKbps: z.number().int().positive(),
    effectiveFrom: z.string().regex(ISO_DATE_PATTERN),
    isActive: z.boolean().optional(),
  })
  .strict();

const planIdParamsSchema = z.object({ planId: z.string().regex(UUID_V7_PATTERN) }).strict();
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
      message: 'La solicitud contiene datos invalidos.',
    });
  }
  return result.data;
}

export type CreatePlanRequest = z.infer<typeof createPlanSchema>;
export type RevisePlanRequest = z.infer<typeof revisePlanSchema>;

export function parseCreatePlanRequest(input: unknown): CreatePlanRequest {
  return parse(createPlanSchema, input, 'body');
}

export function parseRevisePlanRequest(input: unknown): RevisePlanRequest {
  return parse(revisePlanSchema, input, 'body');
}

export function parsePlanIdParams(input: unknown): { planId: string } {
  return parse(planIdParamsSchema, input, 'params');
}

export function parsePlanIdempotencyKey(input: unknown): string {
  return parse(idempotencyKeySchema, input, 'headers.Idempotency-Key');
}
