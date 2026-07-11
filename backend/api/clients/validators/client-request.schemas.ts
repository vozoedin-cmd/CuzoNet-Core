import { z } from 'zod';

import { ApplicationError } from '../../../shared/errors/application-error.js';

const contactSchema = z
  .object({
    type: z.enum(['phone', 'email', 'whatsapp']),
    value: z.string().max(180),
    isPrimary: z.boolean().default(false),
  })
  .strict();

const addressSchema = z
  .object({
    label: z.string().max(80).optional(),
    addressLine: z.string().max(300),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    isServiceAddress: z.boolean().default(false),
  })
  .strict();

const createClientSchema = z
  .object({
    clientType: z.enum(['person', 'company']),
    legalName: z.string().min(2).max(180),
    documentType: z.string().max(32),
    documentNumber: z.string().min(3).max(64),
    contacts: z.array(contactSchema).max(10).optional(),
    addresses: z.array(addressSchema).max(10).optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();

const updateClientSchema = z
  .object({
    legalName: z.string().min(2).max(180).optional(),
    contacts: z.array(contactSchema).max(10).optional(),
    addresses: z.array(addressSchema).max(10).optional(),
  })
  .strict();

const clientIdParamsSchema = z.object({ clientId: z.string().uuid() }).strict();

const listClientsQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    search: z.string().max(120).optional(),
    status: z.enum(['active', 'archived']).optional(),
  })
  .strict();

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

export type CreateClientRequest = z.infer<typeof createClientSchema>;
export type UpdateClientRequest = z.infer<typeof updateClientSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;

export function parseCreateClientRequest(input: unknown): CreateClientRequest {
  return parse(createClientSchema, input, 'body');
}

export function parseUpdateClientRequest(input: unknown): UpdateClientRequest {
  return parse(updateClientSchema, input, 'body');
}

export function parseClientIdParams(input: unknown): { clientId: string } {
  return parse(clientIdParamsSchema, input, 'params');
}

export function parseListClientsQuery(input: unknown): ListClientsQuery {
  return parse(listClientsQuerySchema, input, 'query');
}

export function parseIdempotencyKey(input: unknown): string {
  return parse(idempotencyKeySchema, input, 'headers.Idempotency-Key');
}
