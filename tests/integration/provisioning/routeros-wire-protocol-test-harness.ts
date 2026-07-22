import { createServer, type Server, type Socket } from 'node:net';

import type { RouterConnectionProfile } from '../../../backend/application/ports/provisioning/routeros/router-connection-resolver.port.js';

/**
 * Shared RouterOS binary API wire-protocol test double.
 *
 * Encodes/decodes real length-prefixed sentences (the same scheme documented
 * and exercised against `@sourceregistry/mikrotik-client` while diagnosing the
 * "no such command" bug for Simple Queue) so any resource's adapter/library
 * client pair can be exercised against a real TCP socket without a router.
 */

export interface CapturedCommand {
  readonly attributes: Record<string, string>;
  readonly command: string;
  readonly queries: readonly string[];
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

export function encodeSentence(words: readonly string[]): Buffer {
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

export function attributeWords(attributes: Readonly<Record<string, string>>): string[] {
  return Object.entries(attributes).map(([key, value]) => `=${key}=${value}`);
}

function parseSentence(
  words: readonly string[],
): { attributes: Record<string, string>; command: string; queries: string[]; tag: string } {
  const [command, ...rest] = words;
  const attributes: Record<string, string> = {};
  const queries: string[] = [];
  let tag = '';
  for (const word of rest) {
    if (word.startsWith('.tag=')) {
      tag = word.slice('.tag='.length);
      continue;
    }
    if (word.startsWith('?')) {
      queries.push(word);
      continue;
    }
    if (word.startsWith('=')) {
      const eq = word.indexOf('=', 1);
      const key = eq === -1 ? word.slice(1) : word.slice(1, eq);
      const value = eq === -1 ? '' : word.slice(eq + 1);
      attributes[key] = value;
    }
  }
  return { attributes, command: command ?? '', queries, tag };
}

export interface FakeRouterOsServer {
  readonly captured: CapturedCommand[];
  /** Cuando esta seteado, cualquier comando que termine en "print" responde con un !re de este registro antes del !done. */
  existingRecord: Record<string, string> | undefined;
  port: number;
  profile(overrides?: Partial<RouterConnectionProfile>): RouterConnectionProfile;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Crea un servidor RouterOS API TCP falso (socket real, framing binario real) para pruebas de wire protocol. */
export function createFakeRouterOsServer(): FakeRouterOsServer {
  let server: Server;
  const captured: CapturedCommand[] = [];
  const state: { existingRecord: Record<string, string> | undefined; port: number } = {
    existingRecord: undefined,
    port: 0,
  };

  return {
    captured,
    get existingRecord() {
      return state.existingRecord;
    },
    set existingRecord(value: Record<string, string> | undefined) {
      state.existingRecord = value;
    },
    get port() {
      return state.port;
    },
    profile(overrides = {}): RouterConnectionProfile {
      return {
        host: '127.0.0.1',
        port: state.port,
        secretReference: 'unused',
        timeoutMs: 2_000,
        tls: false,
        username: 'admin',
        ...overrides,
      };
    },
    async start(): Promise<void> {
      captured.length = 0;
      state.existingRecord = undefined;
      server = createServer((socket: Socket) => {
        const reader = new SentenceReader();
        socket.on('data', (chunk: Buffer) => {
          for (const words of reader.push(chunk)) {
            const { attributes, command, queries, tag } = parseSentence(words);
            if (command !== '/login') {
              captured.push({ attributes, command, queries });
            }
            if (command.endsWith('/print') && state.existingRecord) {
              socket.write(encodeSentence(['!re', ...attributeWords(state.existingRecord), `.tag=${tag}`]));
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
      state.port = address.port;
    },
    async stop(): Promise<void> {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
}
