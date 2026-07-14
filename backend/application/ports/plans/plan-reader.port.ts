import type { PlanDto } from '../../dto/plans/plan.dto.js';

export interface PlanReader {
  listActive(companyId: string): Promise<readonly PlanDto[]>;
}
