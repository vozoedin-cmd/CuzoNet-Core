import type { RouterConnectionProfile } from './router-connection-resolver.port.js';

export interface RouterOsSimpleQueueReference {
  readonly id?: string;
  readonly name?: string;
}

export interface RouterOsSimpleQueue {
  readonly comment?: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly maxLimit: string;
  readonly name: string;
  readonly target: string;
}

export interface RouterOsSimpleQueueCreateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly maxLimit: string;
  readonly name: string;
  readonly target: string;
}

export interface RouterOsSimpleQueueUpdateData {
  readonly comment?: string;
  readonly maxLimit?: string;
  readonly name?: string;
  readonly target?: string;
}

export interface RouterOsPppoeSecretReference {
  readonly id?: string;
  readonly name?: string;
}

export interface RouterOsPppoeSecret {
  readonly comment?: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly name: string;
  readonly password?: string;
  readonly profile: string;
  readonly service: string;
}

export interface RouterOsPppoeSecretCreateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly name: string;
  readonly password?: string;
  readonly profile: string;
  readonly service?: string;
}

export interface RouterOsPppoeSecretUpdateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly name?: string;
  readonly password?: string;
  readonly profile?: string;
  readonly service?: string;
}

export interface RouterOsHotspotUserReference {
  readonly id?: string;
  readonly name?: string;
}

/**
 * NOTA: `shared-users` NO forma parte de /ip/hotspot/user — es una propiedad de
 * /ip/hotspot/user/profile. Enviarla en /ip/hotspot/user/add hace que RouterOS
 * responda "unknown parameter shared-users". Su administración corresponde a un
 * futuro módulo de perfiles de Hotspot, no al usuario.
 */
export interface RouterOsHotspotUser {
  readonly comment?: string;
  readonly disabled: boolean;
  readonly id: string;
  readonly limitBytesTotal?: number;
  readonly limitUptime?: string;
  readonly name: string;
  readonly password?: string;
  readonly profile: string;
  readonly server?: string;
}

export interface RouterOsHotspotUserCreateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly limitBytesTotal?: number;
  readonly limitUptime?: string;
  readonly name: string;
  readonly password: string;
  readonly profile: string;
  readonly server?: string;
}

export interface RouterOsHotspotUserUpdateData {
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly limitBytesTotal?: number;
  readonly limitUptime?: string;
  readonly name?: string;
  readonly password?: string;
  readonly profile?: string;
  readonly server?: string;
}

export interface RouterOsHotspotUserProfileReference {
  readonly id?: string;
  readonly name?: string;
}

/**
 * Un Hotspot User Profile de RouterOS (/ip/hotspot/user/profile).
 *
 * `on-login`/`on-logout` quedan FUERA del contrato a propósito: son scripts RouterOS
 * multilínea (se observaron 5.7 KB / 132 líneas en un router real) que pueden contener
 * credenciales embebidas, y el guard SENSITIVE_KEYS de ProvisioningRequest solo inspecciona
 * claves, no valores — incluirlos persistiría secretos en inputSnapshotJson. Requieren una
 * estrategia de secretos propia antes de gestionarse.
 *
 * `disabled` tampoco existe: a diferencia de los usuarios, los perfiles no se
 * habilitan/deshabilitan.
 */
export interface RouterOsHotspotUserProfile {
  readonly addMacCookie?: boolean;
  readonly addressList?: string;
  readonly addressPool?: string;
  readonly id: string;
  /** Flag `default` de RouterOS: el perfil base del hotspot, protegido contra borrado. */
  readonly isDefault: boolean;
  readonly idleTimeout?: string;
  readonly keepaliveTimeout?: string;
  readonly macCookieTimeout?: string;
  readonly name: string;
  readonly rateLimit?: string;
  readonly sessionTimeout?: string;
  readonly sharedUsers?: string;
  readonly statusAutorefresh?: string;
  readonly transparentProxy?: boolean;
}

export interface RouterOsHotspotUserProfileCreateData {
  readonly addMacCookie?: boolean;
  readonly addressList?: string;
  readonly addressPool?: string;
  readonly idleTimeout?: string;
  readonly keepaliveTimeout?: string;
  readonly macCookieTimeout?: string;
  readonly name: string;
  readonly rateLimit?: string;
  readonly sessionTimeout?: string;
  readonly sharedUsers?: string;
  readonly statusAutorefresh?: string;
  readonly transparentProxy?: boolean;
}

export interface RouterOsHotspotUserProfileUpdateData {
  readonly addMacCookie?: boolean;
  readonly addressList?: string;
  readonly addressPool?: string;
  readonly idleTimeout?: string;
  readonly keepaliveTimeout?: string;
  readonly macCookieTimeout?: string;
  readonly name?: string;
  readonly rateLimit?: string;
  readonly sessionTimeout?: string;
  readonly sharedUsers?: string;
  readonly statusAutorefresh?: string;
  readonly transparentProxy?: boolean;
}

/**
 * Valores que RouterOS 7.21.4 asigna por defecto a un perfil recién creado. Verificados
 * empíricamente creando un perfil con solo `name` y leyéndolo de vuelta.
 *
 * Son necesarios para la idempotencia: cuando un comando OMITE un campo, RouterOS no lo
 * deja ausente sino que aplica estos valores. Comparar contra `undefined` produciría
 * conflictos falsos en cada reintento.
 *
 * `sessionTimeout`, `addressPool` y `rateLimit` NO tienen default: solo aparecen si se
 * configuran explícitamente.
 */
export const ROUTEROS_HOTSPOT_USER_PROFILE_DEFAULTS = {
  addMacCookie: true,
  addressList: '',
  idleTimeout: 'none',
  keepaliveTimeout: '2m',
  macCookieTimeout: '3d',
  sharedUsers: '1',
  statusAutorefresh: '1m',
  transparentProxy: false,
} as const;

export interface RouterOsAddressListEntryReference {
  readonly address?: string;
  readonly id?: string;
  readonly list?: string;
}

/**
 * Entrada de `/ip/firewall/address-list` en RouterOS 7.21.4.
 *
 * `creationTime` y `dynamic` son de SOLO LECTURA: los asigna el router, así que no
 * aparecen en los datos de creación ni de actualización.
 *
 * `timeout` no se modela a propósito. Fijarlo convierte la entrada en `dynamic=true` y
 * `/print` devuelve una cuenta regresiva en lugar del valor enviado, de modo que no es un
 * campo de configuración comparable. `dynamic` es lo que permite reconocer esas entradas.
 */
export interface RouterOsAddressListEntry {
  readonly address: string;
  readonly comment?: string;
  /** Marca de tiempo asignada por el router, p. ej. "2023-10-10 07:22:26". Solo lectura. */
  readonly creationTime?: string;
  readonly disabled: boolean;
  /**
   * `true` cuando la entrada la gobierna RouterOS: la genera una regla
   * `add-src-to-address-list`, la resolución de un nombre de dominio o un `timeout`.
   * No se guarda en la configuración y RouterOS rechaza deshabilitarla. Solo lectura.
   */
  readonly dynamic: boolean;
  readonly id: string;
  readonly list: string;
}

export interface RouterOsAddressListEntryCreateData {
  readonly address: string;
  readonly comment?: string;
  readonly disabled?: boolean;
  readonly list: string;
}

export interface RouterOsAddressListEntryUpdateData {
  readonly comment?: string;
  readonly disabled?: boolean;
}

/**
 * Clasificación del comentario de una regla de firewall respecto a la propiedad de CuzoNet:
 *
 * - `valid`: lleva el marcador `cuzonet:firewall-filter:<ruleReference>` legible. Es el
 *   único estado que aporta `ruleReference`, y por tanto el único resoluble.
 * - `malformed`: lleva el prefijo del marcador pero sin referencia utilizable detrás.
 * - `foreign`: lleva un marcador `cuzonet:` de otro recurso u otra instalación.
 * - `unmanaged`: sin comentario, o con uno que no pretende ser un marcador.
 *
 * Son exactamente los cuatro que `FilterRuleComment.parseOwnership` puede devolver.
 */
export type RouterOsFilterRuleOwnershipStatus = 'valid' | 'malformed' | 'foreign' | 'unmanaged';

export interface RouterOsFilterRuleOwnership {
  readonly status: RouterOsFilterRuleOwnershipStatus;
  readonly ruleReference?: string;
  readonly userComment?: string;
}

export interface ObservedFilterRule {
  readonly id: string;
  /**
   * Posición de la regla dentro del listado físicamente ordenado, contando desde 0.
   *
   * Solo está presente cuando la regla proviene de un listado completo
   * (`listFilterRules`, `findFilterRulesByReference`), que es lo único capaz de
   * determinarla. Una búsqueda por `.id` devuelve una sola fila y no puede saber qué
   * posición ocupa, así que omite el campo en lugar de inventar un valor.
   */
  readonly physicalIndex?: number;
  readonly dynamic: boolean;
  readonly invalid: boolean;
  readonly chain: string;
  readonly action: string;
  readonly comment?: string;
  readonly ownership: RouterOsFilterRuleOwnership;
  readonly disabled: boolean;
  readonly jumpTarget?: string;
  readonly rejectWith?: string;
  readonly hotspot?: string;
  readonly log: boolean;
  readonly logPrefix?: string;
  readonly addressList?: string;
  readonly protocol?: string;
  readonly srcAddress?: string;
  readonly dstAddress?: string;
  readonly srcPort?: string;
  readonly dstPort?: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  readonly connectionState?: string;
  readonly bytes: number;
  readonly packets: number;
}

export interface ManagedFilterRuleSpec {
  readonly chain: string;
  readonly action: string;
  readonly comment: string;
  readonly disabled?: boolean;
  readonly jumpTarget?: string;
  readonly rejectWith?: string;
  readonly hotspot?: string;
  readonly log?: boolean;
  readonly logPrefix?: string;
  readonly addressList?: string;
  readonly protocol?: string;
  readonly srcAddress?: string;
  readonly dstAddress?: string;
  readonly srcPort?: string;
  readonly dstPort?: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  readonly connectionState?: string;
}

export interface RouterOsFilterRuleIdLocator {
  readonly kind: 'id';
  readonly id: string;
}

export interface RouterOsFilterRuleReferenceLocator {
  readonly kind: 'managed-reference';
  readonly ruleReference: string;
}

export type RouterOsFilterRuleLocator = RouterOsFilterRuleIdLocator | RouterOsFilterRuleReferenceLocator;

export interface RouterOsFilterRuleCreateData extends ManagedFilterRuleSpec {
  /** .id of the existing rule this one should be inserted before; omit to append at the end. */
  readonly placeBeforeId?: string;
}

export type RouterOsFilterRuleUpdateData = Partial<ManagedFilterRuleSpec>;

export interface RouterOsFilterRuleMoveTarget {
  /** .id of the rule the moved rule should be inserted before; omit to move to the end. */
  readonly placeBeforeId?: string;
}

export interface RouterOsNatRuleReference {
  readonly id?: string;
  readonly ruleReference?: string;
}

export interface RouterOsNatRule {
  readonly action: string;
  readonly chain: string;
  readonly comment?: string;
  readonly connectionState?: string;
  readonly disabled: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly id: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  readonly protocol?: string;
  readonly ruleReference?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
  readonly toAddresses?: string;
  readonly toPorts?: string;
}

export interface RouterOsNatRuleCreateData {
  readonly action: string;
  readonly chain: string;
  readonly comment: string;
  readonly connectionState?: string;
  readonly disabled?: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  /** .id of the existing rule this one should be inserted before; omit to append at the end. */
  readonly placeBeforeId?: string;
  readonly protocol?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
  readonly toAddresses?: string;
  readonly toPorts?: string;
}

export interface RouterOsNatRuleUpdateData {
  readonly action?: string;
  readonly chain?: string;
  readonly comment?: string;
  readonly connectionState?: string;
  readonly disabled?: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly inInterface?: string;
  readonly outInterface?: string;
  readonly protocol?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
  readonly toAddresses?: string;
  readonly toPorts?: string;
}

export interface RouterOsNatRuleMoveTarget {
  /** .id of the rule the moved rule should be inserted before; omit to move to the end. */
  readonly placeBeforeId?: string;
}

export interface RouterOsMangleRuleReference {
  readonly id?: string;
  readonly ruleReference?: string;
}

export interface RouterOsMangleRule {
  readonly action: string;
  readonly chain: string;
  readonly comment?: string;
  readonly connectionMark?: string;
  readonly connectionState?: string;
  readonly disabled: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly id: string;
  readonly inInterface?: string;
  readonly newConnectionMark?: string;
  readonly newPacketMark?: string;
  readonly newRoutingMark?: string;
  readonly outInterface?: string;
  readonly packetMark?: string;
  readonly passthrough?: boolean;
  readonly protocol?: string;
  readonly routingMark?: string;
  readonly ruleReference?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
}

export interface RouterOsMangleRuleCreateData {
  readonly action: string;
  readonly chain: string;
  readonly comment: string;
  readonly connectionMark?: string;
  readonly connectionState?: string;
  readonly disabled?: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly inInterface?: string;
  readonly newConnectionMark?: string;
  readonly newPacketMark?: string;
  readonly newRoutingMark?: string;
  readonly outInterface?: string;
  readonly packetMark?: string;
  readonly passthrough?: boolean;
  /** .id of the existing rule this one should be inserted before; omit to append at the end. */
  readonly placeBeforeId?: string;
  readonly protocol?: string;
  readonly routingMark?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
}

export interface RouterOsMangleRuleUpdateData {
  readonly action?: string;
  readonly chain?: string;
  readonly comment?: string;
  readonly connectionMark?: string;
  readonly connectionState?: string;
  readonly disabled?: boolean;
  readonly dstAddress?: string;
  readonly dstPort?: string;
  readonly inInterface?: string;
  readonly newConnectionMark?: string;
  readonly newPacketMark?: string;
  readonly newRoutingMark?: string;
  readonly outInterface?: string;
  readonly packetMark?: string;
  readonly passthrough?: boolean;
  readonly protocol?: string;
  readonly routingMark?: string;
  readonly srcAddress?: string;
  readonly srcPort?: string;
}

export interface RouterOsMangleRuleMoveTarget {
  /** .id of the rule the moved rule should be inserted before; omit to move to the end. */
  readonly placeBeforeId?: string;
}

export interface RouterOsClientPort {
  close(): Promise<void>;

  createSimpleQueue(queue: RouterOsSimpleQueueCreateData): Promise<void>;
  disableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  enableSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  findSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<RouterOsSimpleQueue | null>;
  /** Full listing of all simple queues, used by the Synchronization Engine to detect queues CuzoNet never provisioned. */
  listSimpleQueues(): Promise<RouterOsSimpleQueue[]>;
  removeSimpleQueue(reference: RouterOsSimpleQueueReference): Promise<void>;
  updateSimpleQueue(reference: RouterOsSimpleQueueReference, data: RouterOsSimpleQueueUpdateData): Promise<void>;

  createPppoeSecret(secret: RouterOsPppoeSecretCreateData): Promise<void>;
  disablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void>;
  enablePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void>;
  findPppoeSecret(reference: RouterOsPppoeSecretReference): Promise<RouterOsPppoeSecret | null>;
  removePppoeSecret(reference: RouterOsPppoeSecretReference): Promise<void>;
  updatePppoeSecret(reference: RouterOsPppoeSecretReference, data: RouterOsPppoeSecretUpdateData): Promise<void>;

  createHotspotUser(user: RouterOsHotspotUserCreateData): Promise<void>;
  disableHotspotUser(reference: RouterOsHotspotUserReference): Promise<void>;
  enableHotspotUser(reference: RouterOsHotspotUserReference): Promise<void>;
  findHotspotUser(reference: RouterOsHotspotUserReference): Promise<RouterOsHotspotUser | null>;
  removeHotspotUser(reference: RouterOsHotspotUserReference): Promise<void>;
  updateHotspotUser(reference: RouterOsHotspotUserReference, data: RouterOsHotspotUserUpdateData): Promise<void>;

  createHotspotUserProfile(profile: RouterOsHotspotUserProfileCreateData): Promise<void>;
  findHotspotUserProfile(
    reference: RouterOsHotspotUserProfileReference,
  ): Promise<RouterOsHotspotUserProfile | null>;
  /** Full listing, for the Synchronization Engine and for auditing profiles CuzoNet never provisioned. */
  listHotspotUserProfiles(): Promise<RouterOsHotspotUserProfile[]>;
  removeHotspotUserProfile(reference: RouterOsHotspotUserProfileReference): Promise<void>;
  updateHotspotUserProfile(
    reference: RouterOsHotspotUserProfileReference,
    data: RouterOsHotspotUserProfileUpdateData,
  ): Promise<void>;

  createAddressListEntry(entry: RouterOsAddressListEntryCreateData): Promise<void>;
  disableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void>;
  enableAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void>;
  findAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<RouterOsAddressListEntry | null>;
  /**
   * Todas las entradas que coinciden con la referencia. `list`+`address` no garantiza
   * unicidad en un router real: aunque RouterOS 7.21.4 rechaza `/add` duplicados
   * (`already have such entry`), una configuración importada o creada por una versión
   * anterior sí puede contener duplicados — el router de laboratorio tiene uno. Quien
   * necesite operar sobre una entrada debe usar esto y exigir exactamente una coincidencia,
   * en vez de quedarse en silencio con la primera.
   */
  findAddressListEntries(reference: RouterOsAddressListEntryReference): Promise<RouterOsAddressListEntry[]>;
  /** Full listing of all address-list entries, used by the Synchronization Engine to detect entries CuzoNet never provisioned. */
  listAddressListEntries(): Promise<RouterOsAddressListEntry[]>;
  removeAddressListEntry(reference: RouterOsAddressListEntryReference): Promise<void>;
  updateAddressListEntry(
    reference: RouterOsAddressListEntryReference,
    data: RouterOsAddressListEntryUpdateData,
  ): Promise<void>;

  createFilterRule(rule: RouterOsFilterRuleCreateData): Promise<void>;
  disableFilterRule(locator: RouterOsFilterRuleLocator): Promise<void>;
  enableFilterRule(locator: RouterOsFilterRuleLocator): Promise<void>;
  findFilterRuleById(id: string): Promise<ObservedFilterRule | null>;
  findFilterRulesByReference(ruleReference: string): Promise<ObservedFilterRule[]>;
  /** Global, physically-ordered listing of all filter rules (across every chain), used to resolve position/move targets. */
  listFilterRules(): Promise<ObservedFilterRule[]>;
  moveFilterRule(locator: RouterOsFilterRuleLocator, target: RouterOsFilterRuleMoveTarget): Promise<void>;
  removeFilterRule(locator: RouterOsFilterRuleLocator): Promise<void>;
  updateFilterRule(locator: RouterOsFilterRuleLocator, data: RouterOsFilterRuleUpdateData): Promise<void>;

  createNatRule(rule: RouterOsNatRuleCreateData): Promise<void>;
  disableNatRule(reference: RouterOsNatRuleReference): Promise<void>;
  enableNatRule(reference: RouterOsNatRuleReference): Promise<void>;
  findNatRule(reference: RouterOsNatRuleReference): Promise<RouterOsNatRule | null>;
  /** Global, physically-ordered listing of all NAT rules (across srcnat and dstnat), used to resolve position/move targets. */
  listNatRules(): Promise<RouterOsNatRule[]>;
  moveNatRule(reference: RouterOsNatRuleReference, target: RouterOsNatRuleMoveTarget): Promise<void>;
  removeNatRule(reference: RouterOsNatRuleReference): Promise<void>;
  updateNatRule(reference: RouterOsNatRuleReference, data: RouterOsNatRuleUpdateData): Promise<void>;

  createMangleRule(rule: RouterOsMangleRuleCreateData): Promise<void>;
  disableMangleRule(reference: RouterOsMangleRuleReference): Promise<void>;
  enableMangleRule(reference: RouterOsMangleRuleReference): Promise<void>;
  findMangleRule(reference: RouterOsMangleRuleReference): Promise<RouterOsMangleRule | null>;
  /** Global, physically-ordered listing of all Mangle rules (across every chain), used to resolve position/move targets. */
  listMangleRules(): Promise<RouterOsMangleRule[]>;
  moveMangleRule(reference: RouterOsMangleRuleReference, target: RouterOsMangleRuleMoveTarget): Promise<void>;
  removeMangleRule(reference: RouterOsMangleRuleReference): Promise<void>;
  updateMangleRule(reference: RouterOsMangleRuleReference, data: RouterOsMangleRuleUpdateData): Promise<void>;
}

export interface RouterOsClientFactoryPort {
  create(profile: RouterConnectionProfile, secret: string): Promise<RouterOsClientPort>;
}
