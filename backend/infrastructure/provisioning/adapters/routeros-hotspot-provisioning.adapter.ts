import type { ProvisioningActionResult } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  RouterOsHotspotUser,
  RouterOsHotspotUserCreateData,
  RouterOsHotspotUserUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { RouterOsHotspotConflictError } from '../../../domain/provisioning/routeros/errors/routeros-hotspot-conflict.error.js';
import { RouterOsHotspotProfileNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-hotspot-profile-not-found.error.js';
import { RouterOsHotspotServerNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-hotspot-server-not-found.error.js';
import { RouterOsHotspotUserNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-hotspot-user-not-found.error.js';
import { HotspotComment } from '../../../domain/provisioning/routeros/value-objects/hotspot-comment.js';
import { HotspotLimitBytes } from '../../../domain/provisioning/routeros/value-objects/hotspot-limit-bytes.js';
import { HotspotLimitUptime } from '../../../domain/provisioning/routeros/value-objects/hotspot-limit-uptime.js';
import { HotspotPassword } from '../../../domain/provisioning/routeros/value-objects/hotspot-password.js';
import { HotspotProfileName } from '../../../domain/provisioning/routeros/value-objects/hotspot-profile-name.js';
import { HotspotServerName } from '../../../domain/provisioning/routeros/value-objects/hotspot-server-name.js';
import { HotspotSharedUsers } from '../../../domain/provisioning/routeros/value-objects/hotspot-shared-users.js';
import { HotspotUsername } from '../../../domain/provisioning/routeros/value-objects/hotspot-username.js';
import {
  routerOsHotspotUserInputSchema,
  type RouterOsHotspotUserCreateInput,
  type RouterOsHotspotUserDisableInput,
  type RouterOsHotspotUserEnableInput,
  type RouterOsHotspotUserInput,
  type RouterOsHotspotUserRemoveInput,
  type RouterOsHotspotUserUpdateInput,
} from '../routeros/routeros-hotspot-user.input.js';
import { RouterOsProvisioningAdapterBase } from './routeros-provisioning-adapter.base.js';

type MutableHotspotUserUpdateData = {
  -readonly [K in keyof RouterOsHotspotUserUpdateData]: RouterOsHotspotUserUpdateData[K];
};

export class RouterOsHotspotProvisioningAdapter extends RouterOsProvisioningAdapterBase<RouterOsHotspotUserInput> {
  protected readonly referenceMetadataKey = 'userReference';

  public constructor(
    type: string,
    connectionResolver: RouterConnectionResolverPort,
    secretProvider: SecretProviderPort,
    clientFactory: RouterOsClientFactoryPort,
  ) {
    super(type, routerOsHotspotUserInputSchema, connectionResolver, secretProvider, clientFactory);
  }

  protected executeOperation(
    client: RouterOsClientPort,
    command: RouterOsHotspotUserInput,
  ): Promise<string | undefined> {
    switch (command.actionType) {
      case 'routeros.hotspot.user.create':
        return this.handleCreate(client, command);
      case 'routeros.hotspot.user.update':
        return this.handleUpdate(client, command);
      case 'routeros.hotspot.user.enable':
        return this.handleEnable(client, command);
      case 'routeros.hotspot.user.disable':
        return this.handleDisable(client, command);
      case 'routeros.hotspot.user.remove':
        return this.handleRemove(client, command);
    }
  }

  private async handleCreate(
    client: RouterOsClientPort,
    command: RouterOsHotspotUserCreateInput,
  ): Promise<string> {
    const name = HotspotUsername.create(command.name);
    const password = HotspotPassword.create(await this.resolveCredential(command.credentialReference));
    const profile = HotspotProfileName.create(command.profile);
    const server = command.server === undefined ? undefined : HotspotServerName.create(command.server);
    const comment = command.comment === undefined ? undefined : HotspotComment.create(command.comment);
    const limitUptime = command.limitUptime === undefined ? undefined : HotspotLimitUptime.create(command.limitUptime);
    const limitBytesTotal = command.limitBytesTotal === undefined ? undefined : HotspotLimitBytes.create(command.limitBytesTotal);
    const sharedUsers = command.sharedUsers === undefined ? undefined : HotspotSharedUsers.create(command.sharedUsers);
    const disabled = command.disabled ?? false;

    const existing = await client.findHotspotUser({ name: name.value });
    if (existing) {
      if (this.isEquivalent(existing, { comment, disabled, limitBytesTotal, limitUptime, profile, server, sharedUsers })) {
        return name.value; // Idempotent success
      }
      throw new RouterOsHotspotConflictError(
        'Conflicto: ya existe un usuario de Hotspot con diferente configuracion.',
      );
    }

    const createData: RouterOsHotspotUserCreateData = {
      ...(comment !== undefined ? { comment: comment.value } : {}),
      ...(limitBytesTotal !== undefined ? { limitBytesTotal: limitBytesTotal.value } : {}),
      ...(limitUptime !== undefined ? { limitUptime: limitUptime.value } : {}),
      ...(server !== undefined ? { server: server.value } : {}),
      ...(sharedUsers !== undefined ? { sharedUsers: sharedUsers.value } : {}),
      disabled,
      name: name.value,
      password: password.value,
      profile: profile.value,
    };
    await client.createHotspotUser(createData);
    return name.value;
  }

  private async handleUpdate(
    client: RouterOsClientPort,
    command: RouterOsHotspotUserUpdateInput,
  ): Promise<string> {
    const existing = await client.findHotspotUser({ name: command.userReference });
    if (!existing) {
      throw new RouterOsHotspotUserNotFoundError(
        `Usuario de Hotspot no encontrado: ${command.userReference}`,
      );
    }

    const name = command.name === undefined ? undefined : HotspotUsername.create(command.name);
    const password =
      command.credentialReference === undefined
        ? undefined
        : HotspotPassword.create(await this.resolveCredential(command.credentialReference));
    const profile = command.profile === undefined ? undefined : HotspotProfileName.create(command.profile);
    const server = command.server === undefined ? undefined : HotspotServerName.create(command.server);
    const comment = command.comment === undefined ? undefined : HotspotComment.create(command.comment);
    const limitUptime = command.limitUptime === undefined ? undefined : HotspotLimitUptime.create(command.limitUptime);
    const limitBytesTotal = command.limitBytesTotal === undefined ? undefined : HotspotLimitBytes.create(command.limitBytesTotal);
    const sharedUsers = command.sharedUsers === undefined ? undefined : HotspotSharedUsers.create(command.sharedUsers);

    const updateData: MutableHotspotUserUpdateData = {};
    if (name !== undefined && name.value !== existing.name) updateData.name = name.value;
    if (password !== undefined && password.value !== existing.password) updateData.password = password.value;
    if (profile !== undefined && profile.value !== existing.profile) updateData.profile = profile.value;
    if (server !== undefined && server.value !== (existing.server ?? '')) updateData.server = server.value;
    if (comment !== undefined && comment.value !== (existing.comment ?? '')) updateData.comment = comment.value;
    if (limitUptime !== undefined && limitUptime.value !== existing.limitUptime) updateData.limitUptime = limitUptime.value;
    if (limitBytesTotal !== undefined && limitBytesTotal.value !== existing.limitBytesTotal) updateData.limitBytesTotal = limitBytesTotal.value;
    if (sharedUsers !== undefined && sharedUsers.value !== existing.sharedUsers) updateData.sharedUsers = sharedUsers.value;
    if (command.disabled !== undefined && command.disabled !== existing.disabled) updateData.disabled = command.disabled;

    if (Object.keys(updateData).length === 0) {
      return command.userReference; // Idempotent success: nothing changed
    }

    await client.updateHotspotUser({ id: existing.id, name: existing.name }, updateData);
    return command.userReference;
  }

  private async handleEnable(
    client: RouterOsClientPort,
    command: RouterOsHotspotUserEnableInput,
  ): Promise<string> {
    const existing = await client.findHotspotUser({ name: command.userReference });
    if (!existing) {
      throw new RouterOsHotspotUserNotFoundError(
        `Usuario de Hotspot no encontrado: ${command.userReference}`,
      );
    }
    if (!existing.disabled) {
      return command.userReference; // Idempotent success: already enabled
    }
    await client.enableHotspotUser({ id: existing.id, name: existing.name });
    return command.userReference;
  }

  private async handleDisable(
    client: RouterOsClientPort,
    command: RouterOsHotspotUserDisableInput,
  ): Promise<string> {
    const existing = await client.findHotspotUser({ name: command.userReference });
    if (!existing) {
      throw new RouterOsHotspotUserNotFoundError(
        `Usuario de Hotspot no encontrado: ${command.userReference}`,
      );
    }
    if (existing.disabled) {
      return command.userReference; // Idempotent success: already disabled
    }
    await client.disableHotspotUser({ id: existing.id, name: existing.name });
    return command.userReference;
  }

  private async handleRemove(
    client: RouterOsClientPort,
    command: RouterOsHotspotUserRemoveInput,
  ): Promise<string> {
    const existing = await client.findHotspotUser({ name: command.userReference });
    if (!existing) {
      return command.userReference; // Idempotent success: already gone
    }
    await client.removeHotspotUser({ id: existing.id, name: existing.name });
    return command.userReference;
  }

  private isEquivalent(
    existing: RouterOsHotspotUser,
    expected: {
      comment: HotspotComment | undefined;
      disabled: boolean;
      limitBytesTotal: HotspotLimitBytes | undefined;
      limitUptime: HotspotLimitUptime | undefined;
      profile: HotspotProfileName;
      server: HotspotServerName | undefined;
      sharedUsers: HotspotSharedUsers | undefined;
    },
  ): boolean {
    return (
      existing.profile === expected.profile.value &&
      existing.disabled === expected.disabled &&
      (existing.server ?? '') === (expected.server?.value ?? '') &&
      (existing.comment ?? '') === (expected.comment?.value ?? '') &&
      existing.limitUptime === expected.limitUptime?.value &&
      existing.limitBytesTotal === expected.limitBytesTotal?.value &&
      existing.sharedUsers === expected.sharedUsers?.value
    );
  }

  protected override mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsHotspotConflictError) {
      return {
        errorCode: 'ROUTEROS_HOTSPOT_CONFLICT',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsHotspotUserNotFoundError) {
      return {
        errorCode: 'ROUTEROS_HOTSPOT_USER_NOT_FOUND',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('profile') && (message.includes('no such') || message.includes('not found'))) {
      const notFound = new RouterOsHotspotProfileNotFoundError(
        error instanceof Error ? error.message : 'Perfil de Hotspot no encontrado.',
      );
      return {
        errorCode: 'ROUTEROS_HOTSPOT_PROFILE_NOT_FOUND',
        errorMessage: notFound.message,
        outcome: 'permanentFailure',
      };
    }
    if (message.includes('server') && (message.includes('no such') || message.includes('not found'))) {
      const notFound = new RouterOsHotspotServerNotFoundError(
        error instanceof Error ? error.message : 'Servidor de Hotspot no encontrado.',
      );
      return {
        errorCode: 'ROUTEROS_HOTSPOT_SERVER_NOT_FOUND',
        errorMessage: notFound.message,
        outcome: 'permanentFailure',
      };
    }
    return this.mapGenericExecutionError(error);
  }
}
