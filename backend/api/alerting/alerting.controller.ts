
import type { EvaluateAlertPoliciesUseCase } from '../../application/use-cases/alerting/evaluate-alert-policies.usecase.js';
import type { AcknowledgeAlertUseCase } from '../../application/use-cases/alerting/acknowledge-alert.usecase.js';
import type { ResolveAlertUseCase } from '../../application/use-cases/alerting/resolve-alert.usecase.js';

export interface HttpRequest {
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface HttpResponse {
  status: (code: number) => this;
  json: (data: unknown) => void;
}

export class AlertingController {
  constructor(
    private readonly evaluatePoliciesUseCase: EvaluateAlertPoliciesUseCase,
    private readonly acknowledgeUseCase: AcknowledgeAlertUseCase,
    private readonly resolveUseCase: ResolveAlertUseCase
  ) {}

  public async evaluatePolicies(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const companyId = req.query.companyId as string;
      await this.evaluatePoliciesUseCase.execute(companyId);
      res.status(202).json({ success: true, message: 'Policies evaluated' });
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async acknowledgeAlert(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const { actorId } = req.body as { actorId: string };
      await this.acknowledgeUseCase.execute(req.params.id as string, actorId);
      res.status(200).json({ success: true });
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async resolveAlert(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const { actorId } = req.body as { actorId?: string };
      await this.resolveUseCase.execute(req.params.id as string, actorId);
      res.status(200).json({ success: true });
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }
}
