import type { CreateNetworkLinkUseCase, CreateNetworkLinkCommand } from '../../application/use-cases/network/create-network-link.usecase.js';
import type { GetNetworkLinkUseCase } from '../../application/use-cases/network/get-network-link.usecase.js';
import type { ListNetworkLinksUseCase } from '../../application/use-cases/network/list-network-links.usecase.js';

export interface HttpRequest {
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface HttpResponse {
  status: (code: number) => this;
  json: (data: unknown) => void;
}

export class NetworkLinkController {
  constructor(
    private readonly createLinkUseCase: CreateNetworkLinkUseCase,
    private readonly getLinkUseCase: GetNetworkLinkUseCase,
    private readonly listLinksUseCase: ListNetworkLinksUseCase
  ) {}

  public async create(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const id = await this.createLinkUseCase.execute(req.body as unknown as CreateNetworkLinkCommand);
      res.status(201).json({ id });
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async get(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const link = await this.getLinkUseCase.execute(req.params.linkId as string);
      if (!link) res.status(404).json({ error: 'Link not found' });
      else res.status(200).json(link);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async list(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const links = await this.listLinksUseCase.execute(req.query.companyId as string);
      res.status(200).json(links);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }
}
