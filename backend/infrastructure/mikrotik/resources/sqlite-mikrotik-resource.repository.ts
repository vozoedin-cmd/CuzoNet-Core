import type { IdGenerator } from '../../../application/ports/id-generator.port.js';
import type { SqliteDatabaseSession } from '../../database/sqlite/sqlite-database-session.js';
import type {
  MikrotikResource,
  MikrotikResourceRepository,
  ReserveMikrotikResourceInput,
} from './mikrotik-resource.repository.js';

export class SqliteMikrotikResourceRepository implements MikrotikResourceRepository {
  public constructor(
    private readonly session: SqliteDatabaseSession,
    private readonly idGenerator: IdGenerator,
  ) {}

  public markApplied(
    resourceId: string,
    input: {
      desiredHash: string;
      reconciledAt: Date;
      remoteId: string;
      remoteName: string;
    },
  ): Promise<void> {
    return this.session.execute(async (database) => {
      const result = await database
        .updateTable('mikrotik_resources')
        .set({
          desired_hash: input.desiredHash,
          last_reconciled_at: input.reconciledAt.toISOString(),
          observed_hash: input.desiredHash,
          remote_id: input.remoteId,
          remote_name: input.remoteName,
          status: 'applied',
          updated_at: input.reconciledAt.toISOString(),
        })
        .where('id', '=', resourceId)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) !== 1) throw new Error('Recurso MikroTik no encontrado.');
    });
  }

  public markPending(
    resourceId: string,
    input: { desiredHash: string; remoteName: string; updatedAt: Date },
  ): Promise<void> {
    return this.session.execute(async (database) => {
      const result = await database
        .updateTable('mikrotik_resources')
        .set({
          desired_hash: input.desiredHash,
          remote_name: input.remoteName,
          status: 'pending',
          updated_at: input.updatedAt.toISOString(),
        })
        .where('id', '=', resourceId)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) !== 1) throw new Error('Recurso MikroTik no encontrado.');
    });
  }

  public reserve(input: ReserveMikrotikResourceInput): Promise<MikrotikResource> {
    return this.session.transaction(async () => {
      await this.session.execute(async (database) => {
        await database
          .insertInto('mikrotik_resources')
          .values({
            company_id: input.companyId,
            created_at: input.createdAt.toISOString(),
            desired_hash: null,
            id: this.idGenerator.generate(),
            last_reconciled_at: null,
            observed_hash: null,
            remote_id: null,
            remote_name: null,
            resource_type: 'simple_queue',
            router_id: input.routerId,
            service_id: input.serviceId,
            status: 'pending',
            updated_at: input.createdAt.toISOString(),
          })
          .onConflict((conflict) =>
            conflict
              .columns(['company_id', 'router_id', 'service_id', 'resource_type'])
              .doNothing(),
          )
          .execute();
      });
      const record = await this.session.execute((database) =>
        database
          .selectFrom('mikrotik_resources')
          .selectAll()
          .where('company_id', '=', input.companyId)
          .where('router_id', '=', input.routerId)
          .where('service_id', '=', input.serviceId)
          .where('resource_type', '=', 'simple_queue')
          .executeTakeFirst(),
      );
      if (record === undefined) throw new Error('No fue posible reservar el recurso MikroTik.');
      return {
        companyId: record.company_id,
        createdAt: new Date(record.created_at),
        desiredHash: record.desired_hash ?? undefined,
        lastReconciledAt:
          record.last_reconciled_at === null ? undefined : new Date(record.last_reconciled_at),
        remoteId: record.remote_id ?? undefined,
        remoteName: record.remote_name ?? undefined,
        resourceId: record.id,
        resourceType: 'simple_queue',
        routerId: record.router_id,
        serviceId: record.service_id,
        status: record.status,
        updatedAt: new Date(record.updated_at),
      };
    });
  }
}
