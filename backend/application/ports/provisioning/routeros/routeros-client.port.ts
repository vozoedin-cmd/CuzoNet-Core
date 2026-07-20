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

export interface RouterOsClientPort {
  close(): Promise<void>;
  createSimpleQueue(queue: RouterOsSimpleQueueCreateData): Promise<void>;
  disableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  enableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  findSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<RouterOsSimpleQueue | null>;
  removeSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  updateSimpleQueue(reference: RouterOsSimpleQueueReference, data: RouterOsSimpleQueueUpdateData): Promise<void>;
}

export interface RouterOsClientFactoryPort {
  create(profile: RouterConnectionProfile, secret: string): Promise<RouterOsClientPort>;
}
