import { connect, type ConnectionOptions, type TLSSocket } from 'node:tls';

import type {
  RouterOsApiClient,
  RouterOsApiSession,
  RouterOsCommand,
  RouterOsConnection,
  RouterOsSentence,
} from './router-os-api.contracts.js';
import { RouterOsTransportError } from './router-os-api-errors.js';
import { RouterOsTrapClassifier } from './router-os-trap-classifier.js';
import { decodeSentences, encodeSentence } from './router-os-sentence-codec.js';

interface ActiveCommand {
  cleanup(): void;
  reject(error: Error): void;
  replies: RouterOsSentence[];
  resolve(replies: readonly RouterOsSentence[]): void;
}

export class RouterOsApiSslClient implements RouterOsApiClient {
  public constructor(private readonly trapClassifier = new RouterOsTrapClassifier()) {}

  public async connect(
    connection: RouterOsConnection,
    signal?: AbortSignal,
  ): Promise<RouterOsApiSession> {
    if (signal?.aborted === true) throw signal.reason;
    const socket = await this.openSocket(connection, signal);
    const session = new RouterOsApiSslSession(
      socket,
      connection.timeoutMs ?? 10_000,
      this.trapClassifier,
    );
    try {
      await session.execute(
        {
          arguments: { name: connection.username, password: connection.password },
          path: '/login',
        },
        signal,
      );
      return session;
    } catch (error) {
      await session.close();
      throw error;
    }
  }

  private openSocket(connection: RouterOsConnection, signal?: AbortSignal): Promise<TLSSocket> {
    return new Promise((resolve, reject) => {
      const options: ConnectionOptions = {
        host: connection.host,
        port: connection.port ?? 8729,
        rejectUnauthorized: connection.rejectUnauthorized ?? true,
        ...(connection.serverName === undefined ? {} : { servername: connection.serverName }),
      };
      const socket = connect(options);
      const timeout = setTimeout(() => {
        fail(new RouterOsTransportError('Timeout conectando a RouterOS API-SSL.'));
      }, connection.timeoutMs ?? 10_000);
      timeout.unref();

      const cleanup = () => {
        clearTimeout(timeout);
        socket.removeListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };
      const fail = (error: Error) => {
        cleanup();
        socket.destroy();
        reject(
          error instanceof RouterOsTransportError
            ? error
            : new RouterOsTransportError('No fue posible conectar a RouterOS API-SSL.', {
                cause: error,
              }),
        );
      };
      const onAbort = () => fail(new RouterOsTransportError('Conexion API-SSL cancelada.'));
      const onError = (error: Error) => fail(error);

      socket.once('secureConnect', () => {
        cleanup();
        resolve(socket);
      });
      socket.once('error', onError);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}

class RouterOsApiSslSession implements RouterOsApiSession {
  private active: ActiveCommand | undefined;
  private buffer: Uint8Array<ArrayBufferLike> = new Uint8Array();
  private closed = false;

  public constructor(
    private readonly socket: TLSSocket,
    private readonly timeoutMs: number,
    private readonly trapClassifier: RouterOsTrapClassifier,
  ) {
    socket.on('data', (chunk: Buffer) => this.receive(chunk));
    socket.on('error', (error: Error) =>
      this.failActive(
        new RouterOsTransportError('Fallo de transporte durante una operacion RouterOS.', {
          cause: error,
        }),
      ),
    );
    socket.on('close', () => {
      this.closed = true;
      this.failActive(new RouterOsTransportError('RouterOS cerro la conexion API-SSL.'));
    });
  }

  public close(): Promise<void> {
    this.closed = true;
    this.failActive(new RouterOsTransportError('Sesion RouterOS cerrada.'));
    this.socket.destroy();
    return Promise.resolve();
  }

  public execute(
    command: RouterOsCommand,
    signal?: AbortSignal,
  ): Promise<readonly RouterOsSentence[]> {
    if (this.closed) {
      return Promise.reject(new RouterOsTransportError('La sesion RouterOS esta cerrada.'));
    }
    if (this.active !== undefined) {
      return Promise.reject(
        new RouterOsTransportError('La sesion RouterOS ya ejecuta un comando.'),
      );
    }
    if (signal?.aborted === true) return Promise.reject(signal.reason);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.failActive(new RouterOsTransportError('Timeout esperando respuesta de RouterOS.'));
        this.socket.destroy();
      }, this.timeoutMs);
      timeout.unref();
      const onAbort = () => {
        this.failActive(new RouterOsTransportError('Operacion RouterOS cancelada.'));
        this.socket.destroy();
      };
      const cleanup = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', onAbort);
      };
      this.active = {
        cleanup,
        reject,
        replies: [],
        resolve,
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.socket.write(encodeSentence(this.commandWords(command)), (error) => {
        if (error !== undefined) {
          this.failActive(
            new RouterOsTransportError('No fue posible enviar el comando a RouterOS.', {
              cause: error,
            }),
          );
        }
      });
    });
  }

  private commandWords(command: RouterOsCommand): readonly string[] {
    const argumentsWords = Object.entries(command.arguments ?? {})
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, value]) => `=${name}=${value}`);
    return [command.path, ...argumentsWords, ...(command.queries ?? [])];
  }

  private receive(chunk: Uint8Array): void {
    try {
      const combined = new Uint8Array(this.buffer.length + chunk.length);
      combined.set(this.buffer);
      combined.set(chunk, this.buffer.length);
      const decoded = decodeSentences(combined);
      this.buffer = decoded.remainder;
      for (const words of decoded.sentences) this.handleSentence(words);
    } catch (error) {
      this.failActive(
        error instanceof RouterOsTransportError
          ? error
          : new RouterOsTransportError('Respuesta RouterOS invalida.', { cause: error }),
      );
      this.socket.destroy();
    }
  }

  private handleSentence(words: readonly string[]): void {
    const active = this.active;
    if (active === undefined || words.length === 0) return;
    const sentence = parseSentence(words);
    if (sentence.type === '!trap') {
      this.failActive(
        this.trapClassifier.classify(
          sentence.attributes.category,
          sentence.attributes.message ?? 'RouterOS devolvio un trap sin mensaje.',
        ),
      );
      return;
    }
    if (sentence.type === '!fatal') {
      this.failActive(
        new RouterOsTransportError(
          sentence.attributes.message ?? 'RouterOS devolvio una respuesta fatal.',
        ),
      );
      return;
    }
    active.replies.push(sentence);
    if (sentence.type === '!done') {
      active.cleanup();
      this.active = undefined;
      active.resolve(active.replies);
    }
  }

  private failActive(error: Error): void {
    const active = this.active;
    if (active === undefined) return;
    active.cleanup();
    this.active = undefined;
    active.reject(error);
  }
}

function parseSentence(words: readonly string[]): RouterOsSentence {
  const [rawType, ...rawAttributes] = words;
  if (rawType !== '!done' && rawType !== '!fatal' && rawType !== '!re' && rawType !== '!trap') {
    throw new RouterOsTransportError(`Tipo de respuesta RouterOS desconocido: ${rawType ?? ''}.`);
  }
  const attributes: Record<string, string> = {};
  for (const word of rawAttributes) {
    if (!word.startsWith('=')) continue;
    const separator = word.indexOf('=', 1);
    if (separator < 0) continue;
    attributes[word.slice(1, separator)] = word.slice(separator + 1);
  }
  return { attributes, type: rawType };
}
