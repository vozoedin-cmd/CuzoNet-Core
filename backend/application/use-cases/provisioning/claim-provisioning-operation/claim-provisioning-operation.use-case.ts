import type { Clock } from '../../../ports/clock.port.js';
import type { CompanyContext } from '../../../ports/company-context.port.js';
import type { ProvisioningOperationClaimer } from '../../../ports/provisioning/provisioning-operation-claimer.port.js';
import type { ProvisioningOperation } from '../../../../domain/provisioning/provisioning-operation.js';

export class ClaimProvisioningOperation {
  public constructor(
    private readonly claimer: ProvisioningOperationClaimer,
    private readonly companyContext: CompanyContext,
    private readonly clock: Clock,
  ) {}
  public execute(): Promise<ProvisioningOperation | null> {
    return this.claimer.claimNext(this.companyContext.getCompanyId(), this.clock.now());
  }
}
