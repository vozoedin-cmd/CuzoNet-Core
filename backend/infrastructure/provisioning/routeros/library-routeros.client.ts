import { RouterOSClient as BaseRouterOsClient } from '@sourceregistry/mikrotik-client/routeros';

import type { RouterConnectionProfile } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
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

export class LibraryRouterOsClient implements RouterOsClientPort {
  public constructor(
    private readonly client: BaseRouterOsClient,
    private readonly timeoutMs: number,
  ) {}

  public static async connect(
    profile: RouterConnectionProfile,
    secret: string,
  ): Promise<LibraryRouterOsClient> {
    const client = new BaseRouterOsClient({
      host: profile.host,
      password: secret,
      port: profile.port,
      timeoutMs: profile.timeoutMs,
      tls: profile.tls,
      username: profile.username,
    });
    await client.connect();
    return new LibraryRouterOsClient(client, profile.timeoutMs);
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

  public async createPppoeSecret(secret: RouterOsPppoeSecretCreateData): Promise<void> {
    const attributes: Record<string, string> = {
      name: secret.name,
      profile: secret.profile,
      service: secret.service ?? 'pppoe',
    };
    if (secret.comment !== undefined) attributes.comment = secret.comment;
    if (secret.password !== undefined) attributes.password = secret.password;
    if (secret.disabled !== undefined) attributes.disabled = secret.disabled ? 'yes' : 'no';

    await this.client.execute('/ppp/secret/add', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }

  public async disablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    const secret = await this.findPppoeSecret(reference);
    if (!secret) return;
    
    await this.client.execute('/ppp/secret/disable', {
      attributes: { numbers: secret.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async enablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    const secret = await this.findPppoeSecret(reference);
    if (!secret) return;
    
    await this.client.execute('/ppp/secret/enable', {
      attributes: { numbers: secret.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async findPppoeSecret(
    reference: RouterOsPppoeSecretReference,
  ): Promise<RouterOsPppoeSecret | null> {
    const query = reference.id !== undefined 
      ? `?.id=${reference.id}` 
      : `?name=${reference.name}`;
      
    if (reference.id === undefined && reference.name === undefined) {
      return null;
    }

    const replies = await this.client.print('/ppp/secret/print', {
      attributes: {
        '.proplist': '.id,name,service,profile,password,disabled,comment',
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
      name: reply.name ?? '',
      password: reply.password ?? '',
      profile: reply.profile ?? '',
      service: reply.service ?? '',
    };
  }

  public async removePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void> {
    const secret = await this.findPppoeSecret(reference);
    if (!secret) return;
    
    await this.client.execute('/ppp/secret/remove', {
      attributes: { numbers: secret.id },
      timeoutMs: this.timeoutMs,
    });
  }

  public async updatePppoeSecret(
    reference: RouterOsPppoeSecretReference,
    data: RouterOsPppoeSecretUpdateData,
  ): Promise<void> {
    const secret = await this.findPppoeSecret(reference);
    if (!secret) return;

    const attributes: Record<string, string> = { numbers: secret.id };
    if (data.comment !== undefined) attributes.comment = data.comment;
    if (data.name !== undefined) attributes.name = data.name;
    if (data.password !== undefined) attributes.password = data.password;
    if (data.profile !== undefined) attributes.profile = data.profile;
    if (data.service !== undefined) attributes.service = data.service;
    if (data.disabled !== undefined) attributes.disabled = data.disabled ? 'yes' : 'no';

    if (Object.keys(attributes).length === 1) return;

    await this.client.execute('/ppp/secret/set', {
      attributes,
      timeoutMs: this.timeoutMs,
    });
  }
}
