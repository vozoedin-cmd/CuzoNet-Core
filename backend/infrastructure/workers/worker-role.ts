export enum WorkerRole {
  Automation = 'automation',
  Monitoring = 'monitoring',
  NotificationDispatch = 'notification_dispatch',
  NotificationOutbox = 'notification_outbox',
  Outbox = 'outbox',
  Provisioning = 'provisioning',
}

export const workerRoles: readonly WorkerRole[] = Object.freeze([
  WorkerRole.Outbox,
  WorkerRole.Automation,
  WorkerRole.Monitoring,
  WorkerRole.Provisioning,
  WorkerRole.NotificationOutbox,
  WorkerRole.NotificationDispatch,
]);
