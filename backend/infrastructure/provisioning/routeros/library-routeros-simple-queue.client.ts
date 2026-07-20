import { RouterOSClient as BaseRouterOsClient } from '@sourceregistry/mikrotik-client/routeros';

import type { RouterConnectionProfile } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientPort,
  RouterOsSimpleQueue,
  RouterOsSimpleQueueCreateData,
  RouterOsSimpleQueueReference,
  RouterOsSimpleQueueUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';

export class LibraryRouterOsSimpleQueueClient implements RouterOsClientPort {
  public constructor(
    private readonly client: BaseRouterOsClient,
    private readonly timeoutMs: number,
  ) {}

  public static async connect(
    profile: RouterConnectionProfile,
    secret: string,
  ): Promise<LibraryRouterOsSimpleQueueClient> {
    const client = new BaseRouterOsClient({
      host: profile.host,
      password: secret,
      port: profile.port,
      timeoutMs: profile.timeoutMs,
      tls: profile.tls,
      username: profile.username,
    });
    await client.connect();
    return new LibraryRouterOsSimpleQueueClient(client, profile.timeoutMs);
  }

  public async close(): Promise<void> {
    await this.client.close();
  }

  public async createSimpleQueue(queue: RouterOsSimpleQueueCreateData): Promise<void> {
    await this.client.execute('/queue/simple/add', {
      attributes: {
        comment: queue.comment ?? '',
        disabled: queue.disabled ? 'yes' : 'no',
        'max-limit': queue.maxLimit,
        name: queue.name,
        target: queue.target,
      },
      timeoutMs: this.timeoutMs,
    });
  }

  public async disableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      return;
    }
    await this.client.execute('/queue/simple/disable', {
      attributes: { numbers: queue.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      return;
    }
    await this.client.execute('/queue/simple/enable', {
      attributes: { numbers: queue.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findSimpleQueue(
    reference: RouterOsSimpleQueueReference,
  ): Promise<RouterOsSimpleQueue | null> {
    const query = reference.id !== undefined 
      ? `?.id=${reference.id}` 
      : `?name=${reference.name}`;
      
    if (reference.id === undefined && reference.name === undefined) {
      return null;
    }

    const replies = await this.client.print('/queue/simple/print', {
      attributes: {
        '.proplist': '.id,name,target,max-limit,disabled,comment',
      },
      queries: [query],
      timeoutMs: this.timeoutMs,
    });

    const reply = replies[0];
    if (!reply) {
      return null;
    }

    return {
      comment: reply.comment ?? '',
      disabled: reply.disabled === 'true',
      id: reply['.id'] ?? '',
      maxLimit: (reply['max-limit'] as string) ?? '',
      name: reply.name ?? '',
      target: reply.target ?? '',
    };
  }

  public async removeSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void> {
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      return;
    }
    await this.client.execute('/queue/simple/remove', {
      attributes: { numbers: queue.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updateSimpleQueue(
    reference: RouterOsSimpleQueueReference,
    data: RouterOsSimpleQueueUpdateData,
  ): Promise<void> {
    const queue = await this.findSimpleQueue(reference);
    if (!queue) {
      return;
    }

    const attributes: Record<string, string> = { numbers: queue.id };
    if (data.comment !== undefined) {
      attributes.comment = data.comment;
    }
    if (data.maxLimit !== undefined) {
      attributes['max-limit'] = data.maxLimit;
    }
    if (data.name !== undefined) {
      attributes.name = data.name;
    }
    if (data.target !== undefined) {
      attributes.target = data.target;
    }

    if (Object.keys(attributes).length === 1) {
      return;
    }

    await this.client.execute('/queue/simple/set', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }
}
