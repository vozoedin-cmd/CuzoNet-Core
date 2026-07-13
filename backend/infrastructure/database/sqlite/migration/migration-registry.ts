import { automationMigration } from '../migrations/0007-automation.js';
import { billingMigration } from '../migrations/0004-billing.js';
import { clientsMigration } from '../migrations/0002-clients.js';
import { foundationMigration } from '../migrations/0001-foundation.js';
import { outboxIdempotencyMigration } from '../migrations/0006-outbox-idempotency.js';
import { provisioningMigration } from '../migrations/0005-provisioning.js';
import { servicesMigration } from '../migrations/0003-services.js';
import type { Migration } from './migration.js';

export const migrations: readonly Migration[] = Object.freeze([
  foundationMigration,
  clientsMigration,
  servicesMigration,
  billingMigration,
  provisioningMigration,
  outboxIdempotencyMigration,
  automationMigration,
]);
