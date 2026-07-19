import type { NotificationDestinationRepository } from '../../application/ports/notifications/repositories.js';
import { NotificationDestination } from '../../domain/notifications/notification-destination.js';
import type { NotificationEventType } from '../../domain/notifications/types.js';
import type { NotificationDestinationTable } from '../database/sqlite/database-schema.js';
import type { SqliteDatabaseSession } from '../database/sqlite/sqlite-database-session.js';

export class SqliteNotificationDestinationRepository implements NotificationDestinationRepository {
  public constructor(private readonly session: SqliteDatabaseSession) {}

  public save(destination: NotificationDestination): Promise<void> {
    const row = toRow(destination);
    return this.session.execute(async (database) => {
      await database
        .insertInto('notification_destinations')
        .values(row)
        .onConflict((conflict) =>
          conflict.column('id').doUpdateSet({
            channel: row.channel,
            configuration_reference: row.configuration_reference,
            enabled: row.enabled,
            event_types_json: row.event_types_json,
            minimum_severity: row.minimum_severity,
            name: row.name,
            updated_at: row.updated_at,
          }),
        )
        .execute();
    });
  }

  public findById(companyId: string, destinationId: string) {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('notification_destinations')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('id', '=', destinationId)
        .executeTakeFirst();
      return row === undefined ? null : fromRow(row);
    });
  }

  public findByName(companyId: string, name: string) {
    return this.session.execute(async (database) => {
      const row = await database
        .selectFrom('notification_destinations')
        .selectAll()
        .where('company_id', '=', companyId)
        .where('name', '=', name)
        .executeTakeFirst();
      return row === undefined ? null : fromRow(row);
    });
  }

  public list(companyId: string) {
    return this.session.execute(async (database) => {
      const rows = await database
        .selectFrom('notification_destinations')
        .selectAll()
        .where('company_id', '=', companyId)
        .orderBy('name', 'asc')
        .orderBy('id', 'asc')
        .execute();
      return rows.map(fromRow);
    });
  }

  public delete(companyId: string, destinationId: string): Promise<boolean> {
    return this.session.execute(async (database) => {
      const result = await database
        .deleteFrom('notification_destinations')
        .where('company_id', '=', companyId)
        .where('id', '=', destinationId)
        .executeTakeFirst();
      return result.numDeletedRows === 1n;
    });
  }
}

function toRow(destination: NotificationDestination): NotificationDestinationTable {
  const props = destination.props;
  return {
    channel: props.channel,
    company_id: props.companyId,
    configuration_reference: props.configurationReference,
    created_at: props.createdAt.toISOString(),
    enabled: props.enabled ? 1 : 0,
    event_types_json: JSON.stringify(props.eventTypes),
    id: props.id,
    minimum_severity: props.minimumSeverity ?? null,
    name: props.name,
    updated_at: props.updatedAt.toISOString(),
  };
}

function fromRow(row: NotificationDestinationTable): NotificationDestination {
  return NotificationDestination.reconstitute({
    channel: row.channel,
    companyId: row.company_id,
    configurationReference: row.configuration_reference,
    createdAt: new Date(row.created_at),
    enabled: row.enabled === 1,
    eventTypes: JSON.parse(row.event_types_json) as NotificationEventType[],
    id: row.id,
    ...(row.minimum_severity === null ? {} : { minimumSeverity: row.minimum_severity }),
    name: row.name,
    updatedAt: new Date(row.updated_at),
  });
}
