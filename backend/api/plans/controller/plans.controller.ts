import type { RequestHandler } from 'express';

import type { CreatePlan } from '../../../application/use-cases/plans/create-plan/create-plan.use-case.js';
import type { ListPlans } from '../../../application/use-cases/plans/list-plans/list-plans.use-case.js';
import type { RevisePlan } from '../../../application/use-cases/plans/revise-plan/revise-plan.use-case.js';
import {
  parseCreatePlanRequest,
  parsePlanIdempotencyKey,
  parsePlanIdParams,
  parseRevisePlanRequest,
} from '../validators/plan-request.schemas.js';

export interface PlansControllerDependencies {
  createPlan: CreatePlan;
  listPlans: ListPlans;
  revisePlan: RevisePlan;
}

export class PlansController {
  public constructor(private readonly dependencies: PlansControllerDependencies) {}

  public readonly create: RequestHandler = async (request, response, next) => {
    try {
      const body = parseCreatePlanRequest(request.body);
      const idempotencyKey = parsePlanIdempotencyKey(request.get('Idempotency-Key'));
      const result = await this.dependencies.createPlan.execute({
        ...body,
        causationId: idempotencyKey,
        correlationId: request.correlationId,
      });
      response.status(201).json(result.plan);
    } catch (error) {
      next(error);
    }
  };

  public readonly list: RequestHandler = async (_request, response, next) => {
    try {
      response.status(200).json(await this.dependencies.listPlans.execute());
    } catch (error) {
      next(error);
    }
  };

  public readonly revise: RequestHandler = async (request, response, next) => {
    try {
      const { planId } = parsePlanIdParams(request.params);
      const body = parseRevisePlanRequest(request.body);
      const idempotencyKey = parsePlanIdempotencyKey(request.get('Idempotency-Key'));
      const result = await this.dependencies.revisePlan.execute({
        ...body,
        causationId: idempotencyKey,
        correlationId: request.correlationId,
        planId,
      });
      response.status(200).json(result.plan);
    } catch (error) {
      next(error);
    }
  };
}
