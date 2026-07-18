export enum WorkerRole {
  Automation = 'automation',
  Monitoring = 'monitoring',
  Outbox = 'outbox',
  Provisioning = 'provisioning',
}

export const workerRoles: readonly WorkerRole[] = Object.freeze([
  WorkerRole.Outbox,
  WorkerRole.Automation,
  WorkerRole.Monitoring,
  WorkerRole.Provisioning,
]);
