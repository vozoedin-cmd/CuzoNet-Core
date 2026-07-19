import 'dotenv/config';

import { z } from 'zod';

const timeZoneSchema = z
  .string()
  .min(1)
  .superRefine((timeZone, context) => {
    try {
      Intl.DateTimeFormat('en-US', { timeZone });
    } catch {
      context.addIssue({
        code: 'custom',
        message: 'Debe ser una zona horaria IANA válida.',
      });
    }
  });

const booleanStringSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

export const environmentSchema = z.object({
  API_PREFIX: z
    .string()
    .trim()
    .regex(/^\/[A-Za-z0-9/_-]*[A-Za-z0-9_-]$/, 'Debe ser un prefijo HTTP sin slash final.')
    .default('/api/v1'),
  APP_NAME: z.string().trim().min(1),
  CORS_ALLOWED_ORIGINS: z.string().trim().min(1).default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  TIMEZONE: timeZoneSchema,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),
  DATABASE_PATH: z.string().trim().min(1).default('./storage/cuzonet.sqlite'),
  DATABASE_BUSY_TIMEOUT_MS: z.coerce.number().int().min(0).max(60_000).default(5_000),
  DATABASE_BACKUP_PATH: z.string().trim().min(1).default('./storage/backups'),
  MONITORING_PING_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(3_000),
  MONITORING_ROUTEROS_HOST: z.string().trim().min(1).optional(),
  MONITORING_ROUTEROS_PASSWORD: z.string().optional(),
  MONITORING_ROUTEROS_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
  MONITORING_ROUTEROS_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  MONITORING_ROUTEROS_TLS: booleanStringSchema.default(true),
  MONITORING_ROUTEROS_USERNAME: z.string().trim().min(1).optional(),
  MONITORING_SNMP_COMMUNITY: z.string().trim().min(1).optional(),
  MONITORING_SNMP_RETRIES: z.coerce.number().int().min(0).max(5).default(1),
  MONITORING_SNMP_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(3_000),
  NOTIFICATION_WORKER_ENABLED: booleanStringSchema.default(false),
  AUTOMATION_WORKER_ENABLED: booleanStringSchema.default(false),
  AUTOMATION_WORKER_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(5000),
  AUTOMATION_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  AUTOMATION_WORKER_LEASE_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  AUTOMATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  AUTOMATION_MAX_CAUSAL_DEPTH: z.coerce.number().int().min(1).max(20).default(5),
  NOTIFICATION_WORKER_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  NOTIFICATION_WORKER_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  NOTIFICATION_WORKER_LEASE_SECONDS: z.coerce.number().int().min(5).max(3_600).default(60),
  NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(5),
  NOTIFICATION_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  NOTIFICATION_WEBHOOK_ALLOW_HTTP: booleanStringSchema.default(false),
  NOTIFICATION_WHATSAPP_ALLOW_HTTP: booleanStringSchema.default(false),
  NOTIFICATION_WHATSAPP_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(5_000),
  NOTIFICATION_WHATSAPP_MAX_TEXT_LENGTH: z.coerce.number().int().min(1).max(65536).default(4096),
});

const parsedEnvironment = environmentSchema.safeParse({
  API_PREFIX: process.env.API_PREFIX,
  APP_NAME: process.env.APP_NAME,
  CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  TIMEZONE: process.env.TIMEZONE,
  LOG_LEVEL: process.env.LOG_LEVEL,
  DATABASE_PATH: process.env.DATABASE_PATH,
  DATABASE_BUSY_TIMEOUT_MS: process.env.DATABASE_BUSY_TIMEOUT_MS,
  DATABASE_BACKUP_PATH: process.env.DATABASE_BACKUP_PATH,
  MONITORING_PING_TIMEOUT_MS: process.env.MONITORING_PING_TIMEOUT_MS,
  MONITORING_SNMP_COMMUNITY: process.env.MONITORING_SNMP_COMMUNITY,
  MONITORING_ROUTEROS_HOST: process.env.MONITORING_ROUTEROS_HOST,
  MONITORING_ROUTEROS_PASSWORD: process.env.MONITORING_ROUTEROS_PASSWORD,
  MONITORING_ROUTEROS_PORT: process.env.MONITORING_ROUTEROS_PORT,
  MONITORING_ROUTEROS_TIMEOUT_MS: process.env.MONITORING_ROUTEROS_TIMEOUT_MS,
  MONITORING_ROUTEROS_TLS: process.env.MONITORING_ROUTEROS_TLS,
  MONITORING_ROUTEROS_USERNAME: process.env.MONITORING_ROUTEROS_USERNAME,
  MONITORING_SNMP_RETRIES: process.env.MONITORING_SNMP_RETRIES,
  MONITORING_SNMP_TIMEOUT_MS: process.env.MONITORING_SNMP_TIMEOUT_MS,
  NOTIFICATION_WORKER_ENABLED: process.env.NOTIFICATION_WORKER_ENABLED,
  AUTOMATION_WORKER_ENABLED: process.env.AUTOMATION_WORKER_ENABLED,
  AUTOMATION_WORKER_INTERVAL_MS: process.env.AUTOMATION_WORKER_INTERVAL_MS,
  AUTOMATION_WORKER_BATCH_SIZE: process.env.AUTOMATION_WORKER_BATCH_SIZE,
  AUTOMATION_WORKER_LEASE_SECONDS: process.env.AUTOMATION_WORKER_LEASE_SECONDS,
  AUTOMATION_MAX_ATTEMPTS: process.env.AUTOMATION_MAX_ATTEMPTS,
  AUTOMATION_MAX_CAUSAL_DEPTH: process.env.AUTOMATION_MAX_CAUSAL_DEPTH,
  NOTIFICATION_WORKER_INTERVAL_MS: process.env.NOTIFICATION_WORKER_INTERVAL_MS,
  NOTIFICATION_WORKER_BATCH_SIZE: process.env.NOTIFICATION_WORKER_BATCH_SIZE,
  NOTIFICATION_WORKER_LEASE_SECONDS: process.env.NOTIFICATION_WORKER_LEASE_SECONDS,
  NOTIFICATION_MAX_ATTEMPTS: process.env.NOTIFICATION_MAX_ATTEMPTS,
  NOTIFICATION_WEBHOOK_TIMEOUT_MS: process.env.NOTIFICATION_WEBHOOK_TIMEOUT_MS,
  NOTIFICATION_WEBHOOK_ALLOW_HTTP: process.env.NOTIFICATION_WEBHOOK_ALLOW_HTTP,
  NOTIFICATION_WHATSAPP_ALLOW_HTTP: process.env.NOTIFICATION_WHATSAPP_ALLOW_HTTP,
  NOTIFICATION_WHATSAPP_TIMEOUT_MS: process.env.NOTIFICATION_WHATSAPP_TIMEOUT_MS,
  NOTIFICATION_WHATSAPP_MAX_TEXT_LENGTH: process.env.NOTIFICATION_WHATSAPP_MAX_TEXT_LENGTH,
});

if (!parsedEnvironment.success) {
  const details = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');

  throw new Error(`Configuración de entorno inválida: ${details}`);
}

export const environment = Object.freeze(parsedEnvironment.data);
