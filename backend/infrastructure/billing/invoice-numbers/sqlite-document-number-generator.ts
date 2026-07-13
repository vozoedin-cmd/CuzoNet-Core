import type { DocumentNumberGenerator } from '../../../application/ports/billing/document-number-generator.port.js';
import type { Clock } from '../../../application/ports/clock.port.js';
import type { SqliteDatabaseSession } from '../../database/sqlite/sqlite-database-session.js';

export class SqliteDocumentNumberGenerator implements DocumentNumberGenerator {
  public constructor(
    private readonly session: SqliteDatabaseSession,
    private readonly clock: Clock,
  ) {}

  public nextInvoiceNumber(companyId: string): Promise<string> {
    return this.session.transaction(async () =>
      this.session.execute(async (database) => {
        await database
          .insertInto('document_sequences')
          .values({
            company_id: companyId,
            document_type: 'invoice',
            next_value: 1,
            updated_at: this.clock.now().toISOString(),
          })
          .onConflict((conflict) => conflict.columns(['company_id', 'document_type']).doNothing())
          .execute();
        const current = await database
          .selectFrom('document_sequences')
          .select('next_value')
          .where('company_id', '=', companyId)
          .where('document_type', '=', 'invoice')
          .executeTakeFirstOrThrow();
        await database
          .updateTable('document_sequences')
          .set({ next_value: current.next_value + 1, updated_at: this.clock.now().toISOString() })
          .where('company_id', '=', companyId)
          .where('document_type', '=', 'invoice')
          .execute();
        return `INV-${String(current.next_value).padStart(8, '0')}`;
      }),
    );
  }
}
