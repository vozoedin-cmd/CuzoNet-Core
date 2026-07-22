import type { ProvisioningRequestRepository } from '../../ports/provisioning/provisioning-request-repository.port.js';
import { extractRouterId } from '../provisioning/shared/provisioning-event-parsing.util.js';

const PAGE_SIZE = 200;

/**
 * Discovers every distinct routerId referenced by a company's completed
 * provisioning history. Shared by BackfillDesiredState (to backfill every
 * router it can see) and the CLI's `--diagnose` mode (to report what it
 * would find), so both always agree on the same answer.
 */
export async function discoverRouterIds(
  provisioningRequestRepository: ProvisioningRequestRepository,
  companyId: string,
): Promise<string[]> {
  const routerIds = new Set<string>();
  let offset = 0;
  for (;;) {
    const page = await provisioningRequestRepository.list(
      { companyId, status: 'completed' },
      { limit: PAGE_SIZE, offset },
    );
    for (const request of page.items) {
      const routerId = extractRouterId(request.inputSnapshotJson);
      if (routerId !== undefined) routerIds.add(routerId);
    }
    offset += PAGE_SIZE;
    if (page.items.length < PAGE_SIZE || offset >= page.total) break;
  }
  return [...routerIds];
}
