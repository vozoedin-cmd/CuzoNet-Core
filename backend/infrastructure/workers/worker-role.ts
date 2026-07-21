export enum WorkerRole {
  Automation = 'automation',
  AutomationDispatch = 'automation_dispatch',
  ProvisioningDispatch = 'provisioning_dispatch',
  ProvisioningEventDispatch = 'provisioning_event_dispatch',
  Monitoring = 'monitoring',
  NotificationDispatch = 'notification_dispatch',
  NotificationOutbox = 'notification_outbox',
  Outbox = 'outbox',
  Provisioning = 'provisioning',
}

export const workerRoles: readonly WorkerRole[] = Object.freeze([
  WorkerRole.Outbox,
  WorkerRole.Automation,
  WorkerRole.AutomationDispatch,
  WorkerRole.Monitoring,
  WorkerRole.Provisioning,
  WorkerRole.ProvisioningEventDispatch,
  WorkerRole.NotificationOutbox,
  WorkerRole.NotificationDispatch,
]);
