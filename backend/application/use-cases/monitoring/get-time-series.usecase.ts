import type { ObservationRepository } from '../../ports/monitoring/observation.repository.js';
import type { TimeSeriesDataPointDto } from '../../dto/monitoring/observation.dto.js';
import type { InventoryReader } from '../../ports/monitoring/inventory.reader.js';

export class GetTimeSeriesUseCase {
  constructor(
    private readonly observationRepo: ObservationRepository,
    private readonly inventoryReader: InventoryReader
  ) {}

  public async execute(
    companyId: string, 
    equipmentId: string, 
    metricType: string, 
    from: Date, 
    to: Date
  ): Promise<TimeSeriesDataPointDto[]> {
    const eqRef = await this.inventoryReader.findEquipmentById(equipmentId);
    if (!eqRef || eqRef.companyId !== companyId) {
      return [];
    }

    const obs = await this.observationRepo.findByEquipmentAndMetric(equipmentId, metricType, from, to);
    
    return obs.map(o => ({
      timestamp: o.props.occurredAt,
      value: o.props.metricValue.value
    }));
  }
}
