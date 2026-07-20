import { z } from 'zod';

const simpleQueueRateSchema = z
  .string()
  .regex(/^\d+[kKmM]?$/, 'Invalid rate format (e.g. 5M, 512k)');

export const routerOsSimpleQueueCreateInputSchema = z
  .object({
    actionType: z.literal('routeros.simple_queue.create'),
    comment: z.string().max(255).optional(),
    disabled: z.boolean().optional(),
    maxLimitDownload: simpleQueueRateSchema,
    maxLimitUpload: simpleQueueRateSchema,
    priority: z.number().int().min(1).max(8).optional(),
    queueName: z.string().min(1),
    routerId: z.string().min(1),
    target: z.string().min(1),
  })
  .strict();

export type RouterOsSimpleQueueCreateInput = z.infer<typeof routerOsSimpleQueueCreateInputSchema>;

export const routerOsSimpleQueueUpdateInputSchema = z
  .object({
    actionType: z.literal('routeros.simple_queue.update'),
    comment: z.string().max(255).optional(),
    maxLimitDownload: simpleQueueRateSchema.optional(),
    maxLimitUpload: simpleQueueRateSchema.optional(),
    priority: z.number().int().min(1).max(8).optional(),
    queueName: z.string().min(1).optional(),
    queueReference: z.string().min(1),
    routerId: z.string().min(1),
    target: z.string().min(1).optional(),
  })
  .strict();

export type RouterOsSimpleQueueUpdateInput = z.infer<typeof routerOsSimpleQueueUpdateInputSchema>;

export const routerOsSimpleQueueEnableInputSchema = z
  .object({
    actionType: z.literal('routeros.simple_queue.enable'),
    queueReference: z.string().min(1),
    routerId: z.string().min(1),
  })
  .strict();

export type RouterOsSimpleQueueEnableInput = z.infer<typeof routerOsSimpleQueueEnableInputSchema>;

export const routerOsSimpleQueueDisableInputSchema = z
  .object({
    actionType: z.literal('routeros.simple_queue.disable'),
    queueReference: z.string().min(1),
    routerId: z.string().min(1),
  })
  .strict();

export type RouterOsSimpleQueueDisableInput = z.infer<typeof routerOsSimpleQueueDisableInputSchema>;

export const routerOsSimpleQueueRemoveInputSchema = z
  .object({
    actionType: z.literal('routeros.simple_queue.remove'),
    queueReference: z.string().min(1),
    routerId: z.string().min(1),
  })
  .strict();

export type RouterOsSimpleQueueRemoveInput = z.infer<typeof routerOsSimpleQueueRemoveInputSchema>;

export const routerOsSimpleQueueInputSchema = z.discriminatedUnion('actionType', [
  routerOsSimpleQueueCreateInputSchema,
  routerOsSimpleQueueUpdateInputSchema,
  routerOsSimpleQueueEnableInputSchema,
  routerOsSimpleQueueDisableInputSchema,
  routerOsSimpleQueueRemoveInputSchema,
]);

export type RouterOsSimpleQueueInput = z.infer<typeof routerOsSimpleQueueInputSchema>;
