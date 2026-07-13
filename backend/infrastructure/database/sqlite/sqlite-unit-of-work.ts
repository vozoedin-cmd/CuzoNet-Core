import type { AutomationUnitOfWork } from '../../../application/ports/automation/automation-unit-of-work.port.js';
import type { BillingUnitOfWork } from '../../../application/ports/billing/billing-unit-of-work.port.js';
import type { ProvisioningUnitOfWork } from '../../../application/ports/provisioning/provisioning-unit-of-work.port.js';
import type { ClientUnitOfWork } from '../../../application/ports/clients/client-outbox.port.js';
import type { ServiceUnitOfWork } from '../../../application/ports/services/service-outbox.port.js';
import type { SqliteDatabaseSession } from './sqlite-database-session.js';

export class SqliteUnitOfWork
  implements
    AutomationUnitOfWork,
    BillingUnitOfWork,
    ProvisioningUnitOfWork,
    ClientUnitOfWork,
    ServiceUnitOfWork
{
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public execute<T>(work: () => Promise<T>): Promise<T> {
    return this.session.transaction(work);
  }
}
