import type { ProvisioningActionResult } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsAddressListEntry,
  RouterOsAddressListEntryCreateData,
  RouterOsAddressListEntryUpdateData,
  RouterOsClientFactoryPort,
  RouterOsClientPort,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsAddressListConflictError } from '../../../domain/provisioning/routeros/errors/routeros-address-list-conflict.error.js';
import { RouterOsAddressListNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-address-list-not-found.error.js';
import { RouterOsInvalidAddressError } from '../../../domain/provisioning/routeros/errors/routeros-invalid-address.error.js';
import { AddressComment } from '../../../domain/provisioning/routeros/value-objects/address-comment.js';
import { AddressListName } from '../../../domain/provisioning/routeros/value-objects/address-list-name.js';
import { DisabledState } from '../../../domain/provisioning/routeros/value-objects/disabled-state.js';
import { IpAddress } from '../../../domain/provisioning/routeros/value-objects/ip-address.js';
import { Timeout } from '../../../domain/provisioning/routeros/value-objects/timeout.js';
import {
  routerOsAddressListInputSchema,
  type RouterOsAddressListAddInput,
  type RouterOsAddressListDisableInput,
  type RouterOsAddressListEnableInput,
  type RouterOsAddressListInput,
  type RouterOsAddressListRemoveInput,
  type RouterOsAddressListUpdateInput,
} from '../routeros/routeros-address-list.input.js';
import { RouterOsProvisioningAdapterBase } from './routeros-provisioning-adapter.base.js';

type MutableAddressListEntryUpdateData = {
  -readonly [K in keyof RouterOsAddressListEntryUpdateData]: RouterOsAddressListEntryUpdateData[K];
};

export class RouterOsFirewallAddressListProvisioningAdapter extends RouterOsProvisioningAdapterBase<RouterOsAddressListInput> {
  protected readonly referenceMetadataKey = 'address';

  public constructor(
    type: string,
    connectionResolver: RouterConnectionResolverPort,
    secretProvider: SecretProviderPort,
    clientFactory: RouterOsClientFactoryPort,
  ) {
    super(type, routerOsAddressListInputSchema, connectionResolver, secretProvider, clientFactory);
  }

  protected executeOperation(
    client: RouterOsClientPort,
    command: RouterOsAddressListInput,
  ): Promise<string | undefined> {
    switch (command.actionType) {
      case 'routeros.firewall.address-list.add':
        return this.handleAdd(client, command);
      case 'routeros.firewall.address-list.update':
        return this.handleUpdate(client, command);
      case 'routeros.firewall.address-list.enable':
        return this.handleEnable(client, command);
      case 'routeros.firewall.address-list.disable':
        return this.handleDisable(client, command);
      case 'routeros.firewall.address-list.remove':
        return this.handleRemove(client, command);
    }
  }

  private async handleAdd(
    client: RouterOsClientPort,
    command: RouterOsAddressListAddInput,
  ): Promise<string> {
    const list = AddressListName.create(command.list);
    const address = IpAddress.create(command.address);
    const comment = command.comment === undefined ? undefined : AddressComment.create(command.comment);
    const timeout = command.timeout === undefined ? undefined : Timeout.create(command.timeout);
    const disabled = DisabledState.create(command.disabled ?? false);

    const existing = await client.findAddressListEntry({ address: address.value, list: list.value });
    if (existing) {
      if (this.isEquivalent(existing, { comment, disabled, timeout })) {
        return address.value; // Idempotent success
      }
      throw new RouterOsAddressListConflictError(
        'Conflicto: ya existe una entrada en la lista con diferente configuracion.',
      );
    }

    const createData: RouterOsAddressListEntryCreateData = {
      address: address.value,
      ...(comment !== undefined ? { comment: comment.value } : {}),
      disabled: disabled.value,
      list: list.value,
      ...(timeout !== undefined ? { timeout: timeout.value } : {}),
    };
    await client.createAddressListEntry(createData);
    return address.value;
  }

  private async handleUpdate(
    client: RouterOsClientPort,
    command: RouterOsAddressListUpdateInput,
  ): Promise<string> {
    const list = AddressListName.create(command.list);
    const address = IpAddress.create(command.address);

    const existing = await client.findAddressListEntry({ address: address.value, list: list.value });
    if (!existing) {
      throw new RouterOsAddressListNotFoundError(
        `Entrada no encontrada en la lista ${list.value}: ${address.value}`,
      );
    }

    const comment = command.comment === undefined ? undefined : AddressComment.create(command.comment);
    const timeout = command.timeout === undefined ? undefined : Timeout.create(command.timeout);

    const updateData: MutableAddressListEntryUpdateData = {};
    if (comment !== undefined && comment.value !== (existing.comment ?? '')) updateData.comment = comment.value;
    if (timeout !== undefined && timeout.value !== (existing.timeout ?? '')) updateData.timeout = timeout.value;
    if (command.disabled !== undefined && command.disabled !== existing.disabled) {
      updateData.disabled = command.disabled;
    }

    if (Object.keys(updateData).length === 0) {
      return address.value; // Idempotent success: nothing changed
    }

    await client.updateAddressListEntry({ id: existing.id }, updateData);
    return address.value;
  }

  private async handleEnable(
    client: RouterOsClientPort,
    command: RouterOsAddressListEnableInput,
  ): Promise<string> {
    const existing = await this.findOrThrow(client, command.list, command.address);
    if (!existing.disabled) {
      return command.address; // Idempotent success: already enabled
    }
    await client.enableAddressListEntry({ id: existing.id });
    return command.address;
  }

  private async handleDisable(
    client: RouterOsClientPort,
    command: RouterOsAddressListDisableInput,
  ): Promise<string> {
    const existing = await this.findOrThrow(client, command.list, command.address);
    if (existing.disabled) {
      return command.address; // Idempotent success: already disabled
    }
    await client.disableAddressListEntry({ id: existing.id });
    return command.address;
  }

  private async handleRemove(
    client: RouterOsClientPort,
    command: RouterOsAddressListRemoveInput,
  ): Promise<string> {
    const existing = await client.findAddressListEntry({ address: command.address, list: command.list });
    if (!existing) {
      return command.address; // Idempotent success: already gone
    }
    await client.removeAddressListEntry({ id: existing.id });
    return command.address;
  }

  private async findOrThrow(
    client: RouterOsClientPort,
    list: string,
    address: string,
  ): Promise<RouterOsAddressListEntry> {
    const existing = await client.findAddressListEntry({ address, list });
    if (!existing) {
      throw new RouterOsAddressListNotFoundError(`Entrada no encontrada en la lista ${list}: ${address}`);
    }
    return existing;
  }

  private isEquivalent(
    existing: RouterOsAddressListEntry,
    expected: {
      comment: AddressComment | undefined;
      disabled: DisabledState;
      timeout: Timeout | undefined;
    },
  ): boolean {
    return (
      existing.disabled === expected.disabled.value &&
      (existing.comment ?? '') === (expected.comment?.value ?? '') &&
      (existing.timeout ?? '') === (expected.timeout?.value ?? '')
    );
  }

  protected override additionalLogFields(command: RouterOsAddressListInput): Record<string, unknown> {
    return { address: command.address, addressList: command.list };
  }

  protected override mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsAddressListConflictError) {
      return {
        errorCode: 'ROUTEROS_ADDRESS_LIST_CONFLICT',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsAddressListNotFoundError) {
      return {
        errorCode: 'ROUTEROS_ADDRESS_LIST_NOT_FOUND',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('address') && (message.includes('invalid') || message.includes('no such'))) {
      const invalid = new RouterOsInvalidAddressError(
        error instanceof Error ? error.message : 'Direccion invalida.',
      );
      return {
        errorCode: 'ROUTEROS_INVALID_ADDRESS',
        errorMessage: invalid.message,
        outcome: 'permanentFailure',
      };
    }
    return this.mapGenericExecutionError(error);
  }
}
