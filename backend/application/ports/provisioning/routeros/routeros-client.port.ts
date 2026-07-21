import type { RouterConnectionProfile } from './router-connection-resolver.port.js';

export interface RouterOsSimpleQueueReference {
  readonly id?: string;
  readonly name?: string;
}

export interface RouterOsSimpleQueue {
  readonly comment?: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly maxLimit: string;
  readonly name: string;
  readonly target: string;
}

export interface RouterOsSimpleQueueCreateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly maxLimit: string;
  readonly name: string;
  readonly target: string;
}

export interface RouterOsSimpleQueueUpdateData {
  readonly comment?: string;
  readonly maxLimit?: string;
  readonly name?: string;
  readonly target?: string;
}

export interface RouterOsPppoeSecretReference {
  readonly id?: string;
  readonly name?: string;
}

export interface RouterOsPppoeSecret {
  readonly comment?: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly name: string;
  readonly password?: string;
  readonly profile: string;
  readonly service: string;
}

export interface RouterOsPppoeSecretCreateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly name: string;
  readonly password?: string;
  readonly profile: string;
  readonly service?: string;
}

export interface RouterOsPppoeSecretUpdateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly name?: string;
  readonly password?: string;
  readonly profile?: string;
  readonly service?: string;
}

export interface RouterOsClientPort {
  close(): Promise<void>;

  createSimpleQueue(queue: RouterOsSimpleQueueCreateData): Promise<void>;
  disableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  enableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  findSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<RouterOsSimpleQueue | null>;
  removeSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  updateSimpleQueue(reference: RouterOsSimpleQueueReference, data: RouterOsSimpleQueueUpdateData): Promise<void>;

  createPppoeSecret(secret: RouterOsPppoeSecretCreateData): Promise<void>;
  disablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void>;
  enablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void>;
  findPppoeSecret(reference: RouterOsPppoeSecretReference): Promise<RouterOsPppoeSecret | null>;
  removePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void>;
  updatePppoeSecret(reference: RouterOsPppoeSecretReference, data: RouterOsPppoeSecretUpdateData): Promise<void>;
}

export interface RouterOsClientFactoryPort {
  create(profile: RouterConnectionProfile, secret: string): Promise<RouterOsClientPort>;
}
