import type { ProvisioningActionResult } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  RouterOsPppoeSecretCreateData,
  RouterOsPppoeSecretUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsPppoeConflictError } from '../../../domain/provisioning/routeros/errors/routeros-pppoe-conflict.error.js';
import {
  routerOsPppoeInputSchema,
  type RouterOsPppoeCreateInput,
  type RouterOsPppoeDisableInput,
  type RouterOsPppoeEnableInput,
  type RouterOsPppoeInput,
  type RouterOsPppoeRemoveInput,
  type RouterOsPppoeUpdateInput,
} from '../routeros/routeros-pppoe.input.js';
import { RouterOsProvisioningAdapterBase } from './routeros-provisioning-adapter.base.js';

export class RouterOsPppoeProvisioningAdapter extends RouterOsProvisioningAdapterBase<RouterOsPppoeInput> {
  protected readonly referenceMetadataKey = 'pppoeReference';

  public constructor(
    type: string,
    connectionResolver: RouterConnectionResolverPort,
    secretProvider: SecretProviderPort,
    clientFactory: RouterOsClientFactoryPort,
  ) {
    super(type, routerOsPppoeInputSchema, connectionResolver, secretProvider, clientFactory);
  }

  protected executeOperation(
    client: RouterOsClientPort,
    command: RouterOsPppoeInput,
  ): Promise<string | undefined> {
    switch (command.actionType) {
      case 'routeros.pppoe.create':
        return this.handleCreate(client, command);
      case 'routeros.pppoe.update':
        return this.handleUpdate(client, command);
      case 'routeros.pppoe.enable':
        return this.handleEnable(client, command);
      case 'routeros.pppoe.disable':
        return this.handleDisable(client, command);
      case 'routeros.pppoe.remove':
        return this.handleRemove(client, command);
    }
  }

  private async handleCreate(
    client: RouterOsClientPort,
    command: RouterOsPppoeCreateInput,
  ): Promise<string> {
    const password = await this.resolveCredential(command.credentialReference);

    const existing = await client.findPppoeSecret({ name: command.name });
    if (existing) {
      if (
        existing.password === password &&
        existing.profile === command.profile &&
        existing.service === (command.service ?? 'pppoe')
      ) {
        return command.name; // Idempotent success
      }
      throw new RouterOsPppoeConflictError(
        'Conflicto: ya existe un secreto PPPoE con diferente configuracion.',
      );
    }
    const createData: RouterOsPppoeSecretCreateData = {
      ...(command.comment !== undefined ? { comment: command.comment } : {}),
      ...(command.disabled !== undefined ? { disabled: command.disabled } : {}),
      ...(command.service !== undefined ? { service: command.service } : {}),
      name: command.name,
      password,
      profile: command.profile,
    };
    await client.createPppoeSecret(createData);
    return command.name;
  }

  private async handleUpdate(
    client: RouterOsClientPort,
    command: RouterOsPppoeUpdateInput,
  ): Promise<string> {
    const password =
      command.credentialReference === undefined ? undefined : await this.resolveCredential(command.credentialReference);

    const updateData: RouterOsPppoeSecretUpdateData = {
      ...(command.comment !== undefined ? { comment: command.comment } : {}),
      ...(command.disabled !== undefined ? { disabled: command.disabled } : {}),
      ...(command.name !== undefined ? { name: command.name } : {}),
      ...(password !== undefined ? { password } : {}),
      ...(command.profile !== undefined ? { profile: command.profile } : {}),
    };

    await client.updatePppoeSecret(
      { id: command.pppoeReference, name: command.pppoeReference },
      updateData,
    );
    return command.pppoeReference;
  }

  private async handleEnable(
    client: RouterOsClientPort,
    command: RouterOsPppoeEnableInput,
  ): Promise<string> {
    await client.enablePppoeSecret({ id: command.pppoeReference, name: command.pppoeReference });
    return command.pppoeReference;
  }

  private async handleDisable(
    client: RouterOsClientPort,
    command: RouterOsPppoeDisableInput,
  ): Promise<string> {
    await client.disablePppoeSecret({ id: command.pppoeReference, name: command.pppoeReference });
    return command.pppoeReference;
  }

  private async handleRemove(
    client: RouterOsClientPort,
    command: RouterOsPppoeRemoveInput,
  ): Promise<string> {
    await client.removePppoeSecret({ id: command.pppoeReference, name: command.pppoeReference });
    return command.pppoeReference;
  }

  protected override mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsPppoeConflictError) {
      return {
        errorCode: 'ROUTEROS_PPPOE_CONFLICT',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    return this.mapGenericExecutionError(error);
  }
}
