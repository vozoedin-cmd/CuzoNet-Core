import { z } from 'zod';

export const requestProvisioningSchema = z.object({
  actionType: z.string().trim().min(1),
  configurationReference: z.string().trim().optional(),
  idempotencyKey: z.string().trim().min(1),
  inputSnapshotJson: z.string().refine((val) => {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }, 'Debe ser un JSON válido'),
  sourceExecutionId: z.string().trim().optional(),
  targetId: z.string().trim().min(1),
  targetType: z.string().trim().min(1),
});

export type RequestProvisioningBody = z.infer<typeof requestProvisioningSchema>;

export function parseRequestProvisioning(input: unknown): RequestProvisioningBody {
  return requestProvisioningSchema.parse(input);
}
