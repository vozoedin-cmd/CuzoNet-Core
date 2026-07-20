import type {
  RouterOsClientPort,
  RouterOsSimpleQueue,
  RouterOsSimpleQueueCreateData,
  RouterOsSimpleQueueReference,
  RouterOsSimpleQueueUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';

export class FakeRouterOsClient implements RouterOsClientPort {
  public closed = false;
  public queues: RouterOsSimpleQueue[] = [];
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
}
