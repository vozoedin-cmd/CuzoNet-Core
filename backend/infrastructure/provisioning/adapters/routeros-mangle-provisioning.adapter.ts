import type { ProvisioningActionResult } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  ObservedMangleRule,
  RouterOsMangleRuleCreateData,
  RouterOsMangleRuleUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { ConnectionState } from '../../../domain/provisioning/routeros/value-objects/connection-state.js';
import { FirewallAddressSpec } from '../../../domain/provisioning/routeros/value-objects/firewall-address-spec.js';
import { InterfaceName } from '../../../domain/provisioning/routeros/value-objects/interface-name.js';
import { MangleAction } from '../../../domain/provisioning/routeros/value-objects/mangle-action.js';
import { MangleChain } from '../../../domain/provisioning/routeros/value-objects/mangle-chain.js';
import { MangleMarkName } from '../../../domain/provisioning/routeros/value-objects/mangle-mark-name.js';
import { MangleRuleComment } from '../../../domain/provisioning/routeros/value-objects/mangle-rule-comment.js';
import { MangleRuleReference } from '../../../domain/provisioning/routeros/value-objects/mangle-rule-reference.js';
import { PortSpecification } from '../../../domain/provisioning/routeros/value-objects/port-specification.js';
import { Protocol } from '../../../domain/provisioning/routeros/value-objects/protocol.js';
import { RouterOsInvalidMangleRuleError } from '../../../domain/provisioning/routeros/errors/routeros-invalid-mangle-rule.error.js';
import { RouterOsMangleRuleConflictError } from '../../../domain/provisioning/routeros/errors/routeros-mangle-rule-conflict.error.js';
import { RouterOsMangleRuleNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-mangle-rule-not-found.error.js';
import {
  routerOsMangleRuleInputSchema,
  type RouterOsMangleRuleAddInput,
  type RouterOsMangleRuleDisableInput,
  type RouterOsMangleRuleEnableInput,
  type RouterOsMangleRuleInput,
  type RouterOsMangleRuleMoveInput,
  type RouterOsMangleRuleRemoveInput,
  type RouterOsMangleRuleUpdateInput,
} from '../routeros/routeros-mangle-rule.input.js';
import { RouterOsProvisioningAdapterBase } from './routeros-provisioning-adapter.base.js';
import { resolveMoveTarget, resolvePlaceBeforeId } from './routeros-rule-ordering.util.js';

type MutableMangleRuleUpdateData = {
  -readonly [K in keyof RouterOsMangleRuleUpdateData]: RouterOsMangleRuleUpdateData[K];
};

interface DesiredMangleRuleFields {
  readonly action: string;
  readonly chain: string;
  readonly connectionMark: string | undefined;
  readonly connectionState: string | undefined;
  readonly disabled: boolean;
  readonly dstAddress: string | undefined;
  readonly dstPort: string | undefined;
  readonly inInterface: string | undefined;
  readonly newConnectionMark: string | undefined;
  readonly newPacketMark: string | undefined;
  readonly newRoutingMark: string | undefined;
  readonly outInterface: string | undefined;
  readonly packetMark: string | undefined;
  readonly passthrough: boolean | undefined;
  readonly protocol: string | undefined;
  readonly routingMark: string | undefined;
  readonly srcAddress: string | undefined;
  readonly srcPort: string | undefined;
}

/**
 * Phase 1 of Mangle provisioning: mark-connection/mark-packet/mark-routing
 * and passthrough. Jump/return, change-ttl, change-dscp, route and other
 * advanced actions are Phase 2 and intentionally out of scope.
 */
export class RouterOsMangleProvisioningAdapter extends RouterOsProvisioningAdapterBase<RouterOsMangleRuleInput> {
  protected readonly referenceMetadataKey = 'ruleReference';

  public constructor(
    type: string,
    connectionResolver: RouterConnectionResolverPort,
    secretProvider: SecretProviderPort,
    clientFactory: RouterOsClientFactoryPort,
  ) {
    super(type, routerOsMangleRuleInputSchema, connectionResolver, secretProvider, clientFactory);
  }

  protected executeOperation(
    client: RouterOsClientPort,
    command: RouterOsMangleRuleInput,
  ): Promise<string | undefined> {
    switch (command.actionType) {
      case 'routeros.firewall.mangle.add':
        return this.handleAdd(client, command);
      case 'routeros.firewall.mangle.update':
        return this.handleUpdate(client, command);
      case 'routeros.firewall.mangle.move':
        return this.handleMove(client, command);
      case 'routeros.firewall.mangle.enable':
        return this.handleEnable(client, command);
      case 'routeros.firewall.mangle.disable':
        return this.handleDisable(client, command);
      case 'routeros.firewall.mangle.remove':
        return this.handleRemove(client, command);
    }
  }

  private async handleAdd(client: RouterOsClientPort, command: RouterOsMangleRuleAddInput): Promise<string> {
    const ruleReference = MangleRuleReference.create(command.ruleReference);
    const desired = this.buildDesiredFields(command);
    this.assertCoherent(desired.action, desired);
    const comment = MangleRuleComment.create(ruleReference, command.comment);

    const existing = (await client.findMangleRulesByReference(ruleReference.value))[0];
    if (existing) {
      if (this.isEquivalent(existing, desired)) {
        return ruleReference.value; // Idempotent success
      }
      throw new RouterOsMangleRuleConflictError(
        `Conflicto: ya existe una regla Mangle con la referencia ${ruleReference.value} y configuración distinta.`,
      );
    }

    const placeBeforeId =
      command.position === undefined ? undefined : resolvePlaceBeforeId(await client.listMangleRules(), command.position);

    const createData: RouterOsMangleRuleCreateData = {
      action: desired.action,
      chain: desired.chain,
      comment: comment.value,
      ...(desired.connectionMark !== undefined ? { connectionMark: desired.connectionMark } : {}),
      ...(desired.connectionState !== undefined ? { connectionState: desired.connectionState } : {}),
      disabled: desired.disabled,
      ...(desired.dstAddress !== undefined ? { dstAddress: desired.dstAddress } : {}),
      ...(desired.dstPort !== undefined ? { dstPort: desired.dstPort } : {}),
      ...(desired.inInterface !== undefined ? { inInterface: desired.inInterface } : {}),
      ...(desired.newConnectionMark !== undefined ? { newConnectionMark: desired.newConnectionMark } : {}),
      ...(desired.newPacketMark !== undefined ? { newPacketMark: desired.newPacketMark } : {}),
      ...(desired.newRoutingMark !== undefined ? { newRoutingMark: desired.newRoutingMark } : {}),
      ...(desired.outInterface !== undefined ? { outInterface: desired.outInterface } : {}),
      ...(desired.packetMark !== undefined ? { packetMark: desired.packetMark } : {}),
      ...(desired.passthrough !== undefined ? { passthrough: desired.passthrough } : {}),
      ...(placeBeforeId !== undefined ? { placeBeforeId } : {}),
      ...(desired.protocol !== undefined ? { protocol: desired.protocol } : {}),
      ...(desired.routingMark !== undefined ? { routingMark: desired.routingMark } : {}),
      ...(desired.srcAddress !== undefined ? { srcAddress: desired.srcAddress } : {}),
      ...(desired.srcPort !== undefined ? { srcPort: desired.srcPort } : {}),
    };
    await client.createMangleRule(createData);
    return ruleReference.value;
  }

  private async handleUpdate(client: RouterOsClientPort, command: RouterOsMangleRuleUpdateInput): Promise<string> {
    const ruleReference = MangleRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);

    const resultingAction = command.action !== undefined ? MangleAction.create(command.action).value : existing.action;
    const resultingMarks = {
      newConnectionMark: command.newConnectionMark !== undefined ? command.newConnectionMark : existing.newConnectionMark,
      newPacketMark: command.newPacketMark !== undefined ? command.newPacketMark : existing.newPacketMark,
      newRoutingMark: command.newRoutingMark !== undefined ? command.newRoutingMark : existing.newRoutingMark,
    };
    this.assertCoherent(resultingAction, resultingMarks);

    const updateData: MutableMangleRuleUpdateData = {};
    if (command.chain !== undefined) {
      const chain = MangleChain.create(command.chain).value;
      if (chain !== existing.chain) updateData.chain = chain;
    }
    if (command.action !== undefined && resultingAction !== existing.action) updateData.action = resultingAction;
    if (command.protocol !== undefined) {
      const protocol = Protocol.create(command.protocol).value;
      if (protocol !== (existing.protocol ?? '')) updateData.protocol = protocol;
    }
    if (command.srcAddress !== undefined) {
      const srcAddress = FirewallAddressSpec.create(command.srcAddress).value;
      if (srcAddress !== (existing.srcAddress ?? '')) updateData.srcAddress = srcAddress;
    }
    if (command.dstAddress !== undefined) {
      const dstAddress = FirewallAddressSpec.create(command.dstAddress).value;
      if (dstAddress !== (existing.dstAddress ?? '')) updateData.dstAddress = dstAddress;
    }
    if (command.srcPort !== undefined) {
      const srcPort = PortSpecification.create(command.srcPort).value;
      if (srcPort !== (existing.srcPort ?? '')) updateData.srcPort = srcPort;
    }
    if (command.dstPort !== undefined) {
      const dstPort = PortSpecification.create(command.dstPort).value;
      if (dstPort !== (existing.dstPort ?? '')) updateData.dstPort = dstPort;
    }
    if (command.inInterface !== undefined) {
      const inInterface = InterfaceName.create(command.inInterface).value;
      if (inInterface !== (existing.inInterface ?? '')) updateData.inInterface = inInterface;
    }
    if (command.outInterface !== undefined) {
      const outInterface = InterfaceName.create(command.outInterface).value;
      if (outInterface !== (existing.outInterface ?? '')) updateData.outInterface = outInterface;
    }
    if (command.connectionState !== undefined) {
      const connectionState = ConnectionState.create(command.connectionState).value;
      if (connectionState !== (existing.connectionState ?? '')) updateData.connectionState = connectionState;
    }
    if (command.connectionMark !== undefined) {
      const connectionMark = MangleMarkName.create(command.connectionMark).value;
      if (connectionMark !== (existing.connectionMark ?? '')) updateData.connectionMark = connectionMark;
    }
    if (command.packetMark !== undefined) {
      const packetMark = MangleMarkName.create(command.packetMark).value;
      if (packetMark !== (existing.packetMark ?? '')) updateData.packetMark = packetMark;
    }
    if (command.routingMark !== undefined) {
      const routingMark = MangleMarkName.create(command.routingMark).value;
      if (routingMark !== (existing.routingMark ?? '')) updateData.routingMark = routingMark;
    }
    if (command.newConnectionMark !== undefined) {
      const newConnectionMark = MangleMarkName.create(command.newConnectionMark).value;
      if (newConnectionMark !== (existing.newConnectionMark ?? '')) updateData.newConnectionMark = newConnectionMark;
    }
    if (command.newPacketMark !== undefined) {
      const newPacketMark = MangleMarkName.create(command.newPacketMark).value;
      if (newPacketMark !== (existing.newPacketMark ?? '')) updateData.newPacketMark = newPacketMark;
    }
    if (command.newRoutingMark !== undefined) {
      const newRoutingMark = MangleMarkName.create(command.newRoutingMark).value;
      if (newRoutingMark !== (existing.newRoutingMark ?? '')) updateData.newRoutingMark = newRoutingMark;
    }
    if (command.passthrough !== undefined && command.passthrough !== existing.passthrough) {
      updateData.passthrough = command.passthrough;
    }
    if (command.disabled !== undefined && command.disabled !== existing.disabled) {
      updateData.disabled = command.disabled;
    }
    if (command.comment !== undefined) {
      const comment = MangleRuleComment.create(ruleReference, command.comment).value;
      if (comment !== (existing.comment ?? '')) updateData.comment = comment;
    }

    if (Object.keys(updateData).length === 0) {
      return ruleReference.value; // Idempotent success: nothing changed
    }

    await client.updateMangleRule({ kind: 'id', id: existing.id }, updateData);
    return ruleReference.value;
  }

  private async handleMove(client: RouterOsClientPort, command: RouterOsMangleRuleMoveInput): Promise<string> {
    const ruleReference = MangleRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);

    const rules = await client.listMangleRules();
    const target = resolveMoveTarget(rules, existing.id, command.position);
    if (target.alreadyAtPosition) {
      return ruleReference.value; // Idempotent success: already at the desired position
    }

    await client.moveMangleRule(
      { kind: 'id', id: existing.id },
      target.placeBeforeId !== undefined ? { placeBeforeId: target.placeBeforeId } : {},
    );
    return ruleReference.value;
  }

  private async handleEnable(client: RouterOsClientPort, command: RouterOsMangleRuleEnableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    if (!existing.disabled) {
      return command.ruleReference; // Idempotent success: already enabled
    }
    await client.enableMangleRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async handleDisable(client: RouterOsClientPort, command: RouterOsMangleRuleDisableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    if (existing.disabled) {
      return command.ruleReference; // Idempotent success: already disabled
    }
    await client.disableMangleRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async handleRemove(client: RouterOsClientPort, command: RouterOsMangleRuleRemoveInput): Promise<string> {
    const existing = (await client.findMangleRulesByReference(command.ruleReference))[0];
    if (!existing) {
      return command.ruleReference; // Idempotent success: already gone
    }
    await client.removeMangleRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async findOrThrow(client: RouterOsClientPort, ruleReference: string): Promise<ObservedMangleRule> {
    const existing = (await client.findMangleRulesByReference(ruleReference))[0];
    if (!existing) {
      throw new RouterOsMangleRuleNotFoundError(`Regla Mangle no encontrada para la referencia: ${ruleReference}`);
    }
    return existing;
  }

  /** Enforces that mark-connection/mark-packet/mark-routing each carry their required new-*-mark field. */
  private assertCoherent(
    action: string,
    marks: {
      newConnectionMark: string | undefined;
      newPacketMark: string | undefined;
      newRoutingMark: string | undefined;
    },
  ): void {
    const requiredField = MangleAction.create(action).requiredNewMarkField();
    if (requiredField !== null && (marks[requiredField] === undefined || marks[requiredField]!.length === 0)) {
      throw new RouterOsInvalidMangleRuleError(`La acción "${action}" requiere especificar ${requiredField}.`);
    }
  }

  private buildDesiredFields(command: RouterOsMangleRuleAddInput): DesiredMangleRuleFields {
    return {
      action: MangleAction.create(command.action).value,
      chain: MangleChain.create(command.chain).value,
      connectionMark: command.connectionMark === undefined ? undefined : MangleMarkName.create(command.connectionMark).value,
      connectionState: command.connectionState === undefined ? undefined : ConnectionState.create(command.connectionState).value,
      disabled: command.disabled ?? false,
      dstAddress: command.dstAddress === undefined ? undefined : FirewallAddressSpec.create(command.dstAddress).value,
      dstPort: command.dstPort === undefined ? undefined : PortSpecification.create(command.dstPort).value,
      inInterface: command.inInterface === undefined ? undefined : InterfaceName.create(command.inInterface).value,
      newConnectionMark:
        command.newConnectionMark === undefined ? undefined : MangleMarkName.create(command.newConnectionMark).value,
      newPacketMark: command.newPacketMark === undefined ? undefined : MangleMarkName.create(command.newPacketMark).value,
      newRoutingMark: command.newRoutingMark === undefined ? undefined : MangleMarkName.create(command.newRoutingMark).value,
      outInterface: command.outInterface === undefined ? undefined : InterfaceName.create(command.outInterface).value,
      packetMark: command.packetMark === undefined ? undefined : MangleMarkName.create(command.packetMark).value,
      passthrough: command.passthrough,
      protocol: command.protocol === undefined ? undefined : Protocol.create(command.protocol).value,
      routingMark: command.routingMark === undefined ? undefined : MangleMarkName.create(command.routingMark).value,
      srcAddress: command.srcAddress === undefined ? undefined : FirewallAddressSpec.create(command.srcAddress).value,
      srcPort: command.srcPort === undefined ? undefined : PortSpecification.create(command.srcPort).value,
    };
  }

  private isEquivalent(existing: ObservedMangleRule, desired: DesiredMangleRuleFields): boolean {
    return (
      existing.chain === desired.chain &&
      existing.action === desired.action &&
      (existing.protocol ?? '') === (desired.protocol ?? '') &&
      (existing.srcAddress ?? '') === (desired.srcAddress ?? '') &&
      (existing.dstAddress ?? '') === (desired.dstAddress ?? '') &&
      (existing.srcPort ?? '') === (desired.srcPort ?? '') &&
      (existing.dstPort ?? '') === (desired.dstPort ?? '') &&
      (existing.inInterface ?? '') === (desired.inInterface ?? '') &&
      (existing.outInterface ?? '') === (desired.outInterface ?? '') &&
      (existing.connectionState ?? '') === (desired.connectionState ?? '') &&
      (existing.connectionMark ?? '') === (desired.connectionMark ?? '') &&
      (existing.packetMark ?? '') === (desired.packetMark ?? '') &&
      (existing.routingMark ?? '') === (desired.routingMark ?? '') &&
      (existing.newConnectionMark ?? '') === (desired.newConnectionMark ?? '') &&
      (existing.newPacketMark ?? '') === (desired.newPacketMark ?? '') &&
      (existing.newRoutingMark ?? '') === (desired.newRoutingMark ?? '') &&
      (existing.passthrough ?? undefined) === (desired.passthrough ?? undefined) &&
      existing.disabled === desired.disabled
    );
  }

  protected override additionalLogFields(command: RouterOsMangleRuleInput): Record<string, unknown> {
    return {
      ruleReference: command.ruleReference,
      ...('chain' in command && command.chain !== undefined ? { chain: command.chain } : {}),
    };
  }

  protected override mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsMangleRuleConflictError) {
      return {
        errorCode: 'ROUTEROS_MANGLE_RULE_CONFLICT',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsMangleRuleNotFoundError) {
      return {
        errorCode: 'ROUTEROS_MANGLE_RULE_NOT_FOUND',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsInvalidMangleRuleError) {
      return {
        errorCode: 'ROUTEROS_INVALID_MANGLE_RULE',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (
      message.includes('invalid') &&
      (message.includes('interface') ||
        message.includes('protocol') ||
        message.includes('address') ||
        message.includes('chain') ||
        message.includes('mark'))
    ) {
      const invalid = new RouterOsInvalidMangleRuleError(
        error instanceof Error ? error.message : 'Regla Mangle inválida.',
      );
      return {
        errorCode: 'ROUTEROS_INVALID_MANGLE_RULE',
        errorMessage: invalid.message,
        outcome: 'permanentFailure',
      };
    }
    return this.mapGenericExecutionError(error);
  }
}
