import type { RequestHandler } from 'express';

import type { RecordObservationBatchUseCase, RecordObservationCommand } from '../../application/use-cases/monitoring/record-observation-batch.usecase.js';
import type { GetLatestStateUseCase } from '../../application/use-cases/monitoring/get-latest-state.usecase.js';
import type { GetTimeSeriesUseCase } from '../../application/use-cases/monitoring/get-time-series.usecase.js';
import type { GetTopologyStateUseCase } from '../../application/use-cases/monitoring/get-topology-state.usecase.js';

type RecordObservationRequest = Omit<RecordObservationCommand, 'timestamp'> & {
  timestamp: Date | string;
};

export class MonitoringController {
  constructor(
    private readonly recordBatchUseCase: RecordObservationBatchUseCase,
    private readonly getLatestStateUseCase: GetLatestStateUseCase,
    private readonly getTimeSeriesUseCase: GetTimeSeriesUseCase,
    private readonly getTopologyStateUseCase: GetTopologyStateUseCase
  ) {}

  public readonly recordBatch: RequestHandler = async (request, response) => {
    try {
      const { companyId, observations } = request.body as {
        companyId: string;
        observations: RecordObservationRequest[];
      };
      const commands = observations.map((observation): RecordObservationCommand => {
        const timestamp =
          observation.timestamp instanceof Date
            ? observation.timestamp
            : new Date(observation.timestamp);
        if (Number.isNaN(timestamp.getTime())) throw new Error('Invalid observation timestamp');
        return { ...observation, timestamp };
      });
      await this.recordBatchUseCase.execute(companyId, commands);
      response.status(202).json({ success: true });
    } catch (error: unknown) {
      response.status(400).json({ error: this.errorMessage(error) });
    }
  };

  public readonly getLatestState: RequestHandler = async (request, response) => {
    try {
      const state = await this.getLatestStateUseCase.execute(
        this.queryString(request.query.companyId),
        request.params.equipmentId as string,
      );
      if (!state) response.status(404).json({ error: 'Equipment state not found' });
      else response.status(200).json(state);
    } catch (error: unknown) {
      response.status(400).json({ error: this.errorMessage(error) });
    }
  };

  public readonly getTimeSeries: RequestHandler = async (request, response) => {
    try {
      const { companyId, metricType, from, to } = request.query;
      const ts = await this.getTimeSeriesUseCase.execute(
        this.queryString(companyId),
        request.params.equipmentId as string,
        this.queryString(metricType),
        new Date(this.queryString(from)),
        new Date(this.queryString(to)),
      );
      response.status(200).json(ts);
    } catch (error: unknown) {
      response.status(400).json({ error: this.errorMessage(error) });
    }
  };

  public readonly getTopologyState: RequestHandler = async (request, response) => {
    try {
      const entityType = this.queryString(request.query.entityType);
      if (entityType !== 'node' && entityType !== 'link') {
        response.status(400).json({ error: 'entityType must be node or link' });
        return;
      }
      const state = await this.getTopologyStateUseCase.execute(
        entityType,
        request.params.entityId as string,
      );
      if (!state)
        response.status(404).json({ error: 'Topology entity not found or has no equipment' });
      else response.status(200).json(state);
    } catch (error: unknown) {
      response.status(400).json({ error: this.errorMessage(error) });
    }
  };

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unknown error';
  }

  private queryString(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
