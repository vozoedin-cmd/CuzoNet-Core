import { describe, expect, it, vi } from 'vitest';

import { SetEquipmentManagementHostUseCase } from '../../../../backend/application/inventory/set-equipment-management-host.usecase.js';
import { EquipmentCapabilities } from '../../../../backend/domain/inventory/equipment-capabilities.js';
import type { EquipmentRepository } from '../../../../backend/domain/inventory/equipment.repository.js';
import { Equipment } from '../../../../backend/domain/inventory/equipment.js';
import { EquipmentNotFoundError } from '../../../../backend/domain/inventory/errors/equipment-not-found.error.js';
import { InvalidEquipmentDataError } from '../../../../backend/domain/inventory/errors/invalid-equipment-data.error.js';
import { ManagementHost } from '../../../../backend/domain/inventory/management-host.js';
import { EquipmentRole } from '../../../../backend/domain/inventory/equipment-role.js';
import { EquipmentType } from '../../../../backend/domain/inventory/equipment-type.js';

describe('SetEquipmentManagementHostUseCase', () => {
  it('asigna un host administrativo', async () => {
    const equipment = createEquipment();
    const repository = fakeRepository(equipment);

    await new SetEquipmentManagementHostUseCase(repository).execute({
      companyId: 'company-1',
      equipmentId: equipment.id,
      managementHost: ' Router.EXAMPLE.COM ',
    });

    expect(equipment.props.managementHost?.value).toBe('router.example.com');
    expect(repository.save).toHaveBeenCalledWith(equipment);
  });

  it('reemplaza un host existente', async () => {
    const equipment = createEquipment(ManagementHost.create('router-old.example.com'));
    const repository = fakeRepository(equipment);

    await new SetEquipmentManagementHostUseCase(repository).execute({
      companyId: 'company-1',
      equipmentId: equipment.id,
      managementHost: '2001:db8::10',
    });

    expect(equipment.props.managementHost?.value).toBe('2001:db8::10');
  });

  it('elimina el host usando null', async () => {
    const equipment = createEquipment(ManagementHost.create('192.0.2.10'));
    const repository = fakeRepository(equipment);

    await new SetEquipmentManagementHostUseCase(repository).execute({
      companyId: 'company-1',
      equipmentId: equipment.id,
      managementHost: null,
    });

    expect(equipment.props).not.toHaveProperty('managementHost');
    expect(repository.save).toHaveBeenCalledWith(equipment);
  });

  it('rechaza un equipo inexistente', async () => {
    const repository = fakeRepository(null);

    await expect(
      new SetEquipmentManagementHostUseCase(repository).execute({
        companyId: 'company-1',
        equipmentId: 'missing',
        managementHost: 'router.example.com',
      }),
    ).rejects.toBeInstanceOf(EquipmentNotFoundError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('oculta equipos de otra compañía como no encontrados', async () => {
    const repository = fakeRepository(createEquipment());

    await expect(
      new SetEquipmentManagementHostUseCase(repository).execute({
        companyId: 'company-2',
        equipmentId: 'equipment-1',
        managementHost: 'router.example.com',
      }),
    ).rejects.toBeInstanceOf(EquipmentNotFoundError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('rechaza un valor inválido sin persistir', async () => {
    const repository = fakeRepository(createEquipment());

    await expect(
      new SetEquipmentManagementHostUseCase(repository).execute({
        companyId: 'company-1',
        equipmentId: 'equipment-1',
        managementHost: 'https://router.example.com',
      }),
    ).rejects.toBeInstanceOf(InvalidEquipmentDataError);
    expect(repository.save).not.toHaveBeenCalled();
  });
});

function createEquipment(managementHost?: ManagementHost): Equipment {
  return Equipment.create({
    acquiredOn: new Date('2026-07-18T00:00:00.000Z'),
    assignments: [],
    capabilities: EquipmentCapabilities.create({
      supportsHotspot: false,
      supportsPppoe: true,
    }),
    companyId: 'company-1',
    id: 'equipment-1',
    interfaces: [],
    ...(managementHost === undefined ? {} : { managementHost }),
    role: EquipmentRole.create('core'),
    status: 'active',
    type: EquipmentType.create('router'),
  });
}

function fakeRepository(equipment: Equipment | null): EquipmentRepository {
  return {
    findById: vi.fn().mockResolvedValue(equipment),
    save: vi.fn().mockResolvedValue(undefined),
  };
}
