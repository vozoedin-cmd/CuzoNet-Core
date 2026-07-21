interface OrderedRouterOsRule {
  readonly id: string;
}

export interface ResolvedMoveTarget {
  /** True when the rule already sits immediately before the resolved target — the move would be a no-op. */
  readonly alreadyAtPosition: boolean;
  /** .id of the rule the moved rule should be placed before; undefined means "move to the end". */
  readonly placeBeforeId: string | undefined;
}

/**
 * Shared ordering logic for RouterOS resources that support positional
 * insertion and movement within a physically-ordered rule table (Filter
 * Rules, NAT). Both `resolvePlaceBeforeId` and `resolveMoveTarget` operate
 * purely on `.id`, independent of which resource's rule shape is used.
 */

/** Resolves the .id of the rule that should follow a brand-new insertion at `position` (undefined = append at the end). */
export function resolvePlaceBeforeId<T extends OrderedRouterOsRule>(
  rules: readonly T[],
  position: number,
): string | undefined {
  return rules[Math.min(position, rules.length)]?.id;
}

/** Resolves where an existing rule (identified by `ruleId`) should move to reach `desiredPosition`, and whether it is already there. */
export function resolveMoveTarget<T extends OrderedRouterOsRule>(
  rules: readonly T[],
  ruleId: string,
  desiredPosition: number,
): ResolvedMoveTarget {
  const currentIndex = rules.findIndex((rule) => rule.id === ruleId);
  const currentNextId = rules[currentIndex + 1]?.id;

  const remaining = rules.filter((rule) => rule.id !== ruleId);
  const desiredIndex = Math.min(desiredPosition, remaining.length);
  const placeBeforeId = remaining[desiredIndex]?.id;

  return { alreadyAtPosition: currentNextId === placeBeforeId, placeBeforeId };
}
