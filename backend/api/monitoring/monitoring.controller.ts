import type { RecordObservationBatchUseCase, RecordObservationCommand } from '../../application/use-cases/monitoring/record-observation-batch.usecase.js';
import type { GetLatestStateUseCase } from '../../application/use-cases/monitoring/get-latest-state.usecase.js';
import type { GetTimeSeriesUseCase } from '../../application/use-cases/monitoring/get-time-series.usecase.js';
import type { GetTopologyStateUseCase } from '../../application/use-cases/monitoring/get-topology-state.usecase.js';

export interface HttpRequest {
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
}

export interface HttpResponse {
  status: (code: number) => this;
  json: (data: unknown) => void;
}

export class MonitoringController {
  constructor(
    private readonly recordBatchUseCase: RecordObservationBatchUseCase,
    private readonly getLatestStateUseCase: GetLatestStateUseCase,
    private readonly getTimeSeriesUseCase: GetTimeSeriesUseCase,
    private readonly getTopologyStateUseCase: GetTopologyStateUseCase
  ) {}

  public async recordBatch(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const { companyId, observations } = req.body as { companyId: string; observations: RecordObservationCommand[] };
      await this.recordBatchUseCase.execute(companyId, observations);
      res.status(202).json({ success: true });
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async getLatestState(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const state = await this.getLatestStateUseCase.execute(req.query.companyId as string, req.params.equipmentId as string);
      if (!state) res.status(404).json({ error: 'Equipment state not found' });
      else res.status(200).json(state);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async getTimeSeries(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const { companyId, metricType, from, to } = req.query;
      const ts = await this.getTimeSeriesUseCase.execute(
        companyId as string,
        req.params.equipmentId as string,
        metricType as string,
        new Date(from as string),
        new Date(to as string)
      );
      res.status(200).json(ts);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }

  public async getTopologyState(req: HttpRequest, res: HttpResponse): Promise<void> {
    try {
      const entityType = req.query.entityType as 'node' | 'link';
      const state = await this.getTopologyStateUseCase.execute(entityType, req.params.entityId as string);
      if (!state) res.status(404).json({ error: 'Topology entity not found or has no equipment' });
      else res.status(200).json(state);
    } catch (e: unknown) {
      if (e instanceof Error) res.status(400).json({ error: e.message });
      else res.status(400).json({ error: 'Unknown error' });
    }
  }
}
