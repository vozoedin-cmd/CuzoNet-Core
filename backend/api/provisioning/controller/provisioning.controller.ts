import type { RequestHandler } from 'express';

import type { GetProvisioningOperation } from '../../../application/use-cases/provisioning/get-provisioning-operation/get-provisioning-operation.use-case.js';
import type { RequestProvisioningOperation } from '../../../application/use-cases/provisioning/request-provisioning-operation/request-provisioning-operation.use-case.js';
import {
  parseOperationId,
  parseProvisioningIdempotencyKey,
  parseProvisioningRequest,
  parseProvisioningServiceId,
} from '../validators/provisioning-request.schemas.js';

export interface ProvisioningControllerDependencies {
  getOperation: GetProvisioningOperation;
  requestOperation: RequestProvisioningOperation;
}

export class ProvisioningController {
  public constructor(private readonly dependencies: ProvisioningControllerDependencies) {}

  public readonly request: RequestHandler = async (request, response, next) => {
    try {
      const { serviceId } = parseProvisioningServiceId(request.params);
      const body = parseProvisioningRequest(request.body);
      const idempotencyKey = parseProvisioningIdempotencyKey(request.get('Idempotency-Key'));
      const result = await this.dependencies.requestOperation.execute({
        causationId: idempotencyKey,
        correlationId: request.correlationId,
        idempotencyKey,
        ...(body.ipAddressId === undefined ? {} : { ipAddressId: body.ipAddressId }),
        routerId: body.routerId,
        ...(body.serviceAddressId === undefined ? {} : { serviceAddressId: body.serviceAddressId }),
        serviceId,
        type: body.type,
      });
      response.status(202).json(result);
    } catch (error) {
      next(error);
    }
  };

  public readonly get: RequestHandler = async (request, response, next) => {
    try {
      const { operationId } = parseOperationId(request.params);
      response.status(200).json(await this.dependencies.getOperation.execute({ operationId }));
    } catch (error) {
      next(error);
    }
  };
}
