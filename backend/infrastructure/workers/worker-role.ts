export enum WorkerRole {
  Automation = 'automation',
  Outbox = 'outbox',
  Provisioning = 'provisioning',
}

export const workerRoles: readonly WorkerRole[] = Object.freeze([
  WorkerRole.Outbox,
  WorkerRole.Automation,
  WorkerRole.Provisioning,
]);
