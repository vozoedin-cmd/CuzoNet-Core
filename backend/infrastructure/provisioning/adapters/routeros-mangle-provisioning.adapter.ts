import type { ProvisioningActionResult } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  ObservedMangleRule,
  RouterOsMangleRuleCreateData,
  RouterOsMangleRuleUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import { ROUTEROS_MANGLE_RULE_DEFAULTS } from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
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
import { RouterOsMangleRuleAmbiguousError } from '../../../domain/provisioning/routeros/errors/routeros-mangle-rule-ambiguous.error.js';
import { RouterOsMangleRuleConflictError } from '../../../domain/provisioning/routeros/errors/routeros-mangle-rule-conflict.error.js';
import { RouterOsMangleRuleDynamicError } from '../../../domain/provisioning/routeros/errors/routeros-mangle-rule-dynamic.error.js';
import { RouterOsMangleRuleNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-mangle-rule-not-found.error.js';
import { RouterOsMangleRuleOwnershipError } from '../../../domain/provisioning/routeros/errors/routeros-mangle-rule-ownership.error.js';
import { RouterOsMangleRulePostconditionError } from '../../../domain/provisioning/routeros/errors/routeros-mangle-rule-postcondition.error.js';
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

    const existing = await this.resolveSingle(client, ruleReference.value);
    if (existing) {
      this.assertOwned(existing, ruleReference.value);
      // Una regla dinamica ocupa la referencia pero no es administrable: no puede
      // considerarse idempotencia (desaparecera sola) ni conflicto resoluble.
      this.assertNotDynamic(existing, ruleReference.value);
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
    await this.assertExactlyOneEquivalentAfterCreate(client, ruleReference.value, desired);
    return ruleReference.value;
  }

  private async handleUpdate(client: RouterOsClientPort, command: RouterOsMangleRuleUpdateInput): Promise<string> {
    const ruleReference = MangleRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);
    this.assertOwned(existing, ruleReference.value);
    this.assertNotDynamic(existing, ruleReference.value);

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
    this.assertOwned(existing, ruleReference.value);
    this.assertNotDynamic(existing, ruleReference.value);

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
    this.assertOwned(existing, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    if (!existing.disabled) {
      return command.ruleReference; // Idempotent success: already enabled
    }
    await client.enableMangleRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async handleDisable(client: RouterOsClientPort, command: RouterOsMangleRuleDisableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    this.assertOwned(existing, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    if (existing.disabled) {
      return command.ruleReference; // Idempotent success: already disabled
    }
    await client.disableMangleRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async handleRemove(client: RouterOsClientPort, command: RouterOsMangleRuleRemoveInput): Promise<string> {
    const existing = await this.resolveSingle(client, command.ruleReference);
    if (!existing) {
      return command.ruleReference; // Idempotent success: already gone
    }
    this.assertOwned(existing, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    await client.removeMangleRule({ kind: 'id', id: existing.id });
    await this.assertAbsentAfterRemove(client, command.ruleReference);
    return command.ruleReference;
  }

  private async findOrThrow(client: RouterOsClientPort, ruleReference: string): Promise<ObservedMangleRule> {
    const existing = await this.resolveSingle(client, ruleReference);
    if (!existing) {
      throw new RouterOsMangleRuleNotFoundError(`Regla Mangle no encontrada para la referencia: ${ruleReference}`);
    }
    return existing;
  }

  /**
   * Resuelve una referencia administrada exigiendo como maximo una coincidencia.
   *
   * RouterOS no impone unicidad sobre el marcador del comentario, asi que dos reglas Mangle
   * pueden compartir referencia tras una duplicacion manual o una importacion. Quedarse con
   * la primera es peor aqui que en otros recursos: el marcado depende de la posicion en la
   * cadena y de `passthrough`, asi que operar sobre una de dos gemelas deja marcado un
   * trafico que se creia desmarcado, e informa exito igualmente.
   */
  private async resolveSingle(
    client: RouterOsClientPort,
    ruleReference: string,
  ): Promise<ObservedMangleRule | null> {
    const matches = await client.findMangleRulesByReference(ruleReference);
    if (matches.length > 1) {
      throw new RouterOsMangleRuleAmbiguousError(
        `La referencia ${ruleReference} resuelve a ${matches.length} reglas Mangle en el router ` +
          `(${matches.map((rule) => rule.id).join(', ')}). No se opera sobre una eleccion ` +
          'arbitraria: resuelva la duplicidad en el router antes de reintentar.',
      );
    }
    return matches[0] ?? null;
  }

  /**
   * Solo se muta una regla Mangle cuyo marcador de propiedad se lee correctamente y es de
   * esta instalacion (`valid`). Ver `RouterOsMangleRuleOwnershipError` para por que la
   * guarda es defensiva y aun asi se exige.
   */
  private assertOwned(rule: ObservedMangleRule, ruleReference: string): void {
    if (rule.ownership.status === 'valid') {
      return;
    }
    throw new RouterOsMangleRuleOwnershipError(
      `La regla Mangle ${rule.id} resuelta para ${ruleReference} tiene ownership ` +
        `"${rule.ownership.status}" y no la administra CuzoNet. No se modifican reglas ` +
        'ajenas ni se reclama su propiedad de forma implicita.',
    );
  }

  /** Las reglas `dynamic=true` las gobierna RouterOS. La guarda corta antes de enviar comando alguno. */
  private assertNotDynamic(rule: ObservedMangleRule, ruleReference: string): void {
    if (!rule.dynamic) {
      return;
    }
    throw new RouterOsMangleRuleDynamicError(
      `La regla Mangle ${ruleReference} (${rule.id}) es dinamica y la administra RouterOS, no ` +
        'CuzoNet. Las reglas dinamicas no se pueden crear, modificar, mover, habilitar, ' +
        'deshabilitar ni eliminar desde el aprovisionamiento.',
    );
  }

  /**
   * Postcondicion de `create`: releer y confirmar que la referencia quedo en exactamente una
   * regla Y que esa regla es la pedida. Cero significa que el router acepto el comando pero
   * no persistio nada; dos o mas, que se creo un duplicado y toda operacion posterior sobre
   * esa referencia seria ambigua. La comprobacion de equivalencia es propia de Mangle: el
   * router normaliza y completa campos al aceptar la regla, y una regla que quedo distinta
   * marca un trafico distinto del pedido mientras el sistema informa exito.
   */
  private async assertExactlyOneEquivalentAfterCreate(
    client: RouterOsClientPort,
    ruleReference: string,
    desired: DesiredMangleRuleFields,
  ): Promise<void> {
    const matches = await client.findMangleRulesByReference(ruleReference);
    if (matches.length !== 1) {
      throw new RouterOsMangleRulePostconditionError(
        matches.length === 0
          ? `El router acepto la creacion de la regla Mangle ${ruleReference} pero no existe al releer.`
          : `La creacion de la regla Mangle ${ruleReference} dejo ${matches.length} reglas con la ` +
            `misma referencia (${matches.map((rule) => rule.id).join(', ')}).`,
      );
    }
    const created = matches[0]!;
    if (!this.isEquivalent(created, desired)) {
      throw new RouterOsMangleRulePostconditionError(
        `El router acepto la creacion de la regla Mangle ${ruleReference} (${created.id}) pero al ` +
          'releer no coincide con lo solicitado. La regla marcaria un trafico distinto del pedido.',
      );
    }
  }

  /** Postcondicion de `remove`: releer y confirmar que no queda ninguna regla con la referencia. */
  private async assertAbsentAfterRemove(client: RouterOsClientPort, ruleReference: string): Promise<void> {
    const matches = await client.findMangleRulesByReference(ruleReference);
    if (matches.length === 0) {
      return;
    }
    throw new RouterOsMangleRulePostconditionError(
      `El router acepto la eliminacion de la regla Mangle ${ruleReference} pero al releer siguen ` +
        `existiendo ${matches.length} reglas con esa referencia ` +
        `(${matches.map((rule) => rule.id).join(', ')}).`,
    );
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

  /**
   * Compara la regla observada con la deseada.
   *
   * `passthrough` NO se puede comparar como los demas campos opcionales. RouterOS 7.21.4 lo
   * materializa siempre —la sonda de la Fase 0 lo devolvio en el 100% de las reglas—, asi
   * que omitirlo en el payload no significa "sin valor" sino "el default del router". Antes
   * se comparaba `true === undefined` y toda re-ejecucion de un `add` que no declarara
   * `passthrough` se reportaba como conflicto en vez de como idempotencia: contra el router
   * real, siempre. Un payload que lo omite equivale al default documentado.
   */
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
      existing.passthrough === (desired.passthrough ?? ROUTEROS_MANGLE_RULE_DEFAULTS.passthrough) &&
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
    if (error instanceof RouterOsMangleRuleAmbiguousError) {
      return {
        errorCode: 'ROUTEROS_MANGLE_RULE_AMBIGUOUS',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsMangleRuleDynamicError) {
      return {
        errorCode: 'ROUTEROS_MANGLE_RULE_DYNAMIC',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsMangleRulePostconditionError) {
      return {
        errorCode: 'ROUTEROS_MANGLE_RULE_POSTCONDITION_FAILED',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsMangleRuleOwnershipError) {
      return {
        errorCode: 'ROUTEROS_MANGLE_RULE_OWNERSHIP_VIOLATION',
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
    return this.mapTrapError(error);
  }

  /**
   * Traduce el `!trap` de RouterOS a partir de los mensajes CERTIFICADOS en la Fase 3, no de
   * heuristicas.
   *
   * El mapeo anterior exigia la palabra "invalid" en el mensaje, y RouterOS casi nunca la
   * usa: rechaza un valor con `input does not match any value of <parametro>`. En la
   * practica eso mandaba los rechazos de validacion mas frecuentes —accion, chain, protocolo,
   * interfaz, marca de enrutamiento— al fallback generico, indistinguibles de un fallo real
   * del router.
   *
   * Se reconoce solo lo que la suite de wire protocol fija; el resto cae al fallback
   * `ROUTEROS_EXECUTION_FAILED`, que es la respuesta honesta ante un mensaje no observado.
   */
  private mapTrapError(error: unknown): ProvisioningActionResult {
    const message = error instanceof Error ? error.message.toLowerCase() : '';

    // El router valido el payload y lo rechazo: reenviarlo tal cual dara siempre lo mismo.
    const isValidationTrap =
      message.includes('input does not match any value of') ||
      message.includes('invalid value for argument') ||
      message.includes('unknown parameter') ||
      message.includes('chain does not exist');
    if (isValidationTrap) {
      const invalid = new RouterOsInvalidMangleRuleError(
        error instanceof Error ? error.message : 'Regla Mangle inválida.',
      );
      return {
        errorCode: 'ROUTEROS_INVALID_MANGLE_RULE',
        errorMessage: invalid.message,
        outcome: 'permanentFailure',
      };
    }

    // La regla se resolvio y desaparecio antes de que el comando llegara a ejecutarse, o el
    // destino de un `/move` ya no existe.
    if (message.includes('no such item')) {
      return {
        errorCode: 'ROUTEROS_MANGLE_RULE_NOT_FOUND',
        errorMessage: error instanceof Error ? error.message : 'Regla Mangle no encontrada en el router.',
        outcome: 'permanentFailure',
      };
    }

    if (message.includes('already have such entry')) {
      return {
        errorCode: 'ROUTEROS_MANGLE_RULE_CONFLICT',
        errorMessage: error instanceof Error ? error.message : 'La regla Mangle ya existe en el router.',
        outcome: 'permanentFailure',
      };
    }

    // Incluye el `failure` pelado: sin mas evidencia no se clasifica.
    return this.mapGenericExecutionError(error);
  }
}
