import type { RequestHandler } from 'express';

import type {
  CreateEquipmentCommand,
  CreateEquipmentUseCase,
} from '../../application/inventory/create-equipment.usecase.js';

export class EquipmentController {
  public constructor(private readonly createEquipmentUseCase: CreateEquipmentUseCase) {}

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
}
