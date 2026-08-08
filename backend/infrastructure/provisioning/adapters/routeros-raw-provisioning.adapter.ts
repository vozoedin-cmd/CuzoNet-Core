import type {
  ProvisioningActionInput,
  ProvisioningActionResult,
} from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';
import type { RouterConnectionResolverPort } from '../../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  ObservedRawRule,
  RouterOsRawRuleCreateData,
  RouterOsRawRuleUpdateData,
} from '../../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../../application/ports/provisioning/routeros/secret-provider.port.js';
import { FirewallAddressSpec } from '../../../domain/provisioning/routeros/value-objects/firewall-address-spec.js';
import { InterfaceName } from '../../../domain/provisioning/routeros/value-objects/interface-name.js';
import { PortSpecification } from '../../../domain/provisioning/routeros/value-objects/port-specification.js';
import { Protocol } from '../../../domain/provisioning/routeros/value-objects/protocol.js';
import { RawAction } from '../../../domain/provisioning/routeros/value-objects/raw-action.js';
import { RawChain } from '../../../domain/provisioning/routeros/value-objects/raw-chain.js';
import { RawRuleComment } from '../../../domain/provisioning/routeros/value-objects/raw-rule-comment.js';
import { RawRuleReference } from '../../../domain/provisioning/routeros/value-objects/raw-rule-reference.js';
import { RouterOsInvalidRawRuleError } from '../../../domain/provisioning/routeros/errors/routeros-invalid-raw-rule.error.js';
import { RouterOsRawRuleAmbiguousError } from '../../../domain/provisioning/routeros/errors/routeros-raw-rule-ambiguous.error.js';
import { RouterOsRawRuleConflictError } from '../../../domain/provisioning/routeros/errors/routeros-raw-rule-conflict.error.js';
import { RouterOsRawRuleDynamicError } from '../../../domain/provisioning/routeros/errors/routeros-raw-rule-dynamic.error.js';
import { RouterOsRawRuleNotFoundError } from '../../../domain/provisioning/routeros/errors/routeros-raw-rule-not-found.error.js';
import { RouterOsRawRuleOwnershipError } from '../../../domain/provisioning/routeros/errors/routeros-raw-rule-ownership.error.js';
import { RouterOsRawRulePostconditionError } from '../../../domain/provisioning/routeros/errors/routeros-raw-rule-postcondition.error.js';
import {
  findRawRuleCoherenceViolation,
  routerOsRawRuleInputSchema,
  type RouterOsRawRuleAddInput,
  type RouterOsRawRuleDisableInput,
  type RouterOsRawRuleEnableInput,
  type RouterOsRawRuleInput,
  type RouterOsRawRuleMoveInput,
  type RouterOsRawRuleRemoveInput,
  type RouterOsRawRuleUpdateInput,
} from '../routeros/routeros-raw-rule.input.js';
import { RouterOsProvisioningAdapterBase } from './routeros-provisioning-adapter.base.js';
import { resolveMoveTarget, resolvePlaceBeforeId } from './routeros-rule-ordering.util.js';

type MutableRawRuleUpdateData = {
  -readonly [K in keyof RouterOsRawRuleUpdateData]: RouterOsRawRuleUpdateData[K];
};

interface DesiredRawRuleFields {
  readonly action: string;
  readonly addressList: string | undefined;
  readonly addressListTimeout: string | undefined;
  readonly chain: string;
  readonly disabled: boolean;
  readonly dstAddress: string | undefined;
  readonly dstAddressList: string | undefined;
  readonly dstPort: string | undefined;
  readonly inInterface: string | undefined;
  readonly jumpTarget: string | undefined;
  readonly log: boolean | undefined;
  readonly logPrefix: string | undefined;
  readonly outInterface: string | undefined;
  readonly packetMark: string | undefined;
  readonly protocol: string | undefined;
  readonly srcAddress: string | undefined;
  readonly srcAddressList: string | undefined;
  readonly srcPort: string | undefined;
  readonly tcpFlags: string | undefined;
}

/**
 * Aprovisionamiento de `/ip/firewall/raw`, construido sobre el contrato observado en la
 * Fase 0-bis. `notrack` queda fuera: es capacidad no certificada.
 */
export class RouterOsRawProvisioningAdapter extends RouterOsProvisioningAdapterBase<RouterOsRawRuleInput> {
  protected readonly referenceMetadataKey = 'ruleReference';

  public constructor(
    type: string,
    connectionResolver: RouterConnectionResolverPort,
    secretProvider: SecretProviderPort,
    clientFactory: RouterOsClientFactoryPort,
  ) {
    super(type, routerOsRawRuleInputSchema, connectionResolver, secretProvider, clientFactory);
  }

  /**
   * El sobre de la solicitud y su carga util viajan por separado y pueden contradecirse. La
   * comprobacion vive en `findRawRuleCoherenceViolation`, aislada y probada desde la Fase 1.
   */
  public override async execute(input: ProvisioningActionInput): Promise<ProvisioningActionResult> {
    const violation = findRawRuleCoherenceViolation(input);
    if (violation) {
      return { ...violation, outcome: 'permanentFailure' };
    }
    return super.execute(input);
  }

  protected executeOperation(client: RouterOsClientPort, command: RouterOsRawRuleInput): Promise<string | undefined> {
    switch (command.actionType) {
      case 'routeros.firewall.raw.add':
        return this.handleAdd(client, command);
      case 'routeros.firewall.raw.update':
        return this.handleUpdate(client, command);
      case 'routeros.firewall.raw.move':
        return this.handleMove(client, command);
      case 'routeros.firewall.raw.enable':
        return this.handleEnable(client, command);
      case 'routeros.firewall.raw.disable':
        return this.handleDisable(client, command);
      case 'routeros.firewall.raw.remove':
        return this.handleRemove(client, command);
    }
  }

  private async handleAdd(client: RouterOsClientPort, command: RouterOsRawRuleAddInput): Promise<string> {
    const ruleReference = RawRuleReference.create(command.ruleReference);
    const desired = this.buildDesiredFields(command);
    this.assertCoherent(desired.action, desired);
    const comment = RawRuleComment.create(ruleReference, command.comment);

    const existing = await this.resolveSingle(client, ruleReference.value);
    if (existing) {
      this.assertOwned(existing, ruleReference.value);
      // Una regla dinamica ocupa la referencia pero no es administrable: no puede
      // considerarse idempotencia (desapareceria sola) ni conflicto resoluble.
      this.assertNotDynamic(existing, ruleReference.value);
      if (this.isEquivalent(existing, desired)) {
        return ruleReference.value; // Idempotent success
      }
      throw new RouterOsRawRuleConflictError(
        `Conflicto: ya existe una regla Raw con la referencia ${ruleReference.value} y configuración distinta.`,
      );
    }

    const placeBeforeId =
      command.position === undefined ? undefined : resolvePlaceBeforeId(await client.listRawRules(), command.position);

    const createData: RouterOsRawRuleCreateData = {
      action: desired.action,
      ...(desired.addressList !== undefined ? { addressList: desired.addressList } : {}),
      ...(desired.addressListTimeout !== undefined ? { addressListTimeout: desired.addressListTimeout } : {}),
      chain: desired.chain,
      comment: comment.value,
      disabled: desired.disabled,
      ...(desired.dstAddress !== undefined ? { dstAddress: desired.dstAddress } : {}),
      ...(desired.dstAddressList !== undefined ? { dstAddressList: desired.dstAddressList } : {}),
      ...(desired.dstPort !== undefined ? { dstPort: desired.dstPort } : {}),
      ...(desired.inInterface !== undefined ? { inInterface: desired.inInterface } : {}),
      ...(desired.jumpTarget !== undefined ? { jumpTarget: desired.jumpTarget } : {}),
      ...(desired.log !== undefined ? { log: desired.log } : {}),
      ...(desired.logPrefix !== undefined ? { logPrefix: desired.logPrefix } : {}),
      ...(desired.outInterface !== undefined ? { outInterface: desired.outInterface } : {}),
      ...(desired.packetMark !== undefined ? { packetMark: desired.packetMark } : {}),
      ...(placeBeforeId !== undefined ? { placeBeforeId } : {}),
      ...(desired.protocol !== undefined ? { protocol: desired.protocol } : {}),
      ...(desired.srcAddress !== undefined ? { srcAddress: desired.srcAddress } : {}),
      ...(desired.srcAddressList !== undefined ? { srcAddressList: desired.srcAddressList } : {}),
      ...(desired.srcPort !== undefined ? { srcPort: desired.srcPort } : {}),
      ...(desired.tcpFlags !== undefined ? { tcpFlags: desired.tcpFlags } : {}),
    };
    await client.createRawRule(createData);
    await this.assertExactlyOneEquivalentAfterCreate(client, ruleReference.value, desired);
    return ruleReference.value;
  }

  private async handleUpdate(client: RouterOsClientPort, command: RouterOsRawRuleUpdateInput): Promise<string> {
    const ruleReference = RawRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);
    this.assertOwned(existing, ruleReference.value);
    this.assertNotDynamic(existing, ruleReference.value);

    // La coherencia solo se puede juzgar con el estado observado delante: la accion puede
    // venir del payload y su acompanante de la regla que ya esta en el router.
    const resultingAction = command.action !== undefined ? RawAction.create(command.action).value : existing.action;
    this.assertCoherent(resultingAction, {
      addressList: command.addressList !== undefined ? command.addressList : existing.addressList,
      jumpTarget: command.jumpTarget !== undefined ? command.jumpTarget : existing.jumpTarget,
    });

    const updateData: MutableRawRuleUpdateData = {};
    if (command.chain !== undefined) {
      const chain = RawChain.create(command.chain).value;
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
    if (command.srcAddressList !== undefined && command.srcAddressList !== (existing.srcAddressList ?? '')) {
      updateData.srcAddressList = command.srcAddressList;
    }
    if (command.dstAddressList !== undefined && command.dstAddressList !== (existing.dstAddressList ?? '')) {
      updateData.dstAddressList = command.dstAddressList;
    }
    if (command.tcpFlags !== undefined && command.tcpFlags !== (existing.tcpFlags ?? '')) {
      updateData.tcpFlags = command.tcpFlags;
    }
    if (command.packetMark !== undefined && command.packetMark !== (existing.packetMark ?? '')) {
      updateData.packetMark = command.packetMark;
    }
    if (command.jumpTarget !== undefined && command.jumpTarget !== (existing.jumpTarget ?? '')) {
      updateData.jumpTarget = command.jumpTarget;
    }
    if (command.addressList !== undefined && command.addressList !== (existing.addressList ?? '')) {
      updateData.addressList = command.addressList;
    }
    if (command.addressListTimeout !== undefined && command.addressListTimeout !== (existing.addressListTimeout ?? '')) {
      updateData.addressListTimeout = command.addressListTimeout;
    }
    if (command.logPrefix !== undefined && command.logPrefix !== (existing.logPrefix ?? '')) {
      updateData.logPrefix = command.logPrefix;
    }
    // `log` ausente en la regla observada significa `false`: el router omite el campo cuando
    // no esta activo. Comparar contra `?? false` evita reenviar un `no` que ya se cumple.
    if (command.log !== undefined && command.log !== (existing.log ?? false)) {
      updateData.log = command.log;
    }
    if (command.disabled !== undefined && command.disabled !== existing.disabled) {
      updateData.disabled = command.disabled;
    }
    if (command.comment !== undefined) {
      const comment = RawRuleComment.create(ruleReference, command.comment).value;
      if (comment !== (existing.comment ?? '')) updateData.comment = comment;
    }

    if (Object.keys(updateData).length === 0) {
      return ruleReference.value; // Idempotent success: nothing changed
    }

    await client.updateRawRule({ kind: 'id', id: existing.id }, updateData);
    return ruleReference.value;
  }

  private async handleMove(client: RouterOsClientPort, command: RouterOsRawRuleMoveInput): Promise<string> {
    const ruleReference = RawRuleReference.create(command.ruleReference);
    const existing = await this.findOrThrow(client, ruleReference.value);
    this.assertOwned(existing, ruleReference.value);
    this.assertNotDynamic(existing, ruleReference.value);

    const rules = await client.listRawRules();
    const target = resolveMoveTarget(rules, existing.id, command.position);
    if (target.alreadyAtPosition) {
      return ruleReference.value; // Idempotent success: already at the desired position
    }

    await client.moveRawRule(
      { kind: 'id', id: existing.id },
      target.placeBeforeId !== undefined ? { placeBeforeId: target.placeBeforeId } : {},
    );
    return ruleReference.value;
  }

  private async handleEnable(client: RouterOsClientPort, command: RouterOsRawRuleEnableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    this.assertOwned(existing, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    if (!existing.disabled) {
      return command.ruleReference; // Idempotent success: already enabled
    }
    await client.enableRawRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async handleDisable(client: RouterOsClientPort, command: RouterOsRawRuleDisableInput): Promise<string> {
    const existing = await this.findOrThrow(client, command.ruleReference);
    this.assertOwned(existing, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    if (existing.disabled) {
      return command.ruleReference; // Idempotent success: already disabled
    }
    await client.disableRawRule({ kind: 'id', id: existing.id });
    return command.ruleReference;
  }

  private async handleRemove(client: RouterOsClientPort, command: RouterOsRawRuleRemoveInput): Promise<string> {
    const existing = await this.resolveSingle(client, command.ruleReference);
    if (!existing) {
      return command.ruleReference; // Idempotent success: already gone
    }
    this.assertOwned(existing, command.ruleReference);
    this.assertNotDynamic(existing, command.ruleReference);
    await client.removeRawRule({ kind: 'id', id: existing.id });
    await this.assertAbsentAfterRemove(client, command.ruleReference);
    return command.ruleReference;
  }

  private async findOrThrow(client: RouterOsClientPort, ruleReference: string): Promise<ObservedRawRule> {
    const existing = await this.resolveSingle(client, ruleReference);
    if (!existing) {
      throw new RouterOsRawRuleNotFoundError(`Regla Raw no encontrada para la referencia: ${ruleReference}`);
    }
    return existing;
  }

  /**
   * Resuelve una referencia administrada exigiendo como maximo una coincidencia. RouterOS no
   * impone unicidad sobre el marcador del comentario, y en Raw quedarse con la primera es
   * especialmente danino: estas reglas deciden que trafico entra al connection tracking.
   */
  private async resolveSingle(client: RouterOsClientPort, ruleReference: string): Promise<ObservedRawRule | null> {
    const matches = await client.findRawRulesByReference(ruleReference);
    if (matches.length > 1) {
      throw new RouterOsRawRuleAmbiguousError(
        `La referencia ${ruleReference} resuelve a ${matches.length} reglas Raw en el router ` +
          `(${matches.map((rule) => rule.id).join(', ')}). No se opera sobre una eleccion ` +
          'arbitraria: resuelva la duplicidad en el router antes de reintentar.',
      );
    }
    return matches[0] ?? null;
  }

  /** Ver `RouterOsRawRuleOwnershipError` para por que la guarda es defensiva y aun asi se exige. */
  private assertOwned(rule: ObservedRawRule, ruleReference: string): void {
    if (rule.ownership.status === 'valid') {
      return;
    }
    throw new RouterOsRawRuleOwnershipError(
      `La regla Raw ${rule.id} resuelta para ${ruleReference} tiene ownership ` +
        `"${rule.ownership.status}" y no la administra CuzoNet. No se modifican reglas ` +
        'ajenas ni se reclama su propiedad de forma implicita.',
    );
  }

  /** Las reglas `dynamic=true` las gobierna RouterOS. La guarda corta antes de enviar comando alguno. */
  private assertNotDynamic(rule: ObservedRawRule, ruleReference: string): void {
    if (!rule.dynamic) {
      return;
    }
    throw new RouterOsRawRuleDynamicError(
      `La regla Raw ${ruleReference} (${rule.id}) es dinamica y la administra RouterOS, no ` +
        'CuzoNet. Las reglas dinamicas no se pueden crear, modificar, mover, habilitar, ' +
        'deshabilitar ni eliminar desde el aprovisionamiento.',
    );
  }

  /**
   * Coherencia accion/acompanante observada en la Fase 0-bis: `jump` sin `jump-target` y
   * `add-*-to-address-list` sin `address-list` producen reglas que el router acepta y que no
   * hacen nada util.
   */
  private assertCoherent(
    action: string,
    companions: { addressList: string | undefined; jumpTarget: string | undefined },
  ): void {
    const requiredField = RawAction.create(action).requiredCompanionField();
    if (requiredField !== null && (companions[requiredField] === undefined || companions[requiredField]!.length === 0)) {
      throw new RouterOsInvalidRawRuleError(`La acción "${action}" requiere especificar ${requiredField}.`);
    }
  }

  /**
   * Postcondicion de `create`: releer y confirmar que la referencia quedo en exactamente una
   * regla Y que esa regla es la pedida. Cero significa que el router acepto el comando pero
   * no persistio nada; dos o mas, que se creo un duplicado y toda operacion posterior sobre
   * esa referencia seria ambigua.
   */
  private async assertExactlyOneEquivalentAfterCreate(
    client: RouterOsClientPort,
    ruleReference: string,
    desired: DesiredRawRuleFields,
  ): Promise<void> {
    const matches = await client.findRawRulesByReference(ruleReference);
    if (matches.length !== 1) {
      throw new RouterOsRawRulePostconditionError(
        matches.length === 0
          ? `El router acepto la creacion de la regla Raw ${ruleReference} pero no existe al releer.`
          : `La creacion de la regla Raw ${ruleReference} dejo ${matches.length} reglas con la ` +
            `misma referencia (${matches.map((rule) => rule.id).join(', ')}).`,
      );
    }
    const created = matches[0]!;
    if (!this.isEquivalent(created, desired)) {
      throw new RouterOsRawRulePostconditionError(
        `El router acepto la creacion de la regla Raw ${ruleReference} (${created.id}) pero al ` +
          'releer no coincide con lo solicitado.',
      );
    }
  }

  /** Postcondicion de `remove`: releer y confirmar que no queda ninguna regla con la referencia. */
  private async assertAbsentAfterRemove(client: RouterOsClientPort, ruleReference: string): Promise<void> {
    const matches = await client.findRawRulesByReference(ruleReference);
    if (matches.length === 0) {
      return;
    }
    throw new RouterOsRawRulePostconditionError(
      `El router acepto la eliminacion de la regla Raw ${ruleReference} pero al releer siguen ` +
        `existiendo ${matches.length} reglas con esa referencia ` +
        `(${matches.map((rule) => rule.id).join(', ')}).`,
    );
  }

  private buildDesiredFields(command: RouterOsRawRuleAddInput): DesiredRawRuleFields {
    return {
      action: RawAction.create(command.action).value,
      addressList: command.addressList,
      addressListTimeout: command.addressListTimeout,
      chain: RawChain.create(command.chain).value,
      disabled: command.disabled ?? false,
      dstAddress: command.dstAddress === undefined ? undefined : FirewallAddressSpec.create(command.dstAddress).value,
      dstAddressList: command.dstAddressList,
      dstPort: command.dstPort === undefined ? undefined : PortSpecification.create(command.dstPort).value,
      inInterface: command.inInterface === undefined ? undefined : InterfaceName.create(command.inInterface).value,
      jumpTarget: command.jumpTarget,
      log: command.log,
      logPrefix: command.logPrefix,
      outInterface: command.outInterface === undefined ? undefined : InterfaceName.create(command.outInterface).value,
      packetMark: command.packetMark,
      protocol: command.protocol === undefined ? undefined : Protocol.create(command.protocol).value,
      srcAddress: command.srcAddress === undefined ? undefined : FirewallAddressSpec.create(command.srcAddress).value,
      srcAddressList: command.srcAddressList,
      srcPort: command.srcPort === undefined ? undefined : PortSpecification.create(command.srcPort).value,
      tcpFlags: command.tcpFlags,
    };
  }

  /**
   * Compara la regla observada con la deseada.
   *
   * `log` se compara contra `false` en AMBOS lados. La sonda de la Fase 0-bis comprobo que el
   * router omite el campo cuando no esta activo, incluso pidiendolo por `.proplist`, asi que
   * su ausencia significa `false` tanto en lo observado como en lo pedido. Es la simetria que
   * a Mangle le faltaba con `passthrough` —alli la ausencia en el deseado significaba el
   * default `true` del router, y compararla contra `undefined` producia conflictos falsos.
   */
  private isEquivalent(existing: ObservedRawRule, desired: DesiredRawRuleFields): boolean {
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
      (existing.srcAddressList ?? '') === (desired.srcAddressList ?? '') &&
      (existing.dstAddressList ?? '') === (desired.dstAddressList ?? '') &&
      (existing.tcpFlags ?? '') === (desired.tcpFlags ?? '') &&
      (existing.packetMark ?? '') === (desired.packetMark ?? '') &&
      (existing.log ?? false) === (desired.log ?? false) &&
      (existing.logPrefix ?? '') === (desired.logPrefix ?? '') &&
      (existing.jumpTarget ?? '') === (desired.jumpTarget ?? '') &&
      (existing.addressList ?? '') === (desired.addressList ?? '') &&
      (existing.addressListTimeout ?? '') === (desired.addressListTimeout ?? '') &&
      existing.disabled === desired.disabled
    );
  }

  protected override additionalLogFields(command: RouterOsRawRuleInput): Record<string, unknown> {
    return {
      ruleReference: command.ruleReference,
      ...('chain' in command && command.chain !== undefined ? { chain: command.chain } : {}),
    };
  }

  protected override mapExecutionError(error: unknown): ProvisioningActionResult {
    if (error instanceof RouterOsRawRuleConflictError) {
      return { errorCode: 'ROUTEROS_RAW_RULE_CONFLICT', errorMessage: error.message, outcome: 'permanentFailure' };
    }
    if (error instanceof RouterOsRawRuleAmbiguousError) {
      return { errorCode: 'ROUTEROS_RAW_RULE_AMBIGUOUS', errorMessage: error.message, outcome: 'permanentFailure' };
    }
    if (error instanceof RouterOsRawRuleDynamicError) {
      return { errorCode: 'ROUTEROS_RAW_RULE_DYNAMIC', errorMessage: error.message, outcome: 'permanentFailure' };
    }
    if (error instanceof RouterOsRawRulePostconditionError) {
      return {
        errorCode: 'ROUTEROS_RAW_RULE_POSTCONDITION_FAILED',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsRawRuleOwnershipError) {
      return {
        errorCode: 'ROUTEROS_RAW_RULE_OWNERSHIP_VIOLATION',
        errorMessage: error.message,
        outcome: 'permanentFailure',
      };
    }
    if (error instanceof RouterOsRawRuleNotFoundError) {
      return { errorCode: 'ROUTEROS_RAW_RULE_NOT_FOUND', errorMessage: error.message, outcome: 'permanentFailure' };
    }
    if (error instanceof RouterOsInvalidRawRuleError) {
      return { errorCode: 'ROUTEROS_INVALID_RAW_RULE', errorMessage: error.message, outcome: 'permanentFailure' };
    }
    return this.mapTrapError(error);
  }

  /**
   * Traduce el `!trap` de RouterOS a partir de los mensajes CERTIFICADOS en la Fase 3, no de
   * heuristicas. Se reconoce solo lo fijado por la suite de wire protocol; el resto cae al
   * fallback `ROUTEROS_EXECUTION_FAILED`, que es la respuesta honesta ante lo no observado.
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
      return {
        errorCode: 'ROUTEROS_INVALID_RAW_RULE',
        errorMessage: error instanceof Error ? error.message : 'Regla Raw inválida.',
        outcome: 'permanentFailure',
      };
    }

    if (message.includes('no such item')) {
      return {
        errorCode: 'ROUTEROS_RAW_RULE_NOT_FOUND',
        errorMessage: error instanceof Error ? error.message : 'Regla Raw no encontrada en el router.',
        outcome: 'permanentFailure',
      };
    }

    if (message.includes('already have such entry')) {
      return {
        errorCode: 'ROUTEROS_RAW_RULE_CONFLICT',
        errorMessage: error instanceof Error ? error.message : 'La regla Raw ya existe en el router.',
        outcome: 'permanentFailure',
      };
    }

    // Incluye el `failure` pelado: sin mas evidencia no se clasifica.
    return this.mapGenericExecutionError(error);
  }
}
