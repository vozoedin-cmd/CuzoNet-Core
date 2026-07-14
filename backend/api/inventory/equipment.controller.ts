import type { CreateEquipmentUseCase, CreateEquipmentCommand } from '../../application/inventory/create-equipment.usecase.js';

export interface HttpRequest {
  body: Record<string, unknown>;
}

export interface HttpResponse {
  status: (code: number) => this;
  json: (data: unknown) => void;
}

export class EquipmentController {
  constructor(private readonly createEquipmentUseCase: CreateEquipmentUseCase) {}

  public async create(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = await this.createEquipmentUseCase.execute(req.body as unknown as CreateEquipmentCommand);
      res.status(201).json({ id });
    } catch (e: unknown) {
      if (e instanceof Error) {
        res.status(400).json({ error: e.message });
      } else {
        res.status(400).json({ error: 'Unknown error' });
      }
    }
  }
}
