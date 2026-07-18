import type { RequestHandler } from 'express';

import type {
  CreateEquipmentCommand,
  CreateEquipmentUseCase,
} from '../../application/inventory/create-equipment.usecase.js';
import type { SetEquipmentManagementHostUseCase } from '../../application/inventory/set-equipment-management-host.usecase.js';
import {
  parseEquipmentIdParams,
  parseSetManagementHostRequest,
} from './equipment-request.schemas.js';

export class EquipmentController {
  public constructor(
    private readonly createEquipmentUseCase: CreateEquipmentUseCase,
    private readonly setManagementHostUseCase: SetEquipmentManagementHostUseCase,
  ) {}

  public readonly create: RequestHandler = async (request, response) => {
    try {
      const id = await this.createEquipmentUseCase.execute(
        request.body as unknown as CreateEquipmentCommand,
      );
      response.status(201).json({ id });
    } catch (error: unknown) {
      response.status(400).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  public readonly setManagementHost: RequestHandler = async (request, response, next) => {
    try {
      const { equipmentId } = parseEquipmentIdParams(request.params);
      const body = parseSetManagementHostRequest(request.body);
      await this.setManagementHostUseCase.execute({ equipmentId, ...body });
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
