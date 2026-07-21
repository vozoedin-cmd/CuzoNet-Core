/**
 * Splits a dot-notation provisioning actionType (e.g.
 * "routeros.hotspot.user.create") into its trailing verb ("create") and the
 * resource path that precedes it ("routeros.hotspot.user"). Used to
 * populate the `action`/`resourceType` fields of provisioning domain events
 * without any adapter having to report them explicitly.
 */
export function splitActionType(actionType: string): { action: string; resourceType: string } {
  const lastDot = actionType.lastIndexOf('.');
  if (lastDot === -1) {
    return { action: actionType, resourceType: actionType };
  }
  return { action: actionType.slice(lastDot + 1), resourceType: actionType.slice(0, lastDot) };
}

/**
 * Best-effort extraction of `routerId` from a provisioning request's
 * inputSnapshotJson. Every current RouterOS action payload (Simple Queue,
 * PPPoE, Hotspot, Firewall Address Lists) carries a top-level `routerId`
 * string, but this stays generic and never assumes a specific vendor
 * schema: unparsable or missing input simply yields `undefined`.
 */
export function extractRouterId(inputSnapshotJson: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(inputSnapshotJson);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== 'object') {
    return undefined;
  }
  const routerId = (parsed as { routerId?: unknown }).routerId;
  return typeof routerId === 'string' ? routerId : undefined;
}
