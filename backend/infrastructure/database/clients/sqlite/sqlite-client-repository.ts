import type {
  ClientPage,
  ClientRepository,
  ListClientsCriteria,
} from '../../../../application/ports/clients/client-repository.port.js';
import type { IdGenerator } from '../../../../application/ports/id-generator.port.js';
import type { Client } from '../../../../domain/clients/client.js';
import { DuplicateClientDocumentError } from '../../../../domain/clients/errors/duplicate-client-document.error.js';
import { sql } from 'kysely';
import type { ClientTable } from '../../sqlite/database-schema.js';
import type { SqliteDatabaseSession } from '../../sqlite/sqlite-database-session.js';
import { isSqliteConstraintError } from '../../sqlite/sqlite-error-translator.js';
import { sqliteClientMapper } from './sqlite-client.mapper.js';

export class SqliteClientRepository implements ClientRepository {
  public constructor(
    private readonly session: SqliteDatabaseSession,
    private readonly idGenerator: IdGenerator,
  ) {}

  public existsActiveDocument(companyId: string, documentKey: string): Promise<boolean> {
    return this.session.execute(async (database) =>
      Boolean(
        await database
          .selectFrom('clients')
          .select('id')
          .where('company_id', '=', companyId)
          .where('document_key', '=', documentKey)
          .where('status', '=', 'active')
          .executeTakeFirst(),
      ),
    );
  }

  public findById(companyId: string, clientId: string): Promise<Client | null> {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('clients')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', clientId)
        .executeTakeFirst();
      return row === undefined ? null : this.hydrate(database, row);
    });
  }

  public list(criteria: ListClientsCriteria): Promise<ClientPage> {
    return this.session.execute(async (database) => {
      let query = database
        .selectFrom('clients')
        .selectAll()
        .where('company_id', '=', criteria.companyId);
      let count = database
        .selectFrom('clients')
        .select((expression) => expression.fn.countAll<number>().as('total'))
        .where('company_id', '=', criteria.companyId);
      if (criteria.status !== undefined) {
        query = query.where('status', '=', criteria.status);
        count = count.where('status', '=', criteria.status);
      }
      const search = criteria.search?.trim();
      if (search !== undefined && search.length > 0) {
        const pattern = `%${search}%`;
        query = query.where((expression) =>
          expression.or([
            expression('legal_name', 'like', pattern),
            expression('document_number', 'like', pattern),
            sql<boolean>`exists (
              select 1 from client_contacts
              where client_contacts.client_id = clients.id
                and client_contacts.value_normalized like ${pattern}
            )`,
          ]),
        );
        count = count.where((expression) =>
          expression.or([
            expression('legal_name', 'like', pattern),
            expression('document_number', 'like', pattern),
            sql<boolean>`exists (
              select 1 from client_contacts
              where client_contacts.client_id = clients.id
                and client_contacts.value_normalized like ${pattern}
            )`,
          ]),
        );
      }
      const [rows, totalRow] = await Promise.all([
        query
          .orderBy('created_at', 'desc')
          .orderBy('id', 'asc')
          .limit(criteria.pageSize)
          .offset((criteria.page - 1) * criteria.pageSize)
          .execute(),
        count.executeTakeFirstOrThrow(),
      ]);
      const clients = await Promise.all(rows.map((row) => this.hydrate(database, row)));
      return { clients, total: Number(totalRow.total) };
    });
  }

  public save(client: Client): Promise<void> {
    return this.session.transaction(async () => {
      try {
        await this.session.execute(async (database) => {
          await database
            .insertInto('clients')
            .values({
              archived_at: client.archivedAt?.toISOString() ?? null,
              client_type: client.clientType.value,
              company_id: client.companyId,
              created_at: client.createdAt.toISOString(),
              document_key: client.document.uniquenessKey,
              document_number: client.document.number,
              document_type: client.document.type,
              id: client.id.value,
              legal_name: client.legalName.value,
              status: client.status,
              updated_at: client.updatedAt?.toISOString() ?? null,
            })
            .onConflict((conflict) =>
              conflict.column('id').doUpdateSet({
                archived_at: client.archivedAt?.toISOString() ?? null,
                legal_name: client.legalName.value,
                status: client.status,
                updated_at: client.updatedAt?.toISOString() ?? null,
              }),
            )
            .execute();
          await database.deleteFrom('client_contacts').where('client_id', '=', client.id.value).execute();
          await database.deleteFrom('client_addresses').where('client_id', '=', client.id.value).execute();
          await database.deleteFrom('client_notes').where('client_id', '=', client.id.value).execute();
          if (client.contacts.length > 0)
            await database
              .insertInto('client_contacts')
              .values(
                client.contacts.map((contact, position) => ({
                  client_id: client.id.value,
                  contact_type: contact.type,
                  id: this.idGenerator.generate(),
                  is_primary: contact.isPrimary ? 1 : 0,
                  position,
                  value_display: contact.value,
                  value_normalized: contact.normalizedValue,
                  verified_at: null,
                })),
              )
              .execute();
          if (client.addresses.length > 0)
            await database
              .insertInto('client_addresses')
              .values(
                client.addresses.map((address, position) => ({
                  address_line: address.addressLine,
                  client_id: client.id.value,
                  id: this.idGenerator.generate(),
                  is_service_address: address.isServiceAddress ? 1 : 0,
                  label: address.label ?? null,
                  latitude: address.latitude ?? null,
                  longitude: address.longitude ?? null,
                  position,
                })),
              )
              .execute();
          if (client.note !== undefined)
            await database
              .insertInto('client_notes')
              .values({
                body: client.note.value,
                client_id: client.id.value,
                created_at: client.createdAt.toISOString(),
                id: this.idGenerator.generate(),
                position: 0,
              })
              .execute();
        });
      } catch (error) {
        if (
          isSqliteConstraintError(error) &&
          error.message.includes('clients.company_id') &&
          error.message.includes('clients.document_key')
        )
          throw new DuplicateClientDocumentError();
        throw error;
      }
    });
  }

  private async hydrate(
    database: Parameters<Parameters<SqliteDatabaseSession['execute']>[0]>[0],
    client: ClientTable,
  ): Promise<Client> {
    const [contacts, addresses, notes] = await Promise.all([
      database.selectFrom('client_contacts').selectAll().where('client_id', '=', client.id).execute(),
      database.selectFrom('client_addresses').selectAll().where('client_id', '=', client.id).execute(),
      database.selectFrom('client_notes').selectAll().where('client_id', '=', client.id).execute(),
    ]);
    return sqliteClientMapper.toDomain(client, contacts, addresses, notes);
  }
}
