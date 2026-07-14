import type { Plan } from '../../../domain/plans/plan.js';

export interface PlanRepository {
  existsCode(companyId: string, code: string): Promise<boolean>;
  findById(companyId: string, planId: string): Promise<Plan | null>;
  save(plan: Plan): Promise<void>;
}
