import type { RequestHandler, Response } from 'express';

import { SYNC_RESOURCE_TYPES, type SyncResourceType } from '../../../application/dto/synchronization/desired-resource-state.dto.js';
import type { GetDesiredResourceState } from '../../../application/use-cases/synchronization/get-desired-resource-state.use-case.js';
import type { ListDesiredResourceStates } from '../../../application/use-cases/synchronization/list-desired-resource-states.use-case.js';
import type { RemoveDesiredResourceState } from '../../../application/use-cases/synchronization/remove-desired-resource-state.use-case.js';
import type { SetDesiredResourceState } from '../../../application/use-cases/synchronization/set-desired-resource-state.use-case.js';
import { parseSetDesiredResourceState } from '../validators/desired-resource-state.schemas.js';

export interface DesiredResourceStateControllerDependencies {
  getState: GetDesiredResourceState;
  listStates: ListDesiredResourceStates;
  removeState: RemoveDesiredResourceState;
  setState: SetDesiredResourceState;
}

export class DesiredResourceStateController {
  public constructor(private readonly dependencies: DesiredResourceStateControllerDependencies) {}

  public readonly set: RequestHandler = async (req, res) => {
    try {
      const resourceType = this.parseResourceType(req.params.resourceType);
      const body = parseSetDesiredResourceState(req.body);
      const result = await this.dependencies.setState.execute({
        desiredFields: body.desiredFields,
        ...(body.desiredPosition !== undefined ? { desiredPosition: body.desiredPosition } : {}),
        ...(body.disabled !== undefined ? { disabled: body.disabled } : {}),
        reference: req.params.reference as string,
        resourceType,
        routerId: req.params.routerId as string,
      });
      res.status(200).json(result);
    } catch (error: unknown) {
      this.handleError(res, error);
    }
  };

  public readonly remove: RequestHandler = async (req, res) => {
    try {
      const resourceType = this.parseResourceType(req.params.resourceType);
      await this.dependencies.removeState.execute({
        reference: req.params.reference as string,
        resourceType,
        routerId: req.params.routerId as string,
      });
      res.status(204).send();
    } catch (error: unknown) {
      this.handleError(res, error);
    }
  };

  public readonly get: RequestHandler = async (req, res) => {
    try {
      const resourceType = this.parseResourceType(req.params.resourceType);
      const result = await this.dependencies.getState.execute({
        reference: req.params.reference as string,
        resourceType,
        routerId: req.params.routerId as string,
      });
      if (result === undefined) {
        res.status(404).json({ error: 'Estado deseado no encontrado.' });
        return;
      }
      res.status(200).json(result);
    } catch (error: unknown) {
      this.handleError(res, error);
    }
  };

  public readonly list: RequestHandler = async (req, res) => {
    try {
      const resourceType = this.parseResourceType(req.params.resourceType);
      const result = await this.dependencies.listStates.execute(req.params.routerId as string, resourceType);
      res.status(200).json(result);
    } catch (error: unknown) {
      this.handleError(res, error);
    }
  };

  private parseResourceType(raw: unknown): SyncResourceType {
    if (typeof raw !== 'string' || !(SYNC_RESOURCE_TYPES as readonly string[]).includes(raw)) {
      throw new Error(`resourceType inválido. Debe ser uno de: ${SYNC_RESOURCE_TYPES.join(', ')}.`);
    }
    return raw as SyncResourceType;
  }

  private handleError(res: Response, error: unknown): void {
    if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
      res.status(400).json({ details: error, error: 'Validación fallida' });
      return;
    }
    if (error instanceof Error && error.name === 'InvalidDesiredResourceStateError') {
      res.status(409).json({ error: error.message });
      return;
    }
    if (error instanceof Error) {
      res.status(400).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
