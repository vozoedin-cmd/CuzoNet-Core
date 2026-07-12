import {
  toProvisioningOperationDto,
  type GetProvisioningOperationInput,
  type ProvisioningOperationDto,
} from '../../../dto/provisioning/provisioning-operation.dto.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ProvisioningOperationReader } from '../../../ports/provisioning/provisioning-operation-reader.port.js';
import { ProvisioningOperationNotFoundError } from '../../../../domain/provisioning/errors/provisioning-operation-not-found.error.js';
import { OperationId } from '../../../../domain/provisioning/value-objects/operation-id.js';

export class GetProvisioningOperation {
  public constructor(
    private readonly reader: ProvisioningOperationReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public async execute(input: GetProvisioningOperationInput): Promise<ProvisioningOperationDto> {
    const id = OperationId.create(input.operationId);
    const operation = await this.reader.findById(this.companyContext.getCompanyId(), id.value);
    if (operation === null) throw new ProvisioningOperationNotFoundError();
    return toProvisioningOperationDto(operation);
  }
}
