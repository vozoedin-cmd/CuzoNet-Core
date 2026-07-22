import type { DesiredResourceStateDto } from '../../dto/synchronization/desired-resource-state.dto.js';
import type { DesiredResourceState } from '../../../domain/synchronization/desired-resource-state.js';

export class DesiredResourceStateMapper {
  public static toDto(state: DesiredResourceState): DesiredResourceStateDto {
    return {
      companyId: state.companyId,
      createdAt: state.createdAt.toISOString(),
      desiredFields: { ...state.desiredFields },
      ...(state.desiredPosition !== undefined ? { desiredPosition: state.desiredPosition } : {}),
      disabled: state.disabled,
      reference: state.reference,
      resourceType: state.resourceType,
      revision: state.revision,
      routerId: state.routerId,
      updatedAt: state.updatedAt.toISOString(),
    };
  }
}
