import { alertingMigration } from '../migrations/0014-alerting.js';
import { automationMigration } from '../migrations/0007-automation.js';
import { billingMigration } from '../migrations/0004-billing.js';
import { clientsMigration } from '../migrations/0002-clients.js';
import { equipmentMigration } from '../migrations/0011-equipment.js';
import { foundationMigration } from '../migrations/0001-foundation.js';
import { outboxIdempotencyMigration } from '../migrations/0006-outbox-idempotency.js';
import { provisioningMigration } from '../migrations/0005-provisioning.js';
import { servicesMigration } from '../migrations/0003-services.js';
import { mikrotikSimpleQueueMigration } from '../migrations/0009-mikrotik-simple-queue.js';
import { monitoringMigration } from '../migrations/0013-monitoring.js';
import { monitoringWorkerMigration } from '../migrations/0015-monitoring-worker.js';
import { equipmentManagementHostMigration } from '../migrations/0016-equipment-management-host.js';
import { incidentAlertingMigration } from '../migrations/0017-incident-alerting.js';
import { networkMigration } from '../migrations/0012-network.js';
import { notificationEngineMigration } from '../migrations/0018-notification-engine.js';
import { plansMigration } from '../migrations/0010-plans.js';
import { workersMigration } from '../migrations/0008-workers.js';
import { addNotificationDestinationAddressMigration } from '../migrations/0019-add-notification-destination-address.js';
import { automationExecutionEngineMigration } from '../migrations/0020-automation-execution-engine.js';
import { provisioningEngineMigration } from '../migrations/0021-provisioning-engine.js';
import { provisioningEventDispatcherMigration } from '../migrations/0022-provisioning-event-dispatcher.js';
import type { Migration } from './migration.js';

export const migrations: readonly Migration[] = Object.freeze([
  foundationMigration,
  clientsMigration,
  servicesMigration,
  billingMigration,
  provisioningMigration,
  outboxIdempotencyMigration,
  automationMigration,
  workersMigration,
  mikrotikSimpleQueueMigration,
  plansMigration,
  equipmentMigration,
  networkMigration,
  monitoringMigration,
  alertingMigration,
  monitoringWorkerMigration,
  equipmentManagementHostMigration,
  incidentAlertingMigration,
  notificationEngineMigration,
  addNotificationDestinationAddressMigration,
  automationExecutionEngineMigration,
  provisioningEngineMigration,
  provisioningEventDispatcherMigration,
]);
