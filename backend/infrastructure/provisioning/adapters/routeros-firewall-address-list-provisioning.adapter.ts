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
import { InvalidProvisioningDataError } from '../../../domain/provisioning/errors/invalid-provisioning-data.error.js';
import { RouterOsAddressListAmbiguousError } from '../../../domain/provisioning/routeros/errors/routeros-address-list-ambiguous.error.js';
import { RouterOsAddressListConflictError } from '../../../domain/provisioning/routeros/errors/routeros-address-list-conflict.error.js';
import { RouterOsAddressListDynamicError } from '../../../domain/provisioning/routeros/errors/routeros-address-list-dynamic.error.js';
import { RouterOsAddressListNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-address-list-not-found.error.js';
import { RouterOsInvalidAddressError } from '../../../domain/provisioning/routeros/errors/routeros-invalid-address.error.js';
import { AddressComment } from '../../../domain/provisioning/routeros/value-objects/address-comment.js';
import { AddressListName } from '../../../domain/provisioning/routeros/value-objects/address-list-name.js';
import { DisabledState } from '../../../domain/provisioning/routeros/value-objects/disabled-state.js';
import { IpAddress } from '../../../domain/provisioning/routeros/value-objects/ip-address.js';
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
    const disabled = DisabledState.create(command.disabled ?? false);

    const existing = await this.resolveSingle(client, list.value, address.value);
    if (existing) {
      // Una entrada dinamica ocupa la clave natural pero no es administrable: no puede
      // considerarse idempotencia (desaparecera sola) ni conflicto resoluble.
      this.assertNotDynamic(existing);
      if (this.isEquivalent(existing, { comment, disabled })) {
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

    const existing = await this.resolveSingle(client, list.value, address.value);
    if (!existing) {
      throw new RouterOsAddressListNotFoundError(
        `Entrada no encontrada en la lista ${list.value}: ${address.value}`,
      );
    }

    this.assertNotDynamic(existing);

    const comment = command.comment === undefined ? undefined : AddressComment.create(command.comment);

    const updateData: MutableAddressListEntryUpdateData = {};
    if (comment !== undefined && comment.value !== (existing.comment ?? '')) updateData.comment = comment.value;
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
    this.assertNotDynamic(existing);
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
    this.assertNotDynamic(existing);
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
    const existing = await this.resolveSingle(client, command.list, command.address);
    if (!existing) {
      return command.address; // Idempotent success: already gone
    }
    this.assertNotDynamic(existing);
    await client.removeAddressListEntry({ id: existing.id });
    return command.address;
  }

  /**
   * Resuelve la clave natural `list`+`address` exigiendo como maximo una coincidencia.
   *
   * RouterOS 7.21.4 rechaza `/add` duplicados, asi que este no es un estado que CuzoNet
   * pueda producir; llega por configuracion importada o creada con una version anterior, y
   * el router de laboratorio tiene un caso real. Quedarse con la primera coincidencia
   * significaria, por ejemplo, eliminar una entrada, informar exito y dejar la otra activa
   * en el firewall: para una lista de morosos, exactamente lo contrario de lo pedido.
   */
  private async resolveSingle(
    client: RouterOsClientPort,
    list: string,
    address: string,
  ): Promise<RouterOsAddressListEntry | null> {
    const matches = await client.findAddressListEntries({ address, list });
    if (matches.length > 1) {
      throw new RouterOsAddressListAmbiguousError(
        `La clave ${list}:${address} resuelve a ${matches.length} entradas en el router ` +
          `(${matches.map((entry) => entry.id).join(', ')}). No se opera sobre una eleccion ` +
          'arbitraria: resuelva el duplicado en el router antes de reintentar.',
      );
    }
    return matches[0] ?? null;
  }

  /**
   * RouterOS gobierna las entradas `dynamic=true`: las genera una regla
   * `add-src-to-address-list`, la resolucion de un nombre de dominio o un `timeout`. No se
   * guardan en la configuracion y desapareceran solas.
   *
   * El router acepta `/set` y `/remove` sobre ellas y solo rechaza `/disable`. CuzoNet las
   * rechaza todas, a proposito: una entrada efimera no pertenece al estado deseado, y un
   * `remove` "exitoso" sobre algo que iba a evaporarse enmascara un error de modelado
   * aguas arriba en lugar de senalarlo. La comprobacion ocurre antes de cualquier comando.
   */
  private assertNotDynamic(entry: RouterOsAddressListEntry): void {
    if (!entry.dynamic) {
      return;
    }
    throw new RouterOsAddressListDynamicError(
      `La entrada ${entry.list}:${entry.address} es dinamica y la administra RouterOS, ` +
        'no CuzoNet. Las entradas dinamicas no se pueden crear, modificar, habilitar, ' +
        'deshabilitar ni eliminar desde el aprovisionamiento.',
    );
  }

  private async findOrThrow(
    client: RouterOsClientPort,
    list: string,
    address: string,
  ): Promise<RouterOsAddressListEntry> {
    const existing = await this.resolveSingle(client, list, address);
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
    },
  ): boolean {
    return (
      existing.disabled === expected.disabled.value &&
      (existing.comment ?? '') === (expected.comment?.value ?? '')
    );
  }

  protected override additionalLogFields(command: RouterOsAddressListInput): Record<string, unknown> {
    return { address: command.address, addressList: command.list };
  }

  /**
   * Traps reales de RouterOS 7.21.4 observados en el laboratorio para este recurso. El
   * heuristico anterior (`message.includes('address')` mas `'invalid'`/`'no such'`) no
   * acertaba ninguno de los tres: los mensajes del router no contienen la palabra
   * "address", asi que todos terminaban en ROUTEROS_EXECUTION_FAILED.
   */
  private static readonly ROUTER_TRAPS: ReadonlyArray<{
    readonly errorCode: string;
    readonly trap: string;
  }> = [
    // `/add` sobre una combinacion list+address que ya existe.
    { errorCode: 'ROUTEROS_ADDRESS_LIST_CONFLICT', trap: 'already have such entry' },
    // Todo lo que no es IPv4 se interpreta como nombre de dominio, IPv6 incluida.
    { errorCode: 'ROUTEROS_INVALID_ADDRESS', trap: 'is not a valid dns name' },
    // `/disable` sobre una entrada que RouterOS gobierna.
    { errorCode: 'ROUTEROS_ADDRESS_LIST_DYNAMIC', trap: 'cannot have disabled dynamic entry' },
  ];

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
    if (error instanceof RouterOsAddressListAmbiguousError) {
      return {
        errorCode: 'ROUTEROS_ADDRESS_LIST_AMBIGUOUS',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsAddressListDynamicError) {
      return {
        errorCode: 'ROUTEROS_ADDRESS_LIST_DYNAMIC',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsInvalidAddressError) {
      return {
        errorCode: 'ROUTEROS_INVALID_ADDRESS',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    // Los value objects validan dentro de executeOperation; su fallo es de datos de
    // entrada, no de ejecucion, y debe reportarse como tal.
    if (error instanceof InvalidProvisioningDataError) {
      return {
        errorCode: 'ROUTEROS_VALIDATION_ERROR',
        errorMessage: error.details?.[0]?.message ?? error.message,
        outcome: 'permanentFailure',
      };
    }

    const message = error instanceof Error ? error.message.toLowerCase() : '';
    const matched = RouterOsFirewallAddressListProvisioningAdapter.ROUTER_TRAPS.find((entry) =>
      message.includes(entry.trap),
    );
    if (matched) {
      return {
        errorCode: matched.errorCode,
        errorMessage: error instanceof Error ? error.message : matched.errorCode,
        outcome: 'permanentFailure',
      };
    }
    return this.mapGenericExecutionError(error);
  }
}
