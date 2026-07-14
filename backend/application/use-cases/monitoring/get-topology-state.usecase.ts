import type { EquipmentStateRepository } from '../../ports/monitoring/equipment-state.repository.js';
import type { NetworkReader } from '../../ports/monitoring/network.reader.js';
import type { TopologyStateSummaryDto, EquipmentStateDto } from '../../dto/monitoring/observation.dto.js';
import type { AvailabilityStatus } from '../../../domain/monitoring/equipment-state.js';

export class GetTopologyStateUseCase {
  constructor(
    private readonly stateRepo: EquipmentStateRepository,
    private readonly networkReader: NetworkReader
  ) {}

  public async execute(entityType: 'node' | 'link', entityId: string): Promise<TopologyStateSummaryDto | null> {
    let eqIds: string[];
    if (entityType === 'node') {
      eqIds = await this.networkReader.findEquipmentIdsByNode(entityId);
    } else {
      eqIds = await this.networkReader.findEquipmentIdsByLink(entityId);
    }

    if (eqIds.length === 0) {
      return null;
    }

    const eqStates: EquipmentStateDto[] = [];
    let downs = 0;
    let degradeds = 0;
    let upCount = 0;

    for (const eqId of eqIds) {
      const state = await this.stateRepo.findById(eqId);
      if (state) {
        eqStates.push({
          equipmentId: state.props.equipmentId,
          status: state.props.status,
          ...(state.props.lastSeenAt ? { lastSeenAt: state.props.lastSeenAt } : {}),
          ...(state.props.lastLatencyMs !== undefined ? { lastLatencyMs: state.props.lastLatencyMs } : {}),
          ...(state.props.uptimeSeconds !== undefined ? { uptimeSeconds: state.props.uptimeSeconds } : {})
        });

        if (state.props.status === 'DOWN') downs++;
        else if (state.props.status === 'DEGRADED') degradeds++;
        else if (state.props.status === 'UP') upCount++;
      } else {
        eqStates.push({
          equipmentId: eqId,
          status: 'UNKNOWN'
        });
      }
    }

    let overallStatus: AvailabilityStatus = 'UNKNOWN';
    if (downs > 0 && downs === eqIds.length) overallStatus = 'DOWN';
    else if (downs > 0 || degradeds > 0) overallStatus = 'DEGRADED';
    else if (upCount > 0) overallStatus = 'UP';

    return {
      entityId,
      entityType,
      overallStatus,
      equipmentStates: eqStates
    };
  }
}
