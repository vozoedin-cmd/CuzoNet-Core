import type { Migration } from '../migration/migration.js';

export const addNotificationDestinationAddressMigration: Migration = {
  name: 'add-notification-destination-address',
  version: 19,
  sql: `
    ALTER TABLE notification_destinations ADD COLUMN address TEXT;
  `,
};
