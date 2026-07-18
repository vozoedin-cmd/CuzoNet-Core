import { z } from 'zod';

import { ApplicationError } from '../../shared/errors/application-error.js';

const equipmentIdParamsSchema = z
  .object({
    equipmentId: z.string().uuid(),
  })
  .strict();

const setManagementHostSchema = z
  .object({
    companyId: z.string().uuid(),
    managementHost: z.string().trim().min(1).max(253).nullable(),
  })
  .strict();

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

export function parseEquipmentIdParams(input: unknown): { equipmentId: string } {
  return parse(equipmentIdParamsSchema, input, 'params');
}

export function parseSetManagementHostRequest(input: unknown): {
  companyId: string;
  managementHost: string | null;
} {
  return parse(setManagementHostSchema, input, 'body');
}
