import type { CompanyContext } from '../../application/ports/company-context.port.js';

export class SqliteSingleCompanyContext implements CompanyContext {
  public constructor(private readonly companyId: string) {}

  public getCompanyId(): string {
    return this.companyId;
  }
}
