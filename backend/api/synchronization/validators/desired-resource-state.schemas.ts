import { z } from 'zod';

export const setDesiredResourceStateSchema = z.object({
  desiredFields: z.record(z.string(), z.string()),
  desiredPosition: z.number().int().min(0).optional(),
  disabled: z.boolean().optional(),
});

export type SetDesiredResourceStateBody = z.infer<typeof setDesiredResourceStateSchema>;

export function parseSetDesiredResourceState(input: unknown): SetDesiredResourceStateBody {
  return setDesiredResourceStateSchema.parse(input);
}
