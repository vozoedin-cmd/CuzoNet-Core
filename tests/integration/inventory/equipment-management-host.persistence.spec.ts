import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '../../../backend/application/ports/clock.port.js';
import { EquipmentCapabilities } from '../../../backend/domain/inventory/equipment-capabilities.js';
import { Equipment } from '../../../backend/domain/inventory/equipment.js';
import { ManagementHost } from '../../../backend/domain/inventory/management-host.js';
import { EquipmentRole } from '../../../backend/domain/inventory/equipment-role.js';
import { EquipmentType } from '../../../backend/domain/inventory/equipment-type.js';
import { CompanyBootstrap } from '../../../backend/infrastructure/database/sqlite/bootstrap/company-bootstrap.js';
import { migrations } from '../../../backend/infrastructure/database/sqlite/migration/migration-registry.js';
import { MigrationRunner } from '../../../backend/infrastructure/database/sqlite/migration/migration-runner.js';
import { equipmentManagementHostMigration } from '../../../backend/infrastructure/database/sqlite/migrations/0016-equipment-management-host.js';
import { SqliteDatabase } from '../../../backend/infrastructure/database/sqlite/sqlite-database.js';
import { UuidV7IdGenerator } from '../../../backend/infrastructure/identity/uuid-v7-id-generator.js';
import { SqliteEquipmentRepository } from '../../../backend/infrastructure/inventory/sqlite-equipment.repository.js';
import { SqliteInventoryReaderAdapter } from '../../../backend/infrastructure/monitoring/sqlite-inventory-reader.adapter.js';

const now = new Date('2026-07-18T12:00:00.000Z');
const clock: Clock = { now: () => now };

describe('Equipment management host SQLite integration', () => {
  let companyId: string;
  let database: SqliteDatabase;
  let repository: SqliteEquipmentRepository;

  beforeEach(async () => {
    database = new SqliteDatabase({ busyTimeoutMs: 1_000, path: ':memory:' });
    new MigrationRunner(database.connection, clock).migrate();
    companyId = await new CompanyBootstrap(database.session, new UuidV7IdGenerator()).bootstrap(
      {
        currencyCode: 'GTQ',
        displayName: 'CuzoNet',
        legalName: 'CuzoNet',
        timezone: 'America/Guatemala',
      },
      now,
    );
    repository = new SqliteEquipmentRepository(database.connection);
  });

  afterEach(async () => {
    await database.close();
  });

  it('persiste y rehidrata ManagementHost', async () => {
    await repository.save(createEquipment('equipment-with-host', 'Router.EXAMPLE.COM'));

    const rehydrated = await repository.findById('equipment-with-host');

    expect(rehydrated?.props.managementHost?.value).toBe('router.example.com');
    expect(
      database.connection
        .prepare('SELECT management_host FROM network_assets WHERE id = ?')
        .get('equipment-with-host'),
    ).toEqual({ management_host: 'router.example.com' });
  });

  it('mantiene compatibilidad nullable y permite eliminar el host', async () => {
    const equipment = createEquipment('equipment-nullable');
    await repository.save(equipment);
    expect((await repository.findById(equipment.id))?.props).not.toHaveProperty('managementHost');

    equipment.setManagementHost(ManagementHost.create('192.0.2.20'));
    await repository.save(equipment);
    equipment.setManagementHost(null);
    await repository.save(equipment);

    expect((await repository.findById(equipment.id))?.props).not.toHaveProperty('managementHost');
    expect(
      database.connection
        .prepare('SELECT management_host FROM network_assets WHERE id = ?')
        .get(equipment.id),
    ).toEqual({ management_host: null });
  });

  it('expone el host en Monitoring y omite la propiedad cuando es null', async () => {
    await repository.save(createEquipment('equipment-with-host', '2001:DB8::5'));
    await repository.save(createEquipment('equipment-without-host'));
    const reader = new SqliteInventoryReaderAdapter(database.connection);

    await expect(reader.findEquipmentById('equipment-with-host')).resolves.toMatchObject({
      id: 'equipment-with-host',
      managementHost: '2001:db8::5',
    });
    const withoutHost = await reader.findEquipmentById('equipment-without-host');
    expect(withoutHost).not.toHaveProperty('managementHost');
  });

  it('la migración 16 preserva equipos existentes y agrega null', async () => {
    const legacyDatabase = new SqliteDatabase({ busyTimeoutMs: 1_000, path: ':memory:' });
    try {
      for (const migration of migrations) {
        if (migration.version < equipmentManagementHostMigration.version) {
          legacyDatabase.connection.exec(migration.sql);
        }
      }
      legacyDatabase.connection
        .prepare(
          `
            INSERT INTO companies (
              id, legal_name, display_name, currency_code, timezone, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          'company-legacy',
          'Legacy',
          'Legacy',
          'GTQ',
          'America/Guatemala',
          'active',
          now.toISOString(),
        );
      legacyDatabase.connection
        .prepare(
          `
            INSERT INTO network_assets (
              id, company_id, asset_type, status, acquired_on, role, capabilities
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        )
        .run(
          'equipment-legacy',
          'company-legacy',
          'router',
          'active',
          now.toISOString(),
          'core',
          '{}',
        );

      legacyDatabase.connection.exec(equipmentManagementHostMigration.sql);

      expect(
        legacyDatabase.connection
          .prepare('SELECT id, management_host FROM network_assets WHERE id = ?')
          .get('equipment-legacy'),
      ).toEqual({ id: 'equipment-legacy', management_host: null });
    } finally {
      await legacyDatabase.close();
    }
  });

  function createEquipment(id: string, managementHost?: string): Equipment {
    return Equipment.create({
      acquiredOn: now,
      assignments: [],
      capabilities: EquipmentCapabilities.create({
        supportsHotspot: false,
        supportsPppoe: true,
      }),
      companyId,
      id,
      interfaces: [],
      ...(managementHost === undefined
        ? {}
        : { managementHost: ManagementHost.create(managementHost) }),
      role: EquipmentRole.create('core'),
      status: 'active',
      type: EquipmentType.create('router'),
    });
  }
});
