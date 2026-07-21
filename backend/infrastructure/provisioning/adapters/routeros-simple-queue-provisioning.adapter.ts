import type { ProvisioningActionResult } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  RouterOsSimpleQueueCreateData,
  RouterOsSimpleQueueUpdateData,
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
} from '../routeros/routeros-simple-queue.input.js';
import { RouterOsProvisioningAdapterBase } from './routeros-provisioning-adapter.base.js';

export class RouterOsSimpleQueueProvisioningAdapter extends RouterOsProvisioningAdapterBase<RouterOsSimpleQueueInput> {
  protected readonly referenceMetadataKey = 'queueReference';

  public constructor(
    type: string,
    connectionResolver: RouterConnectionResolverPort,
    secretProvider: SecretProviderPort,
    clientFactory: RouterOsClientFactoryPort,
  ) {
    super(type, routerOsSimpleQueueInputSchema, connectionResolver, secretProvider, clientFactory);
  }

  protected executeOperation(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueInput,
  ): Promise<string | undefined> {
    switch (command.actionType) {
      case 'routeros.simple_queue.create':
        return this.handleCreate(client, command);
      case 'routeros.simple_queue.update':
        return this.handleUpdate(client, command);
      case 'routeros.simple_queue.enable':
        return this.handleEnable(client, command);
      case 'routeros.simple_queue.disable':
        return this.handleDisable(client, command);
      case 'routeros.simple_queue.remove':
        return this.handleRemove(client, command);
    }
  }

  private async handleCreate(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueCreateInput,
  ): Promise<string> {
    const existing = await client.findSimpleQueue({ name: command.queueName });
    if (existing) {
      if (
        existing.maxLimit === `${command.maxLimitUpload}/${command.maxLimitDownload}` &&
        existing.target === command.target
      ) {
        return command.queueName; // Idempotent success
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
    return command.queueName;
  }

  private async handleUpdate(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueUpdateInput,
  ): Promise<string> {
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
    return command.queueReference;
  }

  private async handleEnable(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueEnableInput,
  ): Promise<string> {
    await client.enableSimpleQueue({ id: command.queueReference, name: command.queueReference });
    return command.queueReference;
  }

  private async handleDisable(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueDisableInput,
  ): Promise<string> {
    await client.disableSimpleQueue({ id: command.queueReference, name: command.queueReference });
    return command.queueReference;
  }

  private async handleRemove(
    client: RouterOsClientPort,
    command: RouterOsSimpleQueueRemoveInput,
  ): Promise<string> {
    await client.removeSimpleQueue({ id: command.queueReference, name: command.queueReference });
    return command.queueReference;
  }

  protected override mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsSimpleQueueConflictError) {
      return {
        errorCode: 'ROUTEROS_SIMPLE_QUEUE_CONFLICT',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    return this.mapGenericExecutionError(error);
  }
}
