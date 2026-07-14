import type {
  ProvisioningExecutionCommand,
  ProvisioningExecutionResult,
  ProvisioningExecutorPort,
} from '../../application/ports/provisioning/provisioning-executor.port.js';
import type { Clock } from '../../application/ports/clock.port.js';
import type {
  RouterOsApiClient,
  RouterOsApiSession,
  RouterOsSentence,
} from './api-ssl/router-os-api.contracts.js';
import {
  RouterOsTransportError,
  RouterOsTrapError,
  UnknownTrap,
} from './api-ssl/router-os-api-errors.js';
import {
  RouterCapabilities,
  UnsupportedRouterOsVersionError,
} from './capabilities/router-capabilities.js';
import type { MikrotikRouterProvider, SimpleQueueTargetResolver } from './mikrotik.contracts.js';
import type { MikrotikResourceRepository } from './resources/mikrotik-resource.repository.js';
import {
  SimpleQueueAssembler,
  type SimpleQueueAssembly,
} from './simple-queue/simple-queue-assembler.js';

export interface MikrotikProvisioningExecutorDependencies {
  apiClient: RouterOsApiClient;
  assembler?: SimpleQueueAssembler;
  clock?: Clock;
  minimumRouterOsVersion?: string;
  resources: MikrotikResourceRepository;
  routers: MikrotikRouterProvider;
  targets: SimpleQueueTargetResolver;
}

const systemClock: Clock = { now: () => new Date() };

export class MikrotikProvisioningExecutorAdapter implements ProvisioningExecutorPort {
  private readonly assembler: SimpleQueueAssembler;
  private readonly clock: Clock;

  public constructor(private readonly dependencies: MikrotikProvisioningExecutorDependencies) {
    this.assembler = dependencies.assembler ?? new SimpleQueueAssembler();
    this.clock = dependencies.clock ?? systemClock;
  }

  public async execute(
    command: ProvisioningExecutionCommand,
  ): Promise<ProvisioningExecutionResult> {
    let session: RouterOsApiSession | undefined;
    try {
      const resource = await this.dependencies.resources.reserve({
        companyId: command.companyId,
        createdAt: this.clock.now(),
        routerId: command.provisionRequest.routerId,
        serviceId: command.serviceId,
      });
      const target = await this.dependencies.targets.resolve({
        companyId: command.companyId,
        ipAddressId: command.provisionRequest.ipAddressId,
        serviceAddressId: command.provisionRequest.serviceAddressId,
        serviceId: command.serviceId,
      });
      if (target === null) {
        return this.failed(
          'PERMANENT_MIKROTIK_SIMPLE_QUEUE_TARGET_NOT_FOUND',
          'No se encontro un target para la Simple Queue.',
        );
      }
      const assembly = this.assembler.assemble({
        downloadKbps: command.downloadKbps,
        resourceId: resource.resourceId,
        serviceId: command.serviceId,
        target,
        uploadKbps: command.uploadKbps,
      });
      await this.dependencies.resources.markPending(resource.resourceId, {
        desiredHash: assembly.desiredHash,
        remoteName: assembly.name,
        updatedAt: this.clock.now(),
      });

      const connection = await this.dependencies.routers.findConnection(
        command.companyId,
        command.provisionRequest.routerId,
      );
      if (connection === null) {
        return this.failed(
          'PERMANENT_MIKROTIK_ROUTER_NOT_FOUND',
          'No se encontro la configuracion del router.',
        );
      }
      session = await this.dependencies.apiClient.connect(connection);
      await RouterCapabilities.inspect(
        session,
        undefined,
        this.dependencies.minimumRouterOsVersion,
      );
      const remoteId = await this.upsertQueue(session, assembly);
      await this.dependencies.resources.markApplied(resource.resourceId, {
        desiredHash: assembly.desiredHash,
        reconciledAt: this.clock.now(),
        remoteId,
        remoteName: assembly.name,
      });
      return { outcome: 'succeeded' };
    } catch (error) {
      return this.mapFailure(error);
    } finally {
      await session?.close();
    }
  }

  private async upsertQueue(
    session: RouterOsApiSession,
    assembly: SimpleQueueAssembly,
  ): Promise<string> {
    const existing = await this.findQueues(session, assembly.comment);
    if (existing.length > 1) {
      throw new PermanentMikrotikError(
        'PERMANENT_MIKROTIK_DUPLICATE_RESOURCE',
        'Mas de una Simple Queue usa el mismo resourceId.',
      );
    }
    const remoteId = existing[0]?.attributes['.id'];
    if (remoteId !== undefined) {
      await session.execute({
        arguments: {
          '.id': remoteId,
          comment: assembly.comment,
          disabled: 'no',
          'max-limit': assembly.maxLimit,
          name: assembly.name,
          target: assembly.target,
        },
        path: '/queue/simple/set',
      });
      return remoteId;
    }

    const added = await session.execute({
      arguments: {
        comment: assembly.comment,
        disabled: 'no',
        'max-limit': assembly.maxLimit,
        name: assembly.name,
        target: assembly.target,
      },
      path: '/queue/simple/add',
    });
    const returnedId = added.find((reply) => reply.type === '!done')?.attributes.ret;
    if (returnedId !== undefined) return returnedId;

    const created = await this.findQueues(session, assembly.comment);
    const createdId = created[0]?.attributes['.id'];
    if (created.length !== 1 || createdId === undefined) {
      throw new RouterOsTransportError(
        'RouterOS no devolvio ni permitio reconciliar el id de la Simple Queue.',
      );
    }
    return createdId;
  }

  private async findQueues(
    session: RouterOsApiSession,
    comment: string,
  ): Promise<readonly RouterOsSentence[]> {
    const replies = await session.execute({
      arguments: { '.proplist': '.id,name,comment,target,max-limit' },
      path: '/queue/simple/print',
      queries: [`?comment=${comment}`],
    });
    return replies.filter((reply) => reply.type === '!re');
  }

  private mapFailure(error: unknown): ProvisioningExecutionResult {
    if (error instanceof PermanentMikrotikError) {
      return this.failed(error.code, error.message);
    }
    if (error instanceof UnknownTrap) {
      return this.failed('PERMANENT_MIKROTIK_UNKNOWN_TRAP', error.message);
    }
    if (error instanceof RouterOsTrapError) {
      const prefix = error.classification === 'PERMANENT' ? 'PERMANENT_' : '';
      return this.failed(`${prefix}MIKROTIK_TRAP`, error.message);
    }
    if (error instanceof UnsupportedRouterOsVersionError) {
      return this.failed('PERMANENT_MIKROTIK_ROUTEROS_VERSION_UNSUPPORTED', error.message);
    }
    if (error instanceof RouterOsTransportError) {
      return this.failed('MIKROTIK_TRANSPORT_ERROR', error.message);
    }
    const message = error instanceof Error ? error.message : 'Fallo MikroTik desconocido.';
    return this.failed('PERMANENT_MIKROTIK_UNCLASSIFIED_ERROR', message);
  }

  private failed(errorCode: string, errorMessage: string): ProvisioningExecutionResult {
    return { errorCode, errorMessage, outcome: 'failed' };
  }
}

class PermanentMikrotikError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PermanentMikrotikError';
  }
}
