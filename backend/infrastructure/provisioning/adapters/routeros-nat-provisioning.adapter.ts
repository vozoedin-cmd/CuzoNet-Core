import type { ProvisioningActionResult } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  ObservedNatRule,
  RouterOsNatRuleCreateData,
  RouterOsNatRuleUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { ConnectionState } from '../../../domain/provisioning/routeros/value-objects/connection-state.js';
import { FirewallAddressSpec } from '../../../domain/provisioning/routeros/value-objects/firewall-address-spec.js';
import { InterfaceName } from '../../../domain/provisioning/routeros/value-objects/interface-name.js';
import { NatAction } from '../../../domain/provisioning/routeros/value-objects/nat-action.js';
import type { NatChainName } from '../../../domain/provisioning/routeros/value-objects/nat-chain.js';
import { NatChain } from '../../../domain/provisioning/routeros/value-objects/nat-chain.js';
import { NatRuleComment } from '../../../domain/provisioning/routeros/value-objects/nat-rule-comment.js';
import { NatRuleReference } from '../../../domain/provisioning/routeros/value-objects/nat-rule-reference.js';
import { NatToAddress } from '../../../domain/provisioning/routeros/value-objects/nat-to-address.js';
import { PortSpecification } from '../../../domain/provisioning/routeros/value-objects/port-specification.js';
import { Protocol } from '../../../domain/provisioning/routeros/value-objects/protocol.js';
import { RouterOsInvalidNatRuleError } from '../../../domain/provisioning/routeros/errors/routeros-invalid-nat-rule.error.js';
import { RouterOsNatRuleAmbiguousError } from '../../../domain/provisioning/routeros/errors/routeros-nat-rule-ambiguous.error.js';
import { RouterOsNatRuleConflictError } from '../../../domain/provisioning/routeros/errors/routeros-nat-rule-conflict.error.js';
import { RouterOsNatRuleDynamicError } from '../../../domain/provisioning/routeros/errors/routeros-nat-rule-dynamic.error.js';
import { RouterOsNatRuleNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-nat-rule-not-found.error.js';
import {
  routerOsNatRuleInputSchema,
  type RouterOsNatRuleAddInput,
  type RouterOsNatRuleDisableInput,
  type RouterOsNatRuleEnableInput,
  type RouterOsNatRuleInput,
  type RouterOsNatRuleMoveInput,
  type RouterOsNatRuleRemoveInput,
  type RouterOsNatRuleUpdateInput,
} from '../routeros/routeros-nat-rule.input.js';
import { RouterOsProvisioningAdapterBase } from './routeros-provisioning-adapter.base.js';
import { resolveMoveTarget, resolvePlaceBeforeId } from './routeros-rule-ordering.util.js';

type MutableNatRuleUpdateData = {
  -readonly [K in keyof RouterOsNatRuleUpdateData]: RouterOsNatRuleUpdateData[K];
};

interface DesiredNatRuleFields {
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
  readonly toAddresses: string | undefined;
  readonly toPorts: string | undefined;
}

export class RouterOsNatProvisioningAdapter extends RouterOsProvisioningAdapterBase<RouterOsNatRuleInput> {
  protected readonly referenceMetadataKey = 'ruleReference';

  public constructor(
    type: string,
    connectionResolver: RouterConnectionResolverPort,
    secretProvider: SecretProviderPort,
    clientFactory: RouterOsClientFactoryPort,
  ) {
    super(type, routerOsNatRuleInputSchema, connectionResolver, secretProvider, clientFactory);
  }

  protected executeOperation(client: RouterOsClientPort, command: RouterOsNatRuleInput): Promise<string | undefined> {
    switch (command.actionType) {
      case 'routeros.firewall.nat.add':
        return this.handleAdd(client, command);
      case 'routeros.firewall.nat.update':
        return this.handleUpdate(client, command);
      case 'routeros.firewall.nat.move':
        return this.handleMove(client, command);
      case 'routeros.firewall.nat.enable':
        return this.handleEnable(client, command);
      case 'routeros.firewall.nat.disable':
        return this.handleDisable(client, command);
      case 'routeros.firewall.nat.remove':
        return this.handleRemove(client, command);
    }
  }

  private async handleAdd(client: RouterOsClientPort, command: RouterOsNatRuleAddInput): Promise<string> {
    const ruleReference = NatRuleReference.create(command.ruleReference);
    const desired = this.buildDesiredFields(command);
    this.assertCoherent(desired.chain as NatChainName, desired.action, desired.toAddresses);
    const comment = NatRuleComment.create(ruleReference, command.comment);

    const existing = await this.resolveSingle(client, ruleReference.value);
    if (existing) {
      // Una regla dinamica ocupa la referencia pero no es administrable: no puede
      // considerarse idempotencia (desaparecera sola) ni conflicto resoluble.
      this.assertNotDynamic(existing, ruleReference.value);
      if (this.isEquivalent(existing, desired)) {
        return ruleReference.value; // Idempotent success
      }
      throw new RouterOsNatRuleConflictError(
        `Conflicto: ya existe una regla NAT con la referencia ${ruleReference.value} y configuración distinta.`,
      );
    }

    const placeBeforeId =
      command.position === undefined ? undefined : resolvePlaceBeforeId(await client.listNatRules(), command.position);

    const createData: RouterOsNatRuleCreateData = {
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
      ...(desired.toAddresses !== undefined ? { toAddresses: desired.toAddresses } : {}),
      ...(desired.toPorts !== undefined ? { toPorts: desired.toPorts } : {}),
    };
    await client.createNatRule(createData);
    return ruleReference.value;
  }

  private async handleUpdate(client: RouterOsClientPort, command: RouterOsNatRuleUpdateInput): Promise<string> {
    const ruleReference = NatRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);
    this.assertNotDynamic(existing, ruleReference.value);

    const resultingChain = command.chain !== undefined ? NatChain.create(command.chain).value : existing.chain;
    const resultingAction = command.action !== undefined ? NatAction.create(command.action).value : existing.action;
    const resultingToAddresses = command.toAddresses !== undefined ? command.toAddresses : existing.toAddresses;
    this.assertCoherent(resultingChain as NatChainName, resultingAction, resultingToAddresses);

    const updateData: MutableNatRuleUpdateData = {};
    if (command.chain !== undefined && resultingChain !== existing.chain) updateData.chain = resultingChain;
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
    if (command.toAddresses !== undefined) {
      const toAddresses = NatToAddress.create(command.toAddresses).value;
      if (toAddresses !== (existing.toAddresses ?? '')) updateData.toAddresses = toAddresses;
    }
    if (command.toPorts !== undefined) {
      const toPorts = PortSpecification.create(command.toPorts).value;
      if (toPorts !== (existing.toPorts ?? '')) updateData.toPorts = toPorts;
    }
    if (command.disabled !== undefined && command.disabled !== existing.disabled) {
      updateData.disabled = command.disabled;
    }
    if (command.comment !== undefined) {
      const comment = NatRuleComment.create(ruleReference, command.comment).value;
      if (comment !== (existing.comment ?? '')) updateData.comment = comment;
    }

    if (Object.keys(updateData).length === 0) {
      return ruleReference.value; // Idempotent success: nothing changed
    }

    await client.updateNatRule({ kind: 'id', id: existing.id }, updateData);
    return ruleReference.value;
  }

  private async handleMove(client: RouterOsClientPort, command: RouterOsNatRuleMoveInput): Promise<string> {
    const ruleReference = NatRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);
    this.assertNotDynamic(existing, ruleReference.value);

    const rules = await client.listNatRules();
    const target = resolveMoveTarget(rules, existing.id, command.position);
    if (target.alreadyAtPosition) {
      return ruleReference.value; // Idempotent success: already at the desired position
    }

    await client.moveNatRule(
      { kind: 'id', id: existing.id },
      target.placeBeforeId !== undefined ? { placeBeforeId: target.placeBeforeId } : {},
    );
    return ruleReference.value;
  }

  private async handleEnable(client: RouterOsClientPort, command: RouterOsNatRuleEnableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    if (!existing.disabled) {
      return command.ruleReference; // Idempotent success: already enabled
    }
    await client.enableNatRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async handleDisable(client: RouterOsClientPort, command: RouterOsNatRuleDisableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    if (existing.disabled) {
      return command.ruleReference; // Idempotent success: already disabled
    }
    await client.disableNatRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async handleRemove(client: RouterOsClientPort, command: RouterOsNatRuleRemoveInput): Promise<string> {
    const existing = await this.resolveSingle(client, command.ruleReference);
    if (!existing) {
      return command.ruleReference; // Idempotent success: already gone
    }
    this.assertNotDynamic(existing, command.ruleReference);
    await client.removeNatRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async findOrThrow(client: RouterOsClientPort, ruleReference: string): Promise<ObservedNatRule> {
    const existing = await this.resolveSingle(client, ruleReference);
    if (!existing) {
      throw new RouterOsNatRuleNotFoundError(`Regla NAT no encontrada para la referencia: ${ruleReference}`);
    }
    return existing;
  }

  /** Enforces RouterOS's chain/action compatibility (e.g. masquerade is srcnat-only) and that translating actions carry a target. */
  private assertCoherent(chain: NatChainName, action: string, toAddresses: string | undefined): void {
    const natAction = NatAction.create(action);
    if (!natAction.isCompatibleWith(chain)) {
      throw new RouterOsInvalidNatRuleError(`La acción "${action}" no es válida para la chain "${chain}".`);
    }
    if (natAction.requiresToAddresses() && (toAddresses === undefined || toAddresses.length === 0)) {
      throw new RouterOsInvalidNatRuleError(`La acción "${action}" requiere especificar toAddresses.`);
    }
  }

  private buildDesiredFields(command: RouterOsNatRuleAddInput): DesiredNatRuleFields {
    return {
      action: NatAction.create(command.action).value,
      chain: NatChain.create(command.chain).value,
      connectionState: command.connectionState === undefined ? undefined : ConnectionState.create(command.connectionState).value,
      disabled: command.disabled ?? false,
      dstAddress: command.dstAddress === undefined ? undefined : FirewallAddressSpec.create(command.dstAddress).value,
      dstPort: command.dstPort === undefined ? undefined : PortSpecification.create(command.dstPort).value,
      inInterface: command.inInterface === undefined ? undefined : InterfaceName.create(command.inInterface).value,
      outInterface: command.outInterface === undefined ? undefined : InterfaceName.create(command.outInterface).value,
      protocol: command.protocol === undefined ? undefined : Protocol.create(command.protocol).value,
      srcAddress: command.srcAddress === undefined ? undefined : FirewallAddressSpec.create(command.srcAddress).value,
      srcPort: command.srcPort === undefined ? undefined : PortSpecification.create(command.srcPort).value,
      toAddresses: command.toAddresses === undefined ? undefined : NatToAddress.create(command.toAddresses).value,
      toPorts: command.toPorts === undefined ? undefined : PortSpecification.create(command.toPorts).value,
    };
  }

  /**
   * Resuelve una referencia administrada exigiendo como maximo una coincidencia.
   *
   * RouterOS no impone unicidad sobre el marcador del comentario, asi que dos reglas NAT
   * pueden compartir referencia tras una duplicacion manual o una importacion. Quedarse con
   * la primera dejaria la gemela intacta e informaria exito igualmente: para un reenvio de
   * puerto, exactamente lo contrario de lo pedido.
   */
  private async resolveSingle(
    client: RouterOsClientPort,
    ruleReference: string,
  ): Promise<ObservedNatRule | null> {
    const matches = await client.findNatRulesByReference(ruleReference);
    if (matches.length > 1) {
      throw new RouterOsNatRuleAmbiguousError(
        `La referencia ${ruleReference} resuelve a ${matches.length} reglas NAT en el router ` +
          `(${matches.map((rule) => rule.id).join(', ')}). No se opera sobre una eleccion ` +
          'arbitraria: resuelva la duplicidad en el router antes de reintentar.',
      );
    }
    return matches[0] ?? null;
  }

  /**
   * Las reglas `dynamic=true` las gobierna RouterOS. En NAT el caso mas frecuente es UPnP,
   * que crea mapeos `dst-nat` dinamicos a peticion de los dispositivos de la LAN: no se
   * guardan en la configuracion y desapareceran solas. La guarda corta antes de enviar
   * comando alguno.
   */
  private assertNotDynamic(rule: ObservedNatRule, ruleReference: string): void {
    if (!rule.dynamic) {
      return;
    }
    throw new RouterOsNatRuleDynamicError(
      `La regla NAT ${ruleReference} (${rule.id}) es dinamica y la administra RouterOS, no ` +
        'CuzoNet. Las reglas dinamicas no se pueden crear, modificar, mover, habilitar, ' +
        'deshabilitar ni eliminar desde el aprovisionamiento.',
    );
  }

  private isEquivalent(existing: ObservedNatRule, desired: DesiredNatRuleFields): boolean {
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
      (existing.toAddresses ?? '') === (desired.toAddresses ?? '') &&
      (existing.toPorts ?? '') === (desired.toPorts ?? '') &&
      existing.disabled === desired.disabled
    );
  }

  protected override additionalLogFields(command: RouterOsNatRuleInput): Record<string, unknown> {
    return {
      ruleReference: command.ruleReference,
      ...('chain' in command && command.chain !== undefined ? { chain: command.chain } : {}),
    };
  }

  protected override mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsNatRuleConflictError) {
      return {
        errorCode: 'ROUTEROS_NAT_RULE_CONFLICT',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsNatRuleAmbiguousError) {
      return {
        errorCode: 'ROUTEROS_NAT_RULE_AMBIGUOUS',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsNatRuleDynamicError) {
      return {
        errorCode: 'ROUTEROS_NAT_RULE_DYNAMIC',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsNatRuleNotFoundError) {
      return {
        errorCode: 'ROUTEROS_NAT_RULE_NOT_FOUND',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsInvalidNatRuleError) {
      return {
        errorCode: 'ROUTEROS_INVALID_NAT_RULE',
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
      const invalid = new RouterOsInvalidNatRuleError(
        error instanceof Error ? error.message : 'Regla NAT inválida.',
      );
      return {
        errorCode: 'ROUTEROS_INVALID_NAT_RULE',
        errorMessage: invalid.message,
        outcome: 'permanentFailure',
      };
    }
    return this.mapGenericExecutionError(error);
  }
}
