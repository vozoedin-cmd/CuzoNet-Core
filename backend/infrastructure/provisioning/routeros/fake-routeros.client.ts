import type {
  RouterOsClientPort,
  RouterOsSimpleQueue,
  RouterOsSimpleQueueCreateData,
  RouterOsSimpleQueueReference,
  RouterOsSimpleQueueUpdateData,
  RouterOsPppoeSecret,
  RouterOsPppoeSecretCreateData,
  RouterOsPppoeSecretReference,
  RouterOsPppoeSecretUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';

export class FakeRouterOsClient implements RouterOsClientPort {
  public closed = false;
  public queues: RouterOsSimpleQueue[] = [];
  public secrets: RouterOsPppoeSecret[] = [];
  private nextId = 1;

  public async close(): Promise<void> {
    this.closed = true;
  }

  public async createSimpleQueue(queue: RouterOsSimpleQueueCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queueData: RouterOsSimpleQueue = {
      ...(queue.comment !== undefined ? { comment: queue.comment } : {}),
      disabled: queue.disabled ?? false,
      id: `*${this.nextId++}`,
      maxLimit: queue.maxLimit,
      name: queue.name,
      target: queue.target,
    };
    this.queues.push(queueData);
  }

  public async disableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      throw new Error(`Queue not found: ${JSON.stringify(reference)}`);
    }
    const index = this.queues.findIndex((q) => q.id === queue.id);
    this.queues[index] = { ...queue, disabled: true };
  }

  public async enableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      throw new Error(`Queue not found: ${JSON.stringify(reference)}`);
    }
    const index = this.queues.findIndex((q) => q.id === queue.id);
    this.queues[index] = { ...queue, disabled: false };
  }

  public async findSimpleQueue(
    reference: RouterOsSimpleQueueReference,
  ): Promise<RouterOsSimpleQueue | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queue = this.queues.find(
      (q) =>
        (reference.id !== undefined && q.id === reference.id) ||
        (reference.name !== undefined && q.name === reference.name),
    );
    return queue ?? null;
  }

  public async removeSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      return;
    }
    this.queues = this.queues.filter((q) => q.id !== queue.id);
  }

  public async updateSimpleQueue(
    reference: RouterOsSimpleQueueReference,
    data: RouterOsSimpleQueueUpdateData,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      throw new Error(`Queue not found: ${JSON.stringify(reference)}`);
    }
    const index = this.queues.findIndex((q) => q.id === queue.id);
    const queueData: RouterOsSimpleQueue = {
      ...queue,
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
      ...(data.maxLimit !== undefined ? { maxLimit: data.maxLimit } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.target !== undefined ? { target: data.target } : {}),
    };
    this.queues[index] = queueData;
  }

  public async createPppoeSecret(secret: RouterOsPppoeSecretCreateData): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secretData: RouterOsPppoeSecret = {
      ...(secret.comment !== undefined ? { comment: secret.comment } : {}),
      ...(secret.password !== undefined ? { password: secret.password } : {}),
      disabled: secret.disabled ?? false,
      id: `*${this.nextId++}`,
      name: secret.name,
      profile: secret.profile,
      service: secret.service ?? 'pppoe',
    };
    this.secrets.push(secretData);
  }

  public async disablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secret = await this.findPppoeSecret(reference);
    if (!secret) {
      throw new Error(`PPPoE secret not found: ${JSON.stringify(reference)}`);
    }
    const index = this.secrets.findIndex((s) => s.id === secret.id);
    this.secrets[index] = { ...secret, disabled: true };
  }

  public async enablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secret = await this.findPppoeSecret(reference);
    if (!secret) {
      throw new Error(`PPPoE secret not found: ${JSON.stringify(reference)}`);
    }
    const index = this.secrets.findIndex((s) => s.id === secret.id);
    this.secrets[index] = { ...secret, disabled: false };
  }

  public async findPppoeSecret(
    reference: RouterOsPppoeSecretReference,
  ): Promise<RouterOsPppoeSecret | null> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secret = this.secrets.find(
      (s) =>
        (reference.id !== undefined && s.id === reference.id) ||
        (reference.name !== undefined && s.name === reference.name),
    );
    return secret ?? null;
  }

  public async removePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secret = await this.findPppoeSecret(reference);
    if (!secret) {
      return;
    }
    this.secrets = this.secrets.filter((s) => s.id !== secret.id);
  }

  public async updatePppoeSecret(
    reference: RouterOsPppoeSecretReference,
    data: RouterOsPppoeSecretUpdateData,
  ): Promise<void> {
    if (this.closed) {
      throw new Error('Client is closed');
    }
    const secret = await this.findPppoeSecret(reference);
    if (!secret) {
      throw new Error(`PPPoE secret not found: ${JSON.stringify(reference)}`);
    }
    const index = this.secrets.findIndex((s) => s.id === secret.id);
    const secretData: RouterOsPppoeSecret = {
      ...secret,
      ...(data.comment !== undefined ? { comment: data.comment } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.password !== undefined ? { password: data.password } : {}),
      ...(data.profile !== undefined ? { profile: data.profile } : {}),
      ...(data.service !== undefined ? { service: data.service } : {}),
    };
    this.secrets[index] = secretData;
  }
}
