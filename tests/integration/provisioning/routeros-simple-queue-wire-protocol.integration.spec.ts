import { createServer, type Server, type Socket } from 'node:net';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ProvisioningActionInput } from '../../../backend/application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterConnectionProfile } from '../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type { RouterOsClientFactoryPort } from '../../../backend/application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../backend/application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsSimpleQueueProvisioningAdapter } from '../../../backend/infrastructure/provisioning/adapters/routeros-simple-queue-provisioning.adapter.js';
import { LibraryRouterOsClient } from '../../../backend/infrastructure/provisioning/routeros/library-routeros.client.js';

/**
 * Regression coverage for the "no such command" bug: `LibraryRouterOsClient`
 * used to call `client.print('/queue/simple/print', ...)`, but the underlying
 * `@sourceregistry/mikrotik-client` `print()` already appends `/print` itself,
 * producing the invalid path `/queue/simple/print/print` on the wire.
 *
 * This spins up a minimal RouterOS API TCP server (real socket, real binary
 * framing) to assert the exact command words sent, without needing a router.
 */

interface CapturedCommand {
  readonly attributes: Record<string, string>;
  readonly command: string;
}

function encodeLength(length: number): Buffer {
  if (length <= 0x7f) {
    return Buffer.from([length]);
  }
  if (length <= 0x3fff) {
    const value = length | 0x8000;
    return Buffer.from([(value >> 8) & 0xff, value & 0xff]);
  }
  const value = length | 0xc00000;
  return Buffer.from([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

function encodeWord(word: string): Buffer {
  const body = Buffer.from(word, 'utf8');
  return Buffer.concat([encodeLength(body.length), body]);
}

function encodeSentence(words: readonly string[]): Buffer {
  return Buffer.concat([...words.map(encodeWord), Buffer.from([0])]);
}

function decodeLength(buffer: Buffer, offset: number): { bytesRead: number; length: number } | undefined {
  if (offset >= buffer.length) {
    return undefined;
  }
  const first = buffer[offset] ?? 0;
  if (first < 0x80) {
    return { bytesRead: 1, length: first };
  }
  if (first < 0xc0) {
    if (offset + 2 > buffer.length) {
      return undefined;
    }
    return { bytesRead: 2, length: ((first << 8) | (buffer[offset + 1] ?? 0)) & 0x3fff };
  }
  if (offset + 3 > buffer.length) {
    return undefined;
  }
  return {
    bytesRead: 3,
    length: ((first << 16) | ((buffer[offset + 1] ?? 0) << 8) | (buffer[offset + 2] ?? 0)) & 0x1fffff,
  };
}

class SentenceReader {
  private buffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  private currentWords: string[] = [];

  public push(chunk: Buffer): string[][] {
    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);
    const sentences: string[][] = [];
    let offset = 0;
    let decoded = decodeLength(this.buffer, offset);
    while (decoded && offset + decoded.bytesRead + decoded.length <= this.buffer.length) {
      offset += decoded.bytesRead;
      const wordBytes = this.buffer.subarray(offset, offset + decoded.length);
      offset += decoded.length;
      if (decoded.length === 0) {
        sentences.push(this.currentWords);
        this.currentWords = [];
      } else {
        this.currentWords.push(wordBytes.toString('utf8'));
      }
      decoded = decodeLength(this.buffer, offset);
    }
    this.buffer = this.buffer.subarray(offset);
    return sentences;
  }
}

function parseSentence(words: readonly string[]): { attributes: Record<string, string>; command: string; tag: string } {
  const [command, ...rest] = words;
  const attributes: Record<string, string> = {};
  let tag = '';
  for (const word of rest) {
    if (word.startsWith('.tag=')) {
      tag = word.slice('.tag='.length);
      continue;
    }
    if (word.startsWith('=')) {
      const eq = word.indexOf('=', 1);
      const key = eq === -1 ? word.slice(1) : word.slice(1, eq);
      const value = eq === -1 ? '' : word.slice(eq + 1);
      attributes[key] = value;
    }
  }
  return { attributes, command: command ?? '', tag };
}

describe('LibraryRouterOsClient wire protocol (Simple Queue)', () => {
  let server: Server;
  let port: number;
  let captured: CapturedCommand[];

  beforeEach(async () => {
    captured = [];
    server = createServer((socket: Socket) => {
      const reader = new SentenceReader();
      socket.on('data', (chunk: Buffer) => {
        for (const words of reader.push(chunk)) {
          const { attributes, command, tag } = parseSentence(words);
          if (command !== '/login') {
            captured.push({ attributes, command });
          }
          socket.write(encodeSentence(['!done', `.tag=${tag}`]));
        }
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('No se pudo determinar el puerto del servidor RouterOS de prueba.');
    }
    port = address.port;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  function testProfile(): RouterConnectionProfile {
    return {
      host: '127.0.0.1',
      port,
      secretReference: 'unused',
      timeoutMs: 2_000,
      tls: false,
      username: 'admin',
    };
  }

  it('findSimpleQueue envia /queue/simple/print (no /queue/simple/print/print)', async () => {
    const client = await LibraryRouterOsClient.connect(testProfile(), 'irrelevant');
    try {
      await client.findSimpleQueue({ name: 'TEST-CUZONET-007' });
    } finally {
      await client.close();
    }

    expect(captured).toHaveLength(1);
    expect(captured[0]?.command).toBe('/queue/simple/print');
  });

  it('listSimpleQueues envia /queue/simple/print (no /queue/simple/print/print)', async () => {
    const client = await LibraryRouterOsClient.connect(testProfile(), 'irrelevant');
    try {
      await client.listSimpleQueues();
    } finally {
      await client.close();
    }

    expect(captured).toHaveLength(1);
    expect(captured[0]?.command).toBe('/queue/simple/print');
  });

  it('createSimpleQueue envia exactamente /queue/simple/add con los parametros efectivos', async () => {
    const client = await LibraryRouterOsClient.connect(testProfile(), 'irrelevant');
    try {
      await client.createSimpleQueue({
        comment: 'Prueba E2E CuzoNet 007',
        maxLimit: '1M/2M',
        name: 'TEST-CUZONET-007',
        target: '192.168.10.250/32',
      });
    } finally {
      await client.close();
    }

    expect(captured).toHaveLength(1);
    expect(captured[0]?.command).toBe('/queue/simple/add');
    expect(captured[0]?.attributes).toEqual({
      comment: 'Prueba E2E CuzoNet 007',
      disabled: 'no',
      'max-limit': '1M/2M',
      name: 'TEST-CUZONET-007',
      target: '192.168.10.250/32',
    });
  });

  it('el nombre de accion interno routeros.simple_queue.create nunca se envia como comando RouterOS', async () => {
    const resolver: RouterConnectionResolverPort = { resolve: async () => testProfile() };
    const secretProvider: SecretProviderPort = { getSecret: async () => 'irrelevant' };
    const clientFactory: RouterOsClientFactoryPort = {
      create: async (profile, secret) => LibraryRouterOsClient.connect(profile, secret),
    };
    const adapter = new RouterOsSimpleQueueProvisioningAdapter(
      'routeros.simple_queue.create',
      resolver,
      secretProvider,
      clientFactory,
    );

    const input: ProvisioningActionInput = {
      actionType: 'routeros.simple_queue.create',
      companyId: 'company-1',
      configurationReference: undefined,
      idempotencyKey: 'key-008',
      inputSnapshotJson: JSON.stringify({
        actionType: 'routeros.simple_queue.create',
        comment: 'Prueba E2E CuzoNet 008',
        maxLimitDownload: '2M',
        maxLimitUpload: '1M',
        queueName: 'TEST-CUZONET-008',
        routerId: 'router-01',
        target: '192.168.10.250/32',
      }),
      requestId: 'req-008',
      target: { id: 'TEST-CUZONET-008', type: 'simple-queue' },
    };

    const result = await adapter.execute(input);

    expect(result.outcome).toBe('success');
    expect(captured.map((entry) => entry.command)).toEqual(['/queue/simple/print', '/queue/simple/add']);
    for (const entry of captured) {
      expect(entry.command).not.toContain('routeros.simple_queue.create');
    }
    expect(captured[1]?.attributes).toEqual({
      comment: 'Prueba E2E CuzoNet 008',
      disabled: 'no',
      'max-limit': '1M/2M',
      name: 'TEST-CUZONET-008',
      target: '192.168.10.250/32',
    });
  });
});
