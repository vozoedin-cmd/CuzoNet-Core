import type { ProvisioningActionResult } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  RouterOsFilterRule,
  RouterOsFilterRuleCreateData,
  RouterOsFilterRuleUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { ConnectionState } from '../../../domain/provisioning/routeros/value-objects/connection-state.js';
import { FilterAction } from '../../../domain/provisioning/routeros/value-objects/filter-action.js';
import { FilterRuleComment } from '../../../domain/provisioning/routeros/value-objects/filter-rule-comment.js';
import { FilterRuleReference } from '../../../domain/provisioning/routeros/value-objects/filter-rule-reference.js';
import { FirewallAddressSpec } from '../../../domain/provisioning/routeros/value-objects/firewall-address-spec.js';
import { FirewallChain } from '../../../domain/provisioning/routeros/value-objects/firewall-chain.js';
import { InterfaceName } from '../../../domain/provisioning/routeros/value-objects/interface-name.js';
import { PortSpecification } from '../../../domain/provisioning/routeros/value-objects/port-specification.js';
import { Protocol } from '../../../domain/provisioning/routeros/value-objects/protocol.js';
import { RouterOsFilterRuleConflictError } from '../../../domain/provisioning/routeros/errors/routeros-filter-rule-conflict.error.js';
import { RouterOsFilterRuleNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-filter-rule-not-found.error.js';
import { RouterOsInvalidFilterRuleError } from '../../../domain/provisioning/routeros/errors/routeros-invalid-filter-rule.error.js';
import {
  routerOsFilterRuleInputSchema,
  type RouterOsFilterRuleAddInput,
  type RouterOsFilterRuleDisableInput,
  type RouterOsFilterRuleEnableInput,
  type RouterOsFilterRuleInput,
  type RouterOsFilterRuleMoveInput,
  type RouterOsFilterRuleRemoveInput,
  type RouterOsFilterRuleUpdateInput,
} from '../routeros/routeros-filter-rule.input.js';
import { RouterOsProvisioningAdapterBase } from './routeros-provisioning-adapter.base.js';

type MutableFilterRuleUpdateData = {
  -readonly [K in keyof RouterOsFilterRuleUpdateData]: RouterOsFilterRuleUpdateData[K];
};

interface DesiredFilterRuleFields {
  readonly action: string;
  readonly chain: string;
  readonly connectionState: string | undefined;
  readonly disabled: boolean;
  readonly dstAddress: string | undefined;
  readonly dstPort: string | undefined;
  readonly inInterface: string | undefined;
  readonly outInterface: string | undefined;
  readonly protocol: string | undefined;
  readonly srcAddress: string | undefined;
  readonly srcPort: string | undefined;
}

export class RouterOsFirewallFilterProvisioningAdapter extends RouterOsProvisioningAdapterBase<RouterOsFilterRuleInput> {
  protected readonly referenceMetadataKey = 'ruleReference';

  public constructor(
    type: string,
    connectionResolver: RouterConnectionResolverPort,
    secretProvider: SecretProviderPort,
    clientFactory: RouterOsClientFactoryPort,
  ) {
    super(type, routerOsFilterRuleInputSchema, connectionResolver, secretProvider, clientFactory);
  }

  protected executeOperation(
    client: RouterOsClientPort,
    command: RouterOsFilterRuleInput,
  ): Promise<string | undefined> {
    switch (command.actionType) {
      case 'routeros.firewall.filter.add':
        return this.handleAdd(client, command);
      case 'routeros.firewall.filter.update':
        return this.handleUpdate(client, command);
      case 'routeros.firewall.filter.move':
        return this.handleMove(client, command);
      case 'routeros.firewall.filter.enable':
        return this.handleEnable(client, command);
      case 'routeros.firewall.filter.disable':
        return this.handleDisable(client, command);
      case 'routeros.firewall.filter.remove':
        return this.handleRemove(client, command);
    }
  }

  private async handleAdd(client: RouterOsClientPort, command: RouterOsFilterRuleAddInput): Promise<string> {
    const ruleReference = FilterRuleReference.create(command.ruleReference);
    const desired = this.buildDesiredFields(command);
    const comment = FilterRuleComment.create(ruleReference, command.comment);

    const existing = await client.findFilterRule({ ruleReference: ruleReference.value });
    if (existing) {
      if (this.isEquivalent(existing, desired)) {
        return ruleReference.value; // Idempotent success
      }
      throw new RouterOsFilterRuleConflictError(
        `Conflicto: ya existe una regla con la referencia ${ruleReference.value} y configuración distinta.`,
      );
    }

    const placeBeforeId =
      command.position === undefined ? undefined : await this.resolvePlaceBeforeId(client, command.position);

    const createData: RouterOsFilterRuleCreateData = {
      action: desired.action,
      chain: desired.chain,
      comment: comment.value,
      ...(desired.connectionState !== undefined ? { connectionState: desired.connectionState } : {}),
      disabled: desired.disabled,
      ...(desired.dstAddress !== undefined ? { dstAddress: desired.dstAddress } : {}),
      ...(desired.dstPort !== undefined ? { dstPort: desired.dstPort } : {}),
      ...(desired.inInterface !== undefined ? { inInterface: desired.inInterface } : {}),
      ...(desired.outInterface !== undefined ? { outInterface: desired.outInterface } : {}),
      ...(placeBeforeId !== undefined ? { placeBeforeId } : {}),
      ...(desired.protocol !== undefined ? { protocol: desired.protocol } : {}),
      ...(desired.srcAddress !== undefined ? { srcAddress: desired.srcAddress } : {}),
      ...(desired.srcPort !== undefined ? { srcPort: desired.srcPort } : {}),
    };
    await client.createFilterRule(createData);
    return ruleReference.value;
  }

  private async handleUpdate(client: RouterOsClientPort, command: RouterOsFilterRuleUpdateInput): Promise<string> {
    const ruleReference = FilterRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);

    const updateData: MutableFilterRuleUpdateData = {};
    if (command.chain !== undefined) {
      const chain = FirewallChain.create(command.chain).value;
      if (chain !== existing.chain) updateData.chain = chain;
    }
    if (command.action !== undefined) {
      const action = FilterAction.create(command.action).value;
      if (action !== existing.action) updateData.action = action;
    }
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
    if (command.disabled !== undefined && command.disabled !== existing.disabled) {
      updateData.disabled = command.disabled;
    }
    if (command.comment !== undefined) {
      const comment = FilterRuleComment.create(ruleReference, command.comment).value;
      if (comment !== (existing.comment ?? '')) updateData.comment = comment;
    }

    if (Object.keys(updateData).length === 0) {
      return ruleReference.value; // Idempotent success: nothing changed
    }

    await client.updateFilterRule({ id: existing.id }, updateData);
    return ruleReference.value;
  }

  private async handleMove(client: RouterOsClientPort, command: RouterOsFilterRuleMoveInput): Promise<string> {
    const ruleReference = FilterRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);

    const rules = await client.listFilterRules();
    const currentIndex = rules.findIndex((rule) => rule.id === existing.id);
    const currentNextId = rules[currentIndex + 1]?.id;

    const remaining = rules.filter((rule) => rule.id !== existing.id);
    const desiredIndex = Math.min(command.position, remaining.length);
    const targetId = remaining[desiredIndex]?.id;

    if (currentNextId === targetId) {
      return ruleReference.value; // Idempotent success: already at the desired position
    }

    await client.moveFilterRule({ id: existing.id }, targetId !== undefined ? { placeBeforeId: targetId } : {});
    return ruleReference.value;
  }

  private async handleEnable(client: RouterOsClientPort, command: RouterOsFilterRuleEnableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    if (!existing.disabled) {
      return command.ruleReference; // Idempotent success: already enabled
    }
    await client.enableFilterRule({ id: existing.id });
    return command.ruleReference;
  }

  private async handleDisable(client: RouterOsClientPort, command: RouterOsFilterRuleDisableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    if (existing.disabled) {
      return command.ruleReference; // Idempotent success: already disabled
    }
    await client.disableFilterRule({ id: existing.id });
    return command.ruleReference;
  }

  private async handleRemove(client: RouterOsClientPort, command: RouterOsFilterRuleRemoveInput): Promise<string> {
    const existing = await client.findFilterRule({ ruleReference: command.ruleReference });
    if (!existing) {
      return command.ruleReference; // Idempotent success: already gone
    }
    await client.removeFilterRule({ id: existing.id });
    return command.ruleReference;
  }

  private async findOrThrow(client: RouterOsClientPort, ruleReference: string): Promise<RouterOsFilterRule> {
    const existing = await client.findFilterRule({ ruleReference });
    if (!existing) {
      throw new RouterOsFilterRuleNotFoundError(`Regla no encontrada para la referencia: ${ruleReference}`);
    }
    return existing;
  }

  private async resolvePlaceBeforeId(client: RouterOsClientPort, position: number): Promise<string | undefined> {
    const rules = await client.listFilterRules();
    return rules[Math.min(position, rules.length)]?.id;
  }

  private buildDesiredFields(command: RouterOsFilterRuleAddInput): DesiredFilterRuleFields {
    return {
      action: FilterAction.create(command.action).value,
      chain: FirewallChain.create(command.chain).value,
      connectionState: command.connectionState === undefined ? undefined : ConnectionState.create(command.connectionState).value,
      disabled: command.disabled ?? false,
      dstAddress: command.dstAddress === undefined ? undefined : FirewallAddressSpec.create(command.dstAddress).value,
      dstPort: command.dstPort === undefined ? undefined : PortSpecification.create(command.dstPort).value,
      inInterface: command.inInterface === undefined ? undefined : InterfaceName.create(command.inInterface).value,
      outInterface: command.outInterface === undefined ? undefined : InterfaceName.create(command.outInterface).value,
      protocol: command.protocol === undefined ? undefined : Protocol.create(command.protocol).value,
      srcAddress: command.srcAddress === undefined ? undefined : FirewallAddressSpec.create(command.srcAddress).value,
      srcPort: command.srcPort === undefined ? undefined : PortSpecification.create(command.srcPort).value,
    };
  }

  private isEquivalent(existing: RouterOsFilterRule, desired: DesiredFilterRuleFields): boolean {
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
      existing.disabled === desired.disabled
    );
  }

  protected override additionalLogFields(command: RouterOsFilterRuleInput): Record<string, unknown> {
    return {
      ruleReference: command.ruleReference,
      ...('chain' in command && command.chain !== undefined ? { chain: command.chain } : {}),
    };
  }

  protected override mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsFilterRuleConflictError) {
      return {
        errorCode: 'ROUTEROS_FILTER_RULE_CONFLICT',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsFilterRuleNotFoundError) {
      return {
        errorCode: 'ROUTEROS_FILTER_RULE_NOT_FOUND',
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
        message.includes('chain'))
    ) {
      const invalid = new RouterOsInvalidFilterRuleError(
        error instanceof Error ? error.message : 'Regla de firewall inválida.',
      );
      return {
        errorCode: 'ROUTEROS_INVALID_FILTER_RULE',
        errorMessage: invalid.message,
        outcome: 'permanentFailure',
      };
    }
    return this.mapGenericExecutionError(error);
  }
}
