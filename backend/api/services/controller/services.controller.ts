import type { RequestHandler } from 'express';

import type { CreateService } from '../../../application/use-cases/services/create-service/create-service.use-case.js';
import type { GetService } from '../../../application/use-cases/services/get-service/get-service.use-case.js';
import type { ListClientServices } from '../../../application/use-cases/services/list-client-services/list-client-services.use-case.js';
import {
  parseClientIdParams,
  parseCreateServiceRequest,
  parseIdempotencyKey,
  parseServiceIdParams,
} from '../validators/service-request.schemas.js';

export interface ServicesControllerDependencies {
  createService: CreateService;
  getService: GetService;
  listClientServices: ListClientServices;
}

export class ServicesController {
  public constructor(private readonly dependencies: ServicesControllerDependencies) {}

  public readonly create: RequestHandler = async (request, response, next) => {
    try {
      const { clientId } = parseClientIdParams(request.params);
      const body = parseCreateServiceRequest(request.body);
      const idempotencyKey = parseIdempotencyKey(request.get('Idempotency-Key'));
      const result = await this.dependencies.createService.execute({
        ...body,
        causationId: idempotencyKey,
        clientId,
        correlationId: request.correlationId,
      });

      response.status(201).json(result.service);
    } catch (error) {
      next(error);
    }
  };

  public readonly get: RequestHandler = async (request, response, next) => {
    try {
      const { serviceId } = parseServiceIdParams(request.params);
      const service = await this.dependencies.getService.execute({ serviceId });

      response.status(200).json(service);
    } catch (error) {
      next(error);
    }
  };

  public readonly listByClient: RequestHandler = async (request, response, next) => {
    try {
      const { clientId } = parseClientIdParams(request.params);
      const services = await this.dependencies.listClientServices.execute({ clientId });

      response.status(200).json(services);
    } catch (error) {
      next(error);
    }
  };
}
