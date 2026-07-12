import type { AccountStatementDto } from '../../../../dto/billing/statement.dto.js';
import type { StatementReader } from '../../../../ports/billing/statement-reader.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import { BillingAccountNotFoundError } from '../../../../../domain/billing/errors/billing-account-not-found.error.js';
export class GetAccountStatement {
  public constructor(
    private readonly reader: StatementReader,
    private readonly companyContext: CompanyContext,
  ) {}
  public async execute(input: {
    accountId: string;
    from: string;
    to: string;
  }): Promise<AccountStatementDto> {
    const statement = await this.reader.getAccountStatement(
      this.companyContext.getCompanyId(),
      input.accountId,
      new Date(`${input.from}T00:00:00.000Z`),
      new Date(`${input.to}T23:59:59.999Z`),
    );
    if (statement === null) throw new BillingAccountNotFoundError();
    return statement;
  }
}
