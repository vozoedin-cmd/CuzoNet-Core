import type { RequestHandler } from 'express';

import type { ArchiveClient } from '../../../application/use-cases/clients/archive-client/archive-client.use-case.js';
import type { CreateClient } from '../../../application/use-cases/clients/create-client/create-client.use-case.js';
import type { GetClient } from '../../../application/use-cases/clients/get-client/get-client.use-case.js';
import type { ListClients } from '../../../application/use-cases/clients/list-clients/list-clients.use-case.js';
import type { UpdateClient } from '../../../application/use-cases/clients/update-client/update-client.use-case.js';
import {
  parseClientIdParams,
  parseCreateClientRequest,
  parseIdempotencyKey,
  parseListClientsQuery,
  parseUpdateClientRequest,
} from '../validators/client-request.schemas.js';

export interface ClientsControllerDependencies {
  archiveClient: ArchiveClient;
  createClient: CreateClient;
  getClient: GetClient;
  listClients: ListClients;
  updateClient: UpdateClient;
}

export class ClientsController {
  public constructor(private readonly dependencies: ClientsControllerDependencies) {}

  public readonly create: RequestHandler = async (request, response, next) => {
    try {
      const body = parseCreateClientRequest(request.body);
      const idempotencyKey = parseIdempotencyKey(request.get('Idempotency-Key'));
      const result = await this.dependencies.createClient.execute({
        ...body,
        causationId: idempotencyKey,
        correlationId: request.correlationId,
      });

      response.status(201).json(result.client);
    } catch (error) {
      next(error);
    }
  };

  public readonly update: RequestHandler = async (request, response, next) => {
    try {
      const { clientId } = parseClientIdParams(request.params);
      const body = parseUpdateClientRequest(request.body);
      parseIdempotencyKey(request.get('Idempotency-Key'));
      const client = await this.dependencies.updateClient.execute({ clientId, ...body });

      response.status(200).json(client);
    } catch (error) {
      next(error);
    }
  };

  public readonly get: RequestHandler = async (request, response, next) => {
    try {
      const { clientId } = parseClientIdParams(request.params);
      const client = await this.dependencies.getClient.execute({ clientId });

      response.status(200).json(client);
    } catch (error) {
      next(error);
    }
  };

  public readonly list: RequestHandler = async (request, response, next) => {
    try {
      const query = parseListClientsQuery(request.query);
      const page = await this.dependencies.listClients.execute(query);

      response.status(200).json(page);
    } catch (error) {
      next(error);
    }
  };

  public readonly archive: RequestHandler = async (request, response, next) => {
    try {
      const { clientId } = parseClientIdParams(request.params);
      parseIdempotencyKey(request.get('Idempotency-Key'));
      await this.dependencies.archiveClient.execute({ clientId });

      response.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
