import type {
  ProvisioningActionInput,
  ProvisioningActionResult,
} from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  ObservedFilterRule,
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
import { RouterOsFilterRuleAmbiguousError } from '../../../domain/provisioning/routeros/errors/routeros-filter-rule-ambiguous.error.js';
import { RouterOsFilterRuleConflictError } from '../../../domain/provisioning/routeros/errors/routeros-filter-rule-conflict.error.js';
import { RouterOsFilterRuleDynamicError } from '../../../domain/provisioning/routeros/errors/routeros-filter-rule-dynamic.error.js';
import { RouterOsFilterRuleNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-filter-rule-not-found.error.js';
import { RouterOsFilterRuleOwnershipError } from '../../../domain/provisioning/routeros/errors/routeros-filter-rule-ownership.error.js';
import { RouterOsFilterRulePostconditionError } from '../../../domain/provisioning/routeros/errors/routeros-filter-rule-postcondition.error.js';
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
import { resolveMoveTarget, resolvePlaceBeforeId } from './routeros-rule-ordering.util.js';

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

  public override async execute(input: ProvisioningActionInput): Promise<ProvisioningActionResult> {
    if (input.target.type !== 'Firewall Filter Rule') {
      return {
        errorCode: 'ROUTEROS_INVALID_TARGET_TYPE',
        errorMessage: `El targetType (${input.target.type}) es inválido para reglas de firewall.`,
        outcome: 'permanentFailure',
      };
    }

    try {
      const payload = JSON.parse(input.inputSnapshotJson);
      
      if (payload.actionType && payload.actionType !== input.actionType) {
        return {
          errorCode: 'ROUTEROS_ACTION_MISMATCH',
          errorMessage: `El actionType externo (${input.actionType}) no coincide con el interno (${payload.actionType}).`,
          outcome: 'permanentFailure',
        };
      }

      if (payload.ruleReference && payload.ruleReference !== input.target.id) {
         return {
           errorCode: 'ROUTEROS_TARGET_MISMATCH',
           errorMessage: `El targetId externo (${input.target.id}) no coincide con ruleReference (${payload.ruleReference}).`,
           outcome: 'permanentFailure',
         };
      }
    } catch {
       // Let base class handle invalid JSON
    }

    return super.execute(input);
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

    const existing = await this.resolveSingle(client, ruleReference.value);
    if (existing) {
      this.assertOwned(existing, ruleReference.value);
      // Una regla dinamica ocupa la referencia pero no es administrable: no puede
      // considerarse idempotencia (desaparecera sola) ni conflicto resoluble.
      this.assertNotDynamic(existing, ruleReference.value);
      if (this.isEquivalent(existing, desired)) {
        return ruleReference.value; // Idempotent success
      }
      throw new RouterOsFilterRuleConflictError(
        `Conflicto: ya existe una regla con la referencia ${ruleReference.value} y configuración distinta.`,
      );
    }

    const placeBeforeId =
      command.position === undefined ? undefined : resolvePlaceBeforeId(await client.listFilterRules(), command.position);

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
    await this.assertExactlyOneAfterCreate(client, ruleReference.value);
    return ruleReference.value;
  }

  private async handleUpdate(client: RouterOsClientPort, command: RouterOsFilterRuleUpdateInput): Promise<string> {
    const ruleReference = FilterRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);
    this.assertOwned(existing, ruleReference.value);
    this.assertNotDynamic(existing, ruleReference.value);

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

    await client.updateFilterRule({ kind: 'id', id: existing.id }, updateData);
    return ruleReference.value;
  }

  private async handleMove(client: RouterOsClientPort, command: RouterOsFilterRuleMoveInput): Promise<string> {
    const ruleReference = FilterRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);
    this.assertOwned(existing, ruleReference.value);
    this.assertNotDynamic(existing, ruleReference.value);

    const rules = await client.listFilterRules();
    const target = resolveMoveTarget(rules, existing.id, command.position);
    if (target.alreadyAtPosition) {
      return ruleReference.value; // Idempotent success: already at the desired position
    }

    await client.moveFilterRule(
      { kind: 'id', id: existing.id },
      target.placeBeforeId !== undefined ? { placeBeforeId: target.placeBeforeId } : {},
    );
    return ruleReference.value;
  }

  private async handleEnable(client: RouterOsClientPort, command: RouterOsFilterRuleEnableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    this.assertOwned(existing, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    if (!existing.disabled) {
      return command.ruleReference; // Idempotent success: already enabled
    }
    await client.enableFilterRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async handleDisable(client: RouterOsClientPort, command: RouterOsFilterRuleDisableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    this.assertOwned(existing, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    if (existing.disabled) {
      return command.ruleReference; // Idempotent success: already disabled
    }
    await client.disableFilterRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async handleRemove(client: RouterOsClientPort, command: RouterOsFilterRuleRemoveInput): Promise<string> {
    const existing = await this.resolveSingle(client, command.ruleReference);
    if (!existing) {
      return command.ruleReference; // Idempotent success: already gone
    }
    this.assertOwned(existing, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    await client.removeFilterRule({ kind: 'id', id: existing.id });
    await this.assertAbsentAfterRemove(client, command.ruleReference);
    return command.ruleReference;
  }

  private async findOrThrow(client: RouterOsClientPort, ruleReference: string): Promise<ObservedFilterRule> {
    const existing = await this.resolveSingle(client, ruleReference);
    if (!existing) {
      throw new RouterOsFilterRuleNotFoundError(`Regla no encontrada para la referencia: ${ruleReference}`);
    }
    return existing;
  }

  /**
   * Resuelve una referencia administrada exigiendo como maximo una coincidencia.
   *
   * RouterOS no impone unicidad sobre el marcador del comentario, asi que dos reglas pueden
   * compartir referencia tras una duplicacion manual o una importacion. Quedarse con la
   * primera dejaria la gemela intacta e informaria exito igualmente.
   */
  private async resolveSingle(
    client: RouterOsClientPort,
    ruleReference: string,
  ): Promise<ObservedFilterRule | null> {
    const matches = await client.findFilterRulesByReference(ruleReference);
    if (matches.length > 1) {
      throw new RouterOsFilterRuleAmbiguousError(
        `La referencia ${ruleReference} resuelve a ${matches.length} reglas en el router ` +
          `(${matches.map((rule) => rule.id).join(', ')}). No se opera sobre una eleccion ` +
          'arbitraria: resuelva la duplicidad en el router antes de reintentar.',
      );
    }
    return matches[0] ?? null;
  }

  /**
   * Solo se muta una regla cuyo marcador de propiedad se lee correctamente y es de esta
   * instalacion (`valid`).
   *
   * Hoy la guarda nunca dispara: `parseOwnership` solo adjunta `ruleReference` al estado
   * `valid`, y toda operacion resuelve por esa referencia, asi que las reglas ajenas no
   * llegan hasta aqui. Se deja de forma defensiva para que la garantia sea exigida y no
   * emergente: si la resolucion se afloja alguna vez, una regla ajena se rechaza en vez de
   * mutarse en silencio.
   *
   * `malformed` se rechaza igual que las demas. Repararla exigiria reescribir su
   * comentario para reclamar su propiedad, decision de producto que el dominio no ha
   * tomado.
   */
  private assertOwned(rule: ObservedFilterRule, ruleReference: string): void {
    if (rule.ownership.status === 'valid') {
      return;
    }
    throw new RouterOsFilterRuleOwnershipError(
      `La regla ${rule.id} resuelta para ${ruleReference} tiene ownership ` +
        `"${rule.ownership.status}" y no la administra CuzoNet. No se modifican reglas ` +
        'ajenas ni se reclama su propiedad de forma implicita.',
    );
  }

  /**
   * Las reglas `dynamic=true` las gobierna RouterOS (Hotspot, IPsec y similares): no se
   * guardan en la configuracion y desapareceran solas. Se pueden observar, pero mutarlas
   * produciria un cambio que no perdura, asi que la guarda corta antes de enviar comando.
   */
  private assertNotDynamic(rule: ObservedFilterRule, ruleReference: string): void {
    if (!rule.dynamic) {
      return;
    }
    throw new RouterOsFilterRuleDynamicError(
      `La regla ${ruleReference} (${rule.id}) es dinamica y la administra RouterOS, no ` +
        'CuzoNet. Las reglas dinamicas no se pueden crear, modificar, mover, habilitar, ' +
        'deshabilitar ni eliminar desde el aprovisionamiento.',
    );
  }

  /**
   * Postcondicion de `create`: releer y confirmar que la referencia quedo en exactamente
   * una regla. Cero significa que el router acepto el comando pero no persistio nada; dos
   * o mas, que se creo un duplicado y toda operacion posterior sobre esa referencia seria
   * ambigua. La relectura aporta aqui lo que el `!done` no garantiza.
   */
  private async assertExactlyOneAfterCreate(
    client: RouterOsClientPort,
    ruleReference: string,
  ): Promise<void> {
    const matches = await client.findFilterRulesByReference(ruleReference);
    if (matches.length === 1) {
      return;
    }
    throw new RouterOsFilterRulePostconditionError(
      matches.length === 0
        ? `El router acepto la creacion de ${ruleReference} pero la regla no existe al releer.`
        : `La creacion de ${ruleReference} dejo ${matches.length} reglas con la misma referencia ` +
          `(${matches.map((rule) => rule.id).join(', ')}).`,
    );
  }

  /** Postcondicion de `remove`: releer y confirmar que no queda ninguna regla con la referencia. */
  private async assertAbsentAfterRemove(
    client: RouterOsClientPort,
    ruleReference: string,
  ): Promise<void> {
    const matches = await client.findFilterRulesByReference(ruleReference);
    if (matches.length === 0) {
      return;
    }
    throw new RouterOsFilterRulePostconditionError(
      `El router acepto la eliminacion de ${ruleReference} pero al releer siguen existiendo ` +
        `${matches.length} reglas con esa referencia (${matches.map((rule) => rule.id).join(', ')}).`,
    );
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

  private isEquivalent(existing: ObservedFilterRule, desired: DesiredFilterRuleFields): boolean {
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
    if (error instanceof RouterOsFilterRuleAmbiguousError) {
      return {
        errorCode: 'ROUTEROS_FILTER_RULE_AMBIGUOUS',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsFilterRuleDynamicError) {
      return {
        errorCode: 'ROUTEROS_FILTER_RULE_DYNAMIC',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsFilterRulePostconditionError) {
      return {
        errorCode: 'ROUTEROS_FILTER_RULE_POSTCONDITION_FAILED',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsFilterRuleOwnershipError) {
      return {
        errorCode: 'ROUTEROS_FILTER_RULE_OWNERSHIP_VIOLATION',
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
