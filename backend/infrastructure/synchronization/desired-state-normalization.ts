import { ROUTEROS_MANGLE_RULE_DEFAULTS } from '../../application/ports/provisioning/routeros/routeros-client.port.js';
import type { NormalizedFields } from '../../domain/synchronization/normalized-resource-record.js';
import type { SyncResourceType } from '../../domain/synchronization/sync-resource-type.js';

/**
 * Canonizacion del estado deseado y del real para que el comparador diffee dos formas
 * comparables.
 *
 * El comparador es agnostico de recurso: diffea `desired[k] ?? ''` contra `actual[k] ?? ''`.
 * Eso basta cuando ambos lados representan la misma configuracion de la misma manera, pero
 * RouterOS no siempre lo hace, y las dos desviaciones observadas necesitan tratamientos
 * OPUESTOS. Mezclarlas seria el error: por eso viven en tablas separadas.
 */

/**
 * DESVIACION 1 — campos que el router MATERIALIZA SIEMPRE y el deseado puede omitir.
 *
 * El estado real se lee del router, asi que un campo con default siempre llega con valor. El
 * deseado se declara y puede no mencionarlo, y la omision se leeria como cadena vacia: drift
 * permanente e irreparable, porque reaplicar la configuracion no cambia nada.
 *
 * `passthrough` de Mangle es el unico caso confirmado: la sonda de la Fase 0 lo devolvio en
 * el 100% de las reglas. Omitirlo significa "el default del router", no "sin valor".
 *
 * Raw NO tiene ningun campo aqui, y es deliberado: la sonda de la Fase 0-bis comprobo que
 * ningun booleano opcional se materializa en `/ip/firewall/raw`.
 */
const DESIRED_FIELD_DEFAULTS: Partial<Record<SyncResourceType, NormalizedFields>> = {
  'mangle-rule': { passthrough: String(ROUTEROS_MANGLE_RULE_DEFAULTS.passthrough) },
};

/**
 * DESVIACION 2 — campos booleanos que el router OMITE cuando son falsos.
 *
 * Es el reverso exacto de la tabla anterior. `log` de Raw desaparece de la respuesta cuando
 * no esta activo, incluso pidiendolo por `.proplist`, asi que "false" y "ausente" son EL
 * MISMO ESTADO. Una declaracion con `log=false` frente a un router que lo omite estaria
 * permanentemente en drift, y no habria forma de repararlo.
 *
 * Se canoniza quitando el `false`, no anadiendolo: la forma canonica es la del router
 * —presente significa true— y se aplica a AMBOS lados, de modo que tampoco importa si alguna
 * version de RouterOS decidiera devolver `log=false` explicitamente.
 *
 * No es un default: no inventa ningun valor que el router no tenga. Justamente por eso Raw
 * no aparece en `DESIRED_FIELD_DEFAULTS`.
 */
const OMITTED_WHEN_FALSE: Partial<Record<SyncResourceType, readonly string[]>> = {
  'raw-rule': ['log'],
};

/** Quita los booleanos en `false` que el router no devuelve, dejando la forma canonica del router. */
function dropFieldsRouterOmitsWhenFalse(resourceType: SyncResourceType, fields: NormalizedFields): NormalizedFields {
  const omitted = OMITTED_WHEN_FALSE[resourceType];
  if (omitted === undefined) {
    return fields;
  }
  const canonical: Record<string, string> = { ...fields };
  for (const field of omitted) {
    if (canonical[field] === 'false') {
      delete canonical[field];
    }
  }
  return canonical;
}

/**
 * Canoniza los campos DESEADOS: completa los defaults observados y quita los booleanos que
 * el router omite cuando son falsos. Un valor declarado siempre gana sobre un default.
 */
export function normalizeDesiredFields(resourceType: SyncResourceType, fields: NormalizedFields): NormalizedFields {
  const defaults = DESIRED_FIELD_DEFAULTS[resourceType];
  const withDefaults = defaults === undefined ? fields : { ...defaults, ...fields };
  return dropFieldsRouterOmitsWhenFalse(resourceType, withDefaults);
}

/**
 * Canoniza los campos REALES. Nunca se les aplican defaults —vienen del router, ya son la
 * verdad— pero si la misma supresion, para que un `false` explicito de alguna version futura
 * compare igual que la ausencia que hoy se observa.
 */
export function normalizeActualFields(resourceType: SyncResourceType, fields: NormalizedFields): NormalizedFields {
  return dropFieldsRouterOmitsWhenFalse(resourceType, fields);
}
