import { describe, expect, it } from 'vitest';

import type {
  RouterOsApiSession,
  RouterOsCommand,
  RouterOsSentence,
} from '../../../../backend/infrastructure/mikrotik/api-ssl/router-os-api.contracts.js';
import { UnknownTrap } from '../../../../backend/infrastructure/mikrotik/api-ssl/router-os-api-errors.js';
import { RouterOsTrapClassifier } from '../../../../backend/infrastructure/mikrotik/api-ssl/router-os-trap-classifier.js';
import {
  decodeSentences,
  encodeSentence,
} from '../../../../backend/infrastructure/mikrotik/api-ssl/router-os-sentence-codec.js';
import {
  RouterCapabilities,
  UnsupportedRouterOsVersionError,
} from '../../../../backend/infrastructure/mikrotik/capabilities/router-capabilities.js';
import { SimpleQueueAssembler } from '../../../../backend/infrastructure/mikrotik/simple-queue/simple-queue-assembler.js';

describe('MikroTik API-SSL', () => {
  it('codifica y decodifica sentences RouterOS aunque lleguen fragmentadas', () => {
    const encoded = encodeSentence(['!re', '=name=queue-1', `=comment=${'x'.repeat(140)}`]);
    const first = decodeSentences(encoded.slice(0, 5));
    const completed = decodeSentences(join(first.remainder, encoded.slice(5)));

    expect(first.sentences).toEqual([]);
    expect(completed.remainder).toHaveLength(0);
    expect(completed.sentences).toEqual([['!re', '=name=queue-1', `=comment=${'x'.repeat(140)}`]]);
  });

  it('clasifica UnknownTrap como PERMANENT hasta que exista una regla explicita', () => {
    const classified = new RouterOsTrapClassifier().classify('2', 'mensaje no catalogado');

    expect(classified).toBeInstanceOf(UnknownTrap);
    expect(classified.classification).toBe('PERMANENT');
  });

  it('conserva reglas explicitas para fallos transitorios conocidos', () => {
    const classified = new RouterOsTrapClassifier().classify('2', 'device is busy');

    expect(classified).not.toBeInstanceOf(UnknownTrap);
    expect(classified.classification).toBe('RETRYABLE');
  });
});

describe('RouterCapabilities', () => {
  it('acepta RouterOS igual o superior a la version minima', async () => {
    const session = versionSession('7.20.1 (stable)');

    await expect(RouterCapabilities.inspect(session)).resolves.toMatchObject({
      version: '7.20.1 (stable)',
    });
  });

  it('rechaza RouterOS anterior a la version minima', () => {
    expect(() => RouterCapabilities.fromVersion('6.42.12')).toThrow(
      UnsupportedRouterOsVersionError,
    );
  });
});

describe('SimpleQueueAssembler', () => {
  it('ensambla una queue determinista usando resourceId como identidad tecnica', () => {
    const assembly = new SimpleQueueAssembler().assemble({
      downloadKbps: 20_000,
      resourceId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c50',
      serviceId: '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c20',
      target: '192.0.2.10/32',
      uploadKbps: 5_000,
    });

    expect(assembly).toMatchObject({
      comment: 'cuzonet:resource:01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c50',
      maxLimit: '5000k/20000k',
      name: 'cuzonet-01890f2e-01890f2e',
      target: '192.0.2.10/32',
    });
    expect(assembly.desiredHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

function versionSession(version: string): RouterOsApiSession {
  return {
    close: () => Promise.resolve(),
    execute: (command: RouterOsCommand) =>
      Promise.resolve<readonly RouterOsSentence[]>(
        command.path === '/system/resource/print'
          ? [
              { attributes: { version }, type: '!re' },
              { attributes: {}, type: '!done' },
            ]
          : [{ attributes: {}, type: '!done' }],
      ),
  };
}

function join(left: Uint8Array, right: Uint8Array): Uint8Array {
  const joined = new Uint8Array(left.length + right.length);
  joined.set(left);
  joined.set(right, left.length);
  return joined;
}
