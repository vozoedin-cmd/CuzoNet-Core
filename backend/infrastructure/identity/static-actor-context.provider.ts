import type { ActorContext } from '../../application/ports/provisioning/actor-context.port.js';
import type { AutomationActorContext } from '../../application/ports/automation/automation-actor-context.port.js';
import type { BillingActorContext } from '../../application/ports/billing/billing-actor-context.port.js';
import { environment } from '../config/environment.js';

/**
 * Temporary ActorContext implementation used while the platform has no
 * authentication layer (see ADR-012). Resolves the acting identity from
 * configuration (`SYSTEM_ACTOR_ID`) instead of a literal hardcoded at each
 * call site, so a future session-derived ActorContext only needs to replace
 * this single provider, not every wiring point.
 */
export class StaticActorContextProvider
  implements ActorContext, AutomationActorContext, BillingActorContext
{
  public constructor(private readonly actorId: string) {}

  public getActorId(): string {
    return this.actorId;
  }
}

export function createSystemActorContextProvider(): StaticActorContextProvider {
  return new StaticActorContextProvider(environment.SYSTEM_ACTOR_ID);
}
