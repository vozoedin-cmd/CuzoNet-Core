import type { RequestHandler } from 'express';

import { SYNC_RESOURCE_TYPES, type SyncResourceType } from '../../../application/dto/synchronization/reconciliation-plan.dto.js';
import type { GenerateReconciliationPlan } from '../../../application/use-cases/synchronization/generate-reconciliation-plan.use-case.js';

export class SynchronizationController {
  public constructor(private readonly generateReconciliationPlan: GenerateReconciliationPlan) {}

  public readonly getReconciliationPlan: RequestHandler = async (request, response) => {
    try {
      const routerId = request.params.routerId as string;
      const resourceTypes = this.parseResourceTypes(this.queryString(request.query.resourceTypes));
      const plan = await this.generateReconciliationPlan.execute({
        routerId,
        ...(resourceTypes !== undefined ? { resourceTypes } : {}),
      });
      response.status(200).json(plan);
    } catch (error: unknown) {
      response.status(400).json({ error: this.errorMessage(error) });
    }
  };

  private parseResourceTypes(raw: string): SyncResourceType[] | undefined {
    if (raw.length === 0) return undefined;
    const requested = raw.split(',').map((value) => value.trim());
    for (const value of requested) {
      if (!(SYNC_RESOURCE_TYPES as readonly string[]).includes(value)) {
        throw new Error(`resourceTypes inválido: "${value}". Debe ser una lista separada por comas de: ${SYNC_RESOURCE_TYPES.join(', ')}.`);
      }
    }
    return requested as SyncResourceType[];
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private queryString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
