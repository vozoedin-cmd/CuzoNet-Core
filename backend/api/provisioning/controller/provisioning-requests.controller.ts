import type { Request, Response } from 'express';
import type { CancelProvisioningRequest } from '../../../application/use-cases/provisioning/cancel-provisioning-request/cancel-provisioning-request.use-case.js';
import type { GetProvisioningRequest } from '../../../application/use-cases/provisioning/get-provisioning-request/get-provisioning-request.use-case.js';
import type { ListProvisioningRequests } from '../../../application/use-cases/provisioning/list-provisioning-requests/list-provisioning-requests.use-case.js';
import type { RequestProvisioning } from '../../../application/use-cases/provisioning/request-provisioning/request-provisioning.use-case.js';
import type { RequestProvisioningInput } from '../../../application/dto/provisioning/provisioning-request.dto.js';
import type { ProvisioningStatus } from '../../../domain/provisioning/provisioning-request.js';
import { parseRequestProvisioning } from '../validators/provisioning-requests.schemas.js';

export interface ProvisioningRequestsControllerDependencies {
  cancelRequest: CancelProvisioningRequest;
  getRequest: GetProvisioningRequest;
  listRequests: ListProvisioningRequests;
  requestProvisioning: RequestProvisioning;
}

export class ProvisioningRequestsController {
  public constructor(private readonly dependencies: ProvisioningRequestsControllerDependencies) {}

  public async request(req: Request, res: Response): Promise<void> {
    try {
      const body = parseRequestProvisioning(req.body);
      const input = {
        actionType: body.actionType,
        idempotencyKey: body.idempotencyKey,
        inputSnapshotJson: body.inputSnapshotJson,
        targetId: body.targetId,
        targetType: body.targetType,
      } as RequestProvisioningInput;
      if (body.configurationReference !== undefined) input.configurationReference = body.configurationReference;
      if (body.sourceExecutionId !== undefined) input.sourceExecutionId = body.sourceExecutionId;

      const result = await this.dependencies.requestProvisioning.execute(input);
      res.status(202).json(result);
    } catch (error) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        res.status(400).json({ error: 'Validación fallida', details: error });
        return;
      }
      if (error instanceof Error && error.name === 'SensitiveDataInProvisioningError') {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof Error && error.name === 'ProvisioningIdempotencyConflictError') {
        res.status(409).json({ error: error.message });
        return;
      }
      if (error instanceof Error && error.name === 'InvalidProvisioningDataError') {
        res.status(409).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }

  public async get(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await this.dependencies.getRequest.execute(id);
      if (!result) {
        res.status(404).json({ error: 'Solicitud no encontrada.' });
        return;
      }
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }

  public async list(req: Request, res: Response): Promise<void> {
    try {
      const { actionType, limit, offset, status } = req.query;
      
      const filters: { actionType?: string; status?: ProvisioningStatus } = {};
      if (typeof actionType === 'string') filters.actionType = actionType;
      if (typeof status === 'string') filters.status = status as ProvisioningStatus;

      const pagination = {
        limit: typeof limit === 'string' ? parseInt(limit, 10) : 50,
        offset: typeof offset === 'string' ? parseInt(offset, 10) : 0,
      };

      const result = await this.dependencies.listRequests.execute(filters, pagination);
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }

  public async cancel(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      await this.dependencies.cancelRequest.execute({ requestId: id });
      res.status(204).send();
    } catch (error) {
      if (error instanceof Error && error.name === 'ProvisioningTransitionError') {
        res.status(409).json({ error: error.message });
        return;
      }
      if (error instanceof Error && error.message.includes('no encontrado')) {
        res.status(404).json({ error: error.message });
        return;
      }
      res.status(500).json({ error: 'Error interno del servidor.' });
    }
  }
}
