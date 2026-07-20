import type {
  ProvisioningActionAdapter,
  ProvisioningActionInput,
  ProvisioningActionResult,
} from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsSimpleQueueConflictError } from '../../../domain/provisioning/routeros/errors/routeros-simple-queue-conflict.error.js';
import {
  routerOsSimpleQueueInputSchema,
  type RouterOsSimpleQueueCreateInput,
  type RouterOsSimpleQueueDisableInput,
  type RouterOsSimpleQueueEnableInput,
  type RouterOsSimpleQueueInput,
  type RouterOsSimpleQueueRemoveInput,
  type RouterOsSimpleQueueUpdateInput,
} from '../../../domain/provisioning/routeros/routeros-simple-queue.input.js';
import type {
  RouterOsSimpleQueueCreateData,
  RouterOsSimpleQueueUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';

export class RouterOsSimpleQueueProvisioningAdapter implements ProvisioningActionAdapter {
  public constructor(
    public readonly type: string,
    private readonly connectionResolver: RouterConnectionResolverPort,
    private readonly secretProvider: SecretProviderPort,
    private readonly clientFactory: RouterOsClientFactoryPort,
  ) {}

  public async execute(input: ProvisioningActionInput): Promise<ProvisioningActionResult> {
    if (input.actionType !== this.type) {
      return {
        errorCode: 'ROUTEROS_ACTION_UNKNOWN',
        errorMessage: `Accion no soportada por este adaptador: ${input.actionType}`,
        outcome: 'permanentFailure',
      };
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(input.inputSnapshotJson);
    } catch {
      return {
        errorCode: 'ROUTEROS_INVALID_PAYLOAD',
        errorMessage: 'Payload no es JSON valido.',
        outcome: 'permanentFailure',
      };
    }

    const validation = routerOsSimpleQueueInputSchema.safeParse(parsedPayload);
    if (!validation.success) {
      return {
        errorCode: 'ROUTEROS_VALIDATION_ERROR',
        errorMessage: 'Payload JSON no cumple el esquema requerido.',
        outcome: 'permanentFailure',
      };
    }

    const command = validation.data;

    const profile = await this.connectionResolver.resolve(input.companyId, command.routerId);
    if (!profile) {
      return {
        errorCode: 'ROUTEROS_ROUTER_NOT_FOUND',
        errorMessage: 'Router no encontrado o perfil incompleto.',
        outcome: 'permanentFailure',
      };
    }

    const secret = await this.secretProvider.getSecret(profile.secretReference);
    if (!secret) {
      return {
        errorCode: 'ROUTEROS_SECRET_NOT_FOUND',
        errorMessage: 'Secreto no encontrado.',
        outcome: 'permanentFailure',
      };
    }

    let client: RouterOsClientPort;
    try {
      client = await this.clientFactory.create(profile, secret);
    } catch (e: unknown) {
      return this.mapClientCreationError(e);
    }

    const startTime = Date.now();
    try {
      await this.executeCommand(client, command);
      return {
        metadata: {
          actionType: input.actionType,
          durationMs: Date.now() - startTime,
          queueReference: this.extractReference(command),
          routerId: command.routerId,
        },
        outcome: 'success',
      };
    } catch (e: unknown) {
      return this.mapExecutionError(e);
    } finally {
      await client.close().catch(() => {
        // Ignore close errors
      });
    }
  }

  private extractReference(command: RouterOsSimpleQueueInput): string | undefined {
    if ('queueReference' in command) {
      return command.queueReference;
    }
    if ('queueName' in command) {
      return command.queueName;
    }
    return undefined;
  }

  private async executeCommand(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueInput,
  ): Promise<void> {
    switch (command.actionType) {
      case 'routeros.simple_queue.create':
        await this.handleCreate(client, command);
        break;
      case 'routeros.simple_queue.update':
        await this.handleUpdate(client, command);
        break;
      case 'routeros.simple_queue.enable':
        await this.handleEnable(client, command);
        break;
      case 'routeros.simple_queue.disable':
        await this.handleDisable(client, command);
        break;
      case 'routeros.simple_queue.remove':
        await this.handleRemove(client, command);
        break;
    }
  }

  private async handleCreate(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueCreateInput,
  ): Promise<void> {
    const existing = await client.findSimpleQueue({ name: command.queueName });
    if (existing) {
      if (
        existing.maxLimit === `${command.maxLimitUpload}/${command.maxLimitDownload}` &&
        existing.target === command.target
      ) {
        return; // Idempotent success
      }
      throw new RouterOsSimpleQueueConflictError(
        'Conflicto: ya existe una cola con diferente configuracion.',
      );
    }
    const createData: RouterOsSimpleQueueCreateData = {
      ...(command.comment !== undefined ? { comment: command.comment } : {}),
      ...(command.disabled !== undefined ? { disabled: command.disabled } : {}),
      maxLimit: `${command.maxLimitUpload}/${command.maxLimitDownload}`,
      name: command.queueName,
      target: command.target,
    };
    await client.createSimpleQueue(createData);
  }

  private async handleUpdate(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueUpdateInput,
  ): Promise<void> {
    let maxLimit: string | undefined;
    if (command.maxLimitUpload !== undefined && command.maxLimitDownload !== undefined) {
      maxLimit = `${command.maxLimitUpload}/${command.maxLimitDownload}`;
    }

    const updateData: RouterOsSimpleQueueUpdateData = {
      ...(command.comment !== undefined ? { comment: command.comment } : {}),
      ...(maxLimit !== undefined ? { maxLimit } : {}),
      ...(command.queueName !== undefined ? { name: command.queueName } : {}),
      ...(command.target !== undefined ? { target: command.target } : {}),
    };

    await client.updateSimpleQueue(
      { id: command.queueReference, name: command.queueReference },
      updateData,
    );
  }

  private async handleEnable(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueEnableInput,
  ): Promise<void> {
    await client.enableSimpleQueue({ id: command.queueReference, name: command.queueReference });
  }

  private async handleDisable(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueDisableInput,
  ): Promise<void> {
    await client.disableSimpleQueue({ id: command.queueReference, name: command.queueReference });
  }

  private async handleRemove(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueRemoveInput,
  ): Promise<void> {
    await client.removeSimpleQueue({ id: command.queueReference, name: command.queueReference });
  }

  private mapClientCreationError(error: unknown): ProvisioningActionResult {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('routeros_provisioning_disabled')) {
      return {
        errorCode: 'ROUTEROS_PROVISIONING_DISABLED',
        errorMessage: 'La integracion RouterOS esta deshabilitada.',
        outcome: 'permanentFailure',
      };
    }
    if (
      message.includes('auth') ||
      message.includes('login') ||
      message.includes('permission') ||
      message.includes('invalid user')
    ) {
      return {
        errorCode: 'ROUTEROS_AUTHENTICATION_ERROR',
        errorMessage: 'Error de autenticacion en el router.',
        outcome: 'permanentFailure',
      };
    }
    if (
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('ehostunreach') ||
      message.includes('connection refused')
    ) {
      return {
        errorCode: 'ROUTEROS_CONNECTION_FAILED',
        errorMessage: 'Error temporal de conexion.',
        outcome: 'temporaryFailure',
      };
    }
    return {
      errorCode: 'ROUTEROS_CLIENT_CREATION_FAILED',
      errorMessage: 'Error desconocido al crear la conexion.',
      outcome: 'temporaryFailure',
    };
  }

  private mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsSimpleQueueConflictError) {
      return {
        errorCode: 'ROUTEROS_SIMPLE_QUEUE_CONFLICT',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      message.includes('timeout') ||
      message.includes('disconnected') ||
      message.includes('interrupted')
    ) {
      return {
        errorCode: 'ROUTEROS_EXECUTION_TIMEOUT',
        errorMessage: 'Tiempo de espera agotado al ejecutar comando.',
        outcome: 'temporaryFailure',
      };
    }
    return {
      errorCode: 'ROUTEROS_EXECUTION_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Error desconocido de ejecucion',
      outcome: 'permanentFailure',
    };
  }
}
