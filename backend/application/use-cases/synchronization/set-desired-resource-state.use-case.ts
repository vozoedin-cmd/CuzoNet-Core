import type { DesiredResourceStateDto, SetDesiredResourceStateInput } from '../../dto/synchronization/desired-resource-state.dto.js';
import { DesiredResourceStateMapper } from '../../mappers/synchronization/desired-resource-state.mapper.js';
import type { Clock } from '../../ports/clock.port.js';
import type { CompanyContext } from '../../ports/company-context.port.js';
import type { IdGenerator } from '../../ports/id-generator.port.js';
import type { DesiredResourceStateRepository } from '../../ports/synchronization/desired-resource-state-repository.port.js';
import { DesiredResourceState } from '../../../domain/synchronization/desired-resource-state.js';

/**
 * Step 1 of the declarative flow: "Guardar el estado deseado." Always a
 * full declarative replace (never a partial patch) — the caller declares
 * the complete desired shape for the resource every time.
 */
export class SetDesiredResourceState {
  public constructor(
    private readonly repository: DesiredResourceStateRepository,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  public async execute(input: SetDesiredResourceStateInput): Promise<DesiredResourceStateDto> {
    const companyId = this.companyContext.getCompanyId();
    const now = this.clock.now();
    const disabled = input.disabled ?? false;

    let state = await this.repository.findByReference(companyId, input.routerId, input.resourceType, input.reference);
    if (state === undefined) {
      state = DesiredResourceState.create(
        {
          companyId,
          desiredFields: input.desiredFields,
          ...(input.desiredPosition !== undefined ? { desiredPosition: input.desiredPosition } : {}),
          disabled,
          id: this.idGenerator.generate(),
          reference: input.reference,
          resourceType: input.resourceType,
          routerId: input.routerId,
        },
        now,
      );
    } else {
      state.replace(input.desiredFields, disabled, input.desiredPosition, now);
    }

    await this.repository.save(state);
    return DesiredResourceStateMapper.toDto(state);
  }
}
