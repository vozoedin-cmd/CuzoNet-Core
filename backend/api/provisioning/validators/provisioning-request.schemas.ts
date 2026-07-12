import { z } from 'zod';

import { ApplicationError } from '../../../shared/errors/application-error.js';

const requestSchema = z
  .object({
    ipAddressId: z.string().uuid().optional(),
    routerId: z.string().uuid(),
    serviceAddressId: z.string().uuid().optional(),
    type: z.literal('provision'),
  })
  .strict();
const serviceIdSchema = z.object({ serviceId: z.string().uuid() }).strict();
const operationIdSchema = z.object({ operationId: z.string().uuid() }).strict();
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

export type ProvisioningRequestBody = z.infer<typeof requestSchema>;
export function parseProvisioningRequest(input: unknown): ProvisioningRequestBody {
  return parse(requestSchema, input, 'body');
}
export function parseProvisioningServiceId(input: unknown): { serviceId: string } {
  return parse(serviceIdSchema, input, 'params');
}
export function parseOperationId(input: unknown): { operationId: string } {
  return parse(operationIdSchema, input, 'params');
}
export function parseProvisioningIdempotencyKey(input: unknown): string {
  return parse(idempotencyKeySchema, input, 'headers.Idempotency-Key');
}
