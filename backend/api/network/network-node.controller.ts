import type { CreateNetworkNodeUseCase, CreateNetworkNodeCommand } from '../../application/use-cases/network/create-network-node.usecase.js';
import type { GetNetworkNodeUseCase } from '../../application/use-cases/network/get-network-node.usecase.js';
import type { ListNetworkNodesUseCase } from '../../application/use-cases/network/list-network-nodes.usecase.js';

export interface HttpRequest {
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface HttpResponse {
  status: (code: number) => this;
  json: (data: unknown) => void;
}

export class NetworkNodeController {
  constructor(
    private readonly createNodeUseCase: CreateNetworkNodeUseCase,
    private readonly getNodeUseCase: GetNetworkNodeUseCase,
    private readonly listNodesUseCase: ListNetworkNodesUseCase
  ) {}

  public async create(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = await this.createNodeUseCase.execute(req.body as unknown as CreateNetworkNodeCommand);
      res.status(201).json({ id });
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async get(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const node = await this.getNodeUseCase.execute(req.params.nodeId as string);
      if (!node) res.status(404).json({ error: 'Node not found' });
      else res.status(200).json(node);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async list(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const nodes = await this.listNodesUseCase.execute(req.query.companyId as string);
      res.status(200).json(nodes);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }
}
