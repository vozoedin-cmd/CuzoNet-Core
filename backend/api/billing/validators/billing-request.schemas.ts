import { z } from 'zod';
import { ApplicationError } from '../../../shared/errors/application-error.js';
const allocationSchema = z
  .object({ amountCents: z.number().int().positive(), invoiceId: z.string().uuid() })
  .strict();
const paymentSchema = z
  .object({
    allocations: z.array(allocationSchema).optional(),
    amountCents: z.number().int().positive(),
    clientId: z.string().uuid(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    externalReference: z.string().max(120).optional(),
    method: z.enum(['cash', 'transfer', 'card', 'online', 'other']),
    receivedAt: z.string().datetime({ offset: true }),
  })
  .strict();
const listSchema = z
  .object({
    clientId: z.string().uuid().optional(),
    from: z.string().date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    to: z.string().date().optional(),
  })
  .strict();
const clientParamsSchema = z.object({ clientId: z.string().uuid() }).strict();
const idempotencySchema = z.string().min(16).max(128);
function parse<T>(schema: z.ZodType<T>, input: unknown, root: string): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError({
      code: 'VALIDATION_ERROR',
      details: result.error.issues.map((issue) => ({
        message: issue.message,
        path: [root, ...issue.path.map(String)].join('.'),
      })),
      message: 'La solicitud contiene datos inválidos.',
    });
  return result.data;
}
export type PaymentRequestBody = z.infer<typeof paymentSchema>;
export function parsePaymentRequest(input: unknown): PaymentRequestBody {
  return parse(paymentSchema, input, 'body');
}
export function parsePaymentListQuery(input: unknown): z.infer<typeof listSchema> {
  return parse(listSchema, input, 'query');
}
export function parseBillingClientParams(input: unknown): { clientId: string } {
  return parse(clientParamsSchema, input, 'params');
}
export function parseBillingIdempotencyKey(input: unknown): string {
  return parse(idempotencySchema, input, 'headers.Idempotency-Key');
}
