import type { ProvisioningActionResult } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import {
  ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS,
  type RouterOsClientFactoryPort,
  type RouterOsClientPort,
  type RouterOsHotspotUserProfile,
  type RouterOsHotspotUserProfileCreateData,
  type RouterOsHotspotUserProfileUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsHotspotUserProfileConflictError } from '../../../domain/provisioning/routeros/errors/routeros-hotspot-user-profile-conflict.error.js';
import { RouterOsHotspotUserProfileNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-hotspot-user-profile-not-found.error.js';
import { RouterOsHotspotUserProfileProtectedError } from '../../../domain/provisioning/routeros/errors/routeros-hotspot-user-profile-protected.error.js';
import { HotspotAddressListName } from '../../../domain/provisioning/routeros/value-objects/hotspot-address-list-name.js';
import { HotspotAddressPoolName } from '../../../domain/provisioning/routeros/value-objects/hotspot-address-pool-name.js';
import { HotspotProfileDuration } from '../../../domain/provisioning/routeros/value-objects/hotspot-profile-duration.js';
import { HotspotProfileName } from '../../../domain/provisioning/routeros/value-objects/hotspot-profile-name.js';
import { HotspotRateLimit } from '../../../domain/provisioning/routeros/value-objects/hotspot-rate-limit.js';
import { HotspotSharedUsers } from '../../../domain/provisioning/routeros/value-objects/hotspot-shared-users.js';
import {
  routerOsHotspotUserProfileInputSchema,
  type RouterOsHotspotUserProfileCreateInput,
  type RouterOsHotspotUserProfileInput,
  type RouterOsHotspotUserProfileRemoveInput,
  type RouterOsHotspotUserProfileUpdateInput,
} from '../routeros/routeros-hotspot-user-profile.input.js';
import { RouterOsProvisioningAdapterBase } from './routeros-provisioning-adapter.base.js';

type MutableUpdateData = {
  -readonly [K in keyof RouterOsHotspotUserProfileUpdateData]: RouterOsHotspotUserProfileUpdateData[K];
};

/** Campos que RouterOS deja ausentes si no se configuran (no tienen valor por defecto). */
type OptionalNoDefault = 'addressPool' | 'rateLimit' | 'sessionTimeout';

/**
 * Estado que RouterOS tendría tras aplicar este comando de creación.
 *
 * Los campos omitidos NO quedan ausentes: RouterOS les asigna sus defaults (verificados
 * empíricamente en un hEX creando un perfil con solo `name`). Comparar los omitidos contra
 * `undefined` marcaría como distinto un perfil que en realidad es idéntico al solicitado,
 * produciendo conflictos falsos en cada reintento.
 */
function expectedStateFromCreate(command: RouterOsHotspotUserProfileCreateInput): {
  addMacCookie: boolean;
  addressList: string;
  addressPool: string | undefined;
  idleTimeout: string;
  keepaliveTimeout: string;
  macCookieTimeout: string;
  rateLimit: string | undefined;
  sessionTimeout: string | undefined;
  sharedUsers: string;
  statusAutorefresh: string;
  transparentProxy: boolean;
} {
  const defaults = ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS;
  // Fijar el timeout de la cookie la activa: el schema ya rechazó la combinación
  // contradictoria, así que aquí solo se refleja el efecto real del router.
  const addMacCookie =
    command.macCookieTimeout !== undefined ? true : (command.addMacCookie ?? defaults.addMacCookie);
  // "none" equivale a no tener pool: RouterOS no devuelve el campo.
  const pool = command.addressPool === undefined || command.addressPool.toLowerCase() === 'none'
    ? undefined
    : command.addressPool;

  return {
    addMacCookie,
    addressList: command.addressList ?? defaults.addressList,
    addressPool: pool,
    idleTimeout: command.idleTimeout ?? defaults.idleTimeout,
    keepaliveTimeout: command.keepaliveTimeout ?? defaults.keepaliveTimeout,
    macCookieTimeout: command.macCookieTimeout ?? defaults.macCookieTimeout,
    rateLimit: command.rateLimit,
    sessionTimeout: command.sessionTimeout,
    sharedUsers: command.sharedUsers ?? defaults.sharedUsers,
    statusAutorefresh: command.statusAutorefresh ?? defaults.statusAutorefresh,
    transparentProxy: command.transparentProxy ?? defaults.transparentProxy,
  };
}

/** Normaliza los campos sin default: RouterOS los omite, el comando puede traerlos vacíos. */
function sameOptional(existing: string | undefined, expected: string | undefined): boolean {
  return (existing ?? '') === (expected ?? '');
}

export class RouterOsHotspotUserProfileProvisioningAdapter extends RouterOsProvisioningAdapterBase<RouterOsHotspotUserProfileInput> {
  protected readonly referenceMetadataKey = 'profileReference';

  public constructor(
    type: string,
    connectionResolver: RouterConnectionResolverPort,
    secretProvider: SecretProviderPort,
    clientFactory: RouterOsClientFactoryPort,
  ) {
    super(type, routerOsHotspotUserProfileInputSchema, connectionResolver, secretProvider, clientFactory);
  }

  protected executeOperation(
    client: RouterOsClientPort,
    command: RouterOsHotspotUserProfileInput,
  ): Promise<string | undefined> {
    switch (command.actionType) {
      case 'routeros.hotspot.user_profile.create':
        return this.handleCreate(client, command);
      case 'routeros.hotspot.user_profile.update':
        return this.handleUpdate(client, command);
      case 'routeros.hotspot.user_profile.remove':
        return this.handleRemove(client, command);
    }
  }

  private async handleCreate(
    client: RouterOsClientPort,
    command: RouterOsHotspotUserProfileCreateInput,
  ): Promise<string> {
    const name = HotspotProfileName.create(command.name);
    // Los value objects validan invariantes de dominio que el schema no expresa
    // (p.ej. que cada lado del rate-limit sea una tasa válida por separado).
    this.validateFields(command);

    const existing = await client.findHotspotUserProfile({ name: name.value });
    if (existing) {
      if (this.isEquivalent(existing, expectedStateFromCreate(command))) {
        return name.value; // Idempotent success
      }
      throw new RouterOsHotspotUserProfileConflictError(
        'Conflicto: ya existe un perfil de Hotspot con diferente configuracion.',
      );
    }

    const createData: RouterOsHotspotUserProfileCreateData = {
      ...(command.addMacCookie !== undefined ? { addMacCookie: command.addMacCookie } : {}),
      ...(command.addressList !== undefined ? { addressList: command.addressList } : {}),
      ...(command.addressPool !== undefined ? { addressPool: command.addressPool } : {}),
      ...(command.idleTimeout !== undefined ? { idleTimeout: command.idleTimeout } : {}),
      ...(command.keepaliveTimeout !== undefined ? { keepaliveTimeout: command.keepaliveTimeout } : {}),
      ...(command.macCookieTimeout !== undefined ? { macCookieTimeout: command.macCookieTimeout } : {}),
      name: name.value,
      ...(command.rateLimit !== undefined ? { rateLimit: command.rateLimit } : {}),
      ...(command.sessionTimeout !== undefined ? { sessionTimeout: command.sessionTimeout } : {}),
      ...(command.sharedUsers !== undefined ? { sharedUsers: command.sharedUsers } : {}),
      ...(command.statusAutorefresh !== undefined ? { statusAutorefresh: command.statusAutorefresh } : {}),
      ...(command.transparentProxy !== undefined ? { transparentProxy: command.transparentProxy } : {}),
    };
    await client.createHotspotUserProfile(createData);
    return name.value;
  }

  private async handleUpdate(
    client: RouterOsClientPort,
    command: RouterOsHotspotUserProfileUpdateInput,
  ): Promise<string> {
    this.validateFields(command);
    if (command.name !== undefined) {
      HotspotProfileName.create(command.name);
    }

    const existing = await client.findHotspotUserProfile({ name: command.profileReference });
    if (!existing) {
      throw new RouterOsHotspotUserProfileNotFoundError(
        `No existe un perfil de Hotspot con referencia: ${command.profileReference}`,
      );
    }

    const updateData: MutableUpdateData = {};
    if (command.name !== undefined && command.name !== existing.name) updateData.name = command.name;
    if (command.addressList !== undefined && command.addressList !== (existing.addressList ?? '')) {
      updateData.addressList = command.addressList;
    }
    if (command.addressPool !== undefined && !sameOptional(existing.addressPool, this.normalizedPool(command.addressPool))) {
      updateData.addressPool = command.addressPool;
    }
    if (command.idleTimeout !== undefined && command.idleTimeout !== existing.idleTimeout) {
      updateData.idleTimeout = command.idleTimeout;
    }
    if (command.keepaliveTimeout !== undefined && command.keepaliveTimeout !== existing.keepaliveTimeout) {
      updateData.keepaliveTimeout = command.keepaliveTimeout;
    }
    if (command.macCookieTimeout !== undefined && command.macCookieTimeout !== existing.macCookieTimeout) {
      updateData.macCookieTimeout = command.macCookieTimeout;
    }
    if (command.rateLimit !== undefined && !sameOptional(existing.rateLimit, command.rateLimit)) {
      updateData.rateLimit = command.rateLimit;
    }
    if (command.sessionTimeout !== undefined && !sameOptional(existing.sessionTimeout, command.sessionTimeout)) {
      updateData.sessionTimeout = command.sessionTimeout;
    }
    if (command.sharedUsers !== undefined && command.sharedUsers !== existing.sharedUsers) {
      updateData.sharedUsers = command.sharedUsers;
    }
    if (command.statusAutorefresh !== undefined && command.statusAutorefresh !== existing.statusAutorefresh) {
      updateData.statusAutorefresh = command.statusAutorefresh;
    }
    if (command.addMacCookie !== undefined && command.addMacCookie !== existing.addMacCookie) {
      updateData.addMacCookie = command.addMacCookie;
    }
    if (command.transparentProxy !== undefined && command.transparentProxy !== existing.transparentProxy) {
      updateData.transparentProxy = command.transparentProxy;
    }

    if (Object.keys(updateData).length === 0) {
      return command.profileReference; // Idempotent success: nada que aplicar, no se envia /set
    }

    await client.updateHotspotUserProfile({ name: command.profileReference }, updateData);
    return command.profileReference;
  }

  private async handleRemove(
    client: RouterOsClientPort,
    command: RouterOsHotspotUserProfileRemoveInput,
  ): Promise<string> {
    const existing = await client.findHotspotUserProfile({ name: command.profileReference });
    if (!existing) {
      return command.profileReference; // Idempotent success: ya no existe
    }
    if (existing.isDefault) {
      // Se rechaza en el dominio, antes de emitir cualquier comando al router: el perfil
      // default es la configuracion base del hotspot y suele contener scripts de negocio.
      throw new RouterOsHotspotUserProfileProtectedError(
        `El perfil "${existing.name}" es el perfil por defecto de RouterOS y no puede eliminarse.`,
      );
    }
    await client.removeHotspotUserProfile({ name: command.profileReference });
    return command.profileReference;
  }

  private normalizedPool(pool: string): string | undefined {
    return pool.toLowerCase() === 'none' ? undefined : pool;
  }

  /** Aplica los value objects de dominio a los campos presentes, para invariantes que el schema no cubre. */
  private validateFields(
    command: RouterOsHotspotUserProfileCreateInput | RouterOsHotspotUserProfileUpdateInput,
  ): void {
    if (command.addressPool !== undefined) HotspotAddressPoolName.create(command.addressPool);
    if (command.addressList !== undefined) HotspotAddressListName.create(command.addressList);
    if (command.rateLimit !== undefined) HotspotRateLimit.create(command.rateLimit);
    if (command.sharedUsers !== undefined) {
      const raw = command.sharedUsers;
      HotspotSharedUsers.create(/^\d+$/.test(raw) ? Number(raw) : raw);
    }
    if (command.sessionTimeout !== undefined) HotspotProfileDuration.create(command.sessionTimeout, 'sessionTimeout');
    if (command.idleTimeout !== undefined) HotspotProfileDuration.create(command.idleTimeout, 'idleTimeout');
    if (command.keepaliveTimeout !== undefined) {
      HotspotProfileDuration.create(command.keepaliveTimeout, 'keepaliveTimeout');
    }
    if (command.statusAutorefresh !== undefined) {
      HotspotProfileDuration.create(command.statusAutorefresh, 'statusAutorefresh');
    }
    if (command.macCookieTimeout !== undefined) {
      HotspotProfileDuration.create(command.macCookieTimeout, 'macCookieTimeout');
    }
  }

  private isEquivalent(
    existing: RouterOsHotspotUserProfile,
    expected: ReturnType<typeof expectedStateFromCreate>,
  ): boolean {
    const optionalFields: readonly OptionalNoDefault[] = ['addressPool', 'rateLimit', 'sessionTimeout'];
    for (const field of optionalFields) {
      if (!sameOptional(existing[field], expected[field])) {
        return false;
      }
    }
    return (
      (existing.addMacCookie ?? ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.addMacCookie) === expected.addMacCookie &&
      (existing.addressList ?? '') === expected.addressList &&
      existing.idleTimeout === expected.idleTimeout &&
      existing.keepaliveTimeout === expected.keepaliveTimeout &&
      existing.macCookieTimeout === expected.macCookieTimeout &&
      existing.sharedUsers === expected.sharedUsers &&
      existing.statusAutorefresh === expected.statusAutorefresh &&
      (existing.transparentProxy ?? ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS.transparentProxy) ===
        expected.transparentProxy
    );
  }

  protected override mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsHotspotUserProfileConflictError) {
      return {
        errorCode: 'ROUTEROS_HOTSPOT_USER_PROFILE_CONFLICT',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsHotspotUserProfileNotFoundError) {
      return {
        errorCode: 'ROUTEROS_HOTSPOT_USER_PROFILE_NOT_FOUND',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsHotspotUserProfileProtectedError) {
      return {
        errorCode: 'ROUTEROS_HOTSPOT_USER_PROFILE_PROTECTED',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    return this.mapGenericExecutionError(error);
  }
}
