import type { ActualStateReader } from '../../application/ports/synchronization/actual-state-reader.port.js';
import type { RouterConnectionResolverPort } from '../../application/ports/provisioning/routeros/router-connection-resolver.port.js';
import type {
  RouterOsAddressListEntry,
  RouterOsClientFactoryPort,
  RouterOsClientPort,
  RouterOsFilterRule,
  RouterOsMangleRule,
  RouterOsNatRule,
  RouterOsSimpleQueue,
} from '../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { SecretProviderPort } from '../../application/ports/provisioning/routeros/secret-provider.port.js';
import type { NormalizedResourceRecord } from '../../domain/synchronization/normalized-resource-record.js';
import type { SyncResourceType } from '../../domain/synchronization/sync-resource-type.js';
import { RouterConnectionError } from './errors/router-connection.error.js';
import { RULE_FIELD_NAMES } from './rule-field-names.js';

function pickRuleFields<T extends object>(rule: T, fieldNames: readonly string[]): Record<string, string> {
  const source = rule as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const key of fieldNames) {
    const value = source[key];
    if (value !== undefined) {
      fields[key] = String(value);
    }
  }
  return fields;
}

function normalizeSimpleQueue(queue: RouterOsSimpleQueue): NormalizedResourceRecord {
  return {
    disabled: queue.disabled,
    fields: { comment: queue.comment ?? '', maxLimit: queue.maxLimit, target: queue.target },
    reference: queue.name,
  };
}

/**
 * Una entrada `dynamic=true` la gobierna RouterOS: la genera una regla
 * `add-src-to-address-list`, la resolución de un nombre de dominio o un `timeout`. No se
 * guarda en la configuración y desaparece sola.
 *
 * Queda fuera del estado real por completo. Incluirla la haría aparecer como `unexpected`
 * —CuzoNet nunca puede haberla deseado— sugiriendo una divergencia que no existe, y
 * contradiría al aprovisionamiento, que ya se niega a tocar estas entradas.
 */
function isManageableAddressListEntry(entry: RouterOsAddressListEntry): boolean {
  return !entry.dynamic;
}

/**
 * A diferencia de las reglas de firewall, una entrada de address-list SÍ tiene clave
 * natural estable (`list:address`), presente por igual en el router y en el historial de
 * aprovisionamiento. No necesita un marcador en el comentario para recuperar su identidad:
 * `unexpected` ya significa exactamente "existe en el router y CuzoNet nunca la provisionó".
 * Por eso `comment` puede compararse como campo de usuario, cosa que en las reglas no se
 * hace porque ahí el comentario carga el marcador técnico.
 */
function normalizeAddressListEntry(entry: RouterOsAddressListEntry): NormalizedResourceRecord {
  return {
    disabled: entry.disabled,
    fields: { comment: entry.comment ?? '' },
    reference: `${entry.list}:${entry.address}`,
  };
}

/**
 * A rule with no CuzoNet reference marker in its comment was never
 * provisioned by CuzoNet — it is unconditionally "unexpected". Since it has
 * no stable business identity, its RouterOS ".id" is used as a synthetic
 * reference; unlike CuzoNet-managed rules, this identity is not guaranteed
 * stable across router exports/restores.
 */
function ruleReferenceOrSynthetic(rule: { readonly id: string; readonly ruleReference?: string }): string {
  return rule.ruleReference ?? `unmanaged:${rule.id}`;
}

function normalizeFilterRule(rule: RouterOsFilterRule): NormalizedResourceRecord {
  return {
    disabled: rule.disabled,
    fields: pickRuleFields(rule, RULE_FIELD_NAMES['filter-rule']),
    reference: ruleReferenceOrSynthetic(rule),
  };
}

function normalizeNatRule(rule: RouterOsNatRule): NormalizedResourceRecord {
  return {
    disabled: rule.disabled,
    fields: pickRuleFields(rule, RULE_FIELD_NAMES['nat-rule']),
    reference: ruleReferenceOrSynthetic(rule),
  };
}

function normalizeMangleRule(rule: RouterOsMangleRule): NormalizedResourceRecord {
  return {
    disabled: rule.disabled,
    fields: pickRuleFields(rule, RULE_FIELD_NAMES['mangle-rule']),
    reference: ruleReferenceOrSynthetic(rule),
  };
}

export class RouterOsActualStateReader implements ActualStateReader {
  public constructor(
    private readonly connectionResolver: RouterConnectionResolverPort,
    private readonly secretProvider: SecretProviderPort,
    private readonly clientFactory: RouterOsClientFactoryPort,
  ) {}

  public async readActualState(
    companyId: string,
    routerId: string,
    resourceType: SyncResourceType,
  ): Promise<readonly NormalizedResourceRecord[]> {
    const client = await this.connect(companyId, routerId);
    try {
      switch (resourceType) {
        case 'simple-queue':
          return (await client.listSimpleQueues()).map(normalizeSimpleQueue);
        case 'address-list-entry':
          return (await client.listAddressListEntries())
            .filter(isManageableAddressListEntry)
            .map(normalizeAddressListEntry);
        case 'filter-rule':
          return (await client.listFilterRules()).map(normalizeFilterRule);
        case 'nat-rule':
          return (await client.listNatRules()).map(normalizeNatRule);
        case 'mangle-rule':
          return (await client.listMangleRules()).map(normalizeMangleRule);
      }
    } finally {
      await client.close().catch(() => {
        // Ignore close errors
      });
    }
  }

  private async connect(companyId: string, routerId: string): Promise<RouterOsClientPort> {
    const profile = await this.connectionResolver.resolve(companyId, routerId);
    if (!profile) {
      throw new RouterConnectionError('Router no encontrado o perfil incompleto.');
    }
    const secret = await this.secretProvider.getSecret(profile.secretReference);
    if (secret === null) {
      throw new RouterConnectionError('Secreto no encontrado.');
    }
    return this.clientFactory.create(profile, secret);
  }
}
