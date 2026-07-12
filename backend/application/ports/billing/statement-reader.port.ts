import type { AccountStatementDto } from '../../dto/billing/statement.dto.js';
export interface StatementReader {
  getAccountStatement(
    companyId: string,
    accountId: string,
    from: Date,
    to: Date,
  ): Promise<AccountStatementDto | null>;
}
