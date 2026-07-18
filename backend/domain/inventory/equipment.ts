import type { EquipmentRole } from './equipment-role.js';
import type { EquipmentType } from './equipment-type.js';
import type { EquipmentCapabilities } from './equipment-capabilities.js';
import type { EquipmentInterface } from './equipment-interface.js';
import type { EquipmentAssignment } from './equipment-assignment.js';
import type { ManagementHost } from './management-host.js';

export interface EquipmentProps {
  id: string;
  companyId: string;
  assetModelId?: string;
  serialNumber?: string;
  macAddress?: string;
  managementHost?: ManagementHost;
  type: EquipmentType;
  role: EquipmentRole;
  capabilities: EquipmentCapabilities;
  status: 'active' | 'inactive' | 'retired';
  acquiredOn: Date;
  interfaces: EquipmentInterface[];
  assignments: EquipmentAssignment[];
}

export class Equipment {
  private constructor(public readonly props: EquipmentProps) {}

  public static create(props: EquipmentProps): Equipment {
    return new Equipment(props);
  }

  public get id(): string {
    return this.props.id;
  }

  public setManagementHost(managementHost: ManagementHost | null): void {
    if (managementHost === null) {
      delete this.props.managementHost;
      return;
    }
    this.props.managementHost = managementHost;
  }

  public assign(assignment: EquipmentAssignment): void {
    const activeAssignment = this.props.assignments.find((a) => !a.props.assignedTo);
    if (activeAssignment) {
      throw new Error('Equipment already has an active assignment');
    }
    this.props.assignments.push(assignment);
  }

  public addInterface(iface: EquipmentInterface): void {
    this.props.interfaces.push(iface);
  }
}
