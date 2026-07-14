export interface EquipmentAssignmentProps {
  id: string;
  serviceId?: string;
  nodeId?: string;
  assignedFrom: Date;
  assignedTo?: Date;
  role: string;
  assignedBy: string;
  releasedBy?: string;
}

export class EquipmentAssignment {
  private constructor(public readonly props: EquipmentAssignmentProps) {}

  public static create(props: EquipmentAssignmentProps): EquipmentAssignment {
    return new EquipmentAssignment(props);
  }
  
  public release(releasedBy: string, date: Date = new Date()): void {
    if (this.props.assignedTo) {
      throw new Error('Assignment is already released');
    }
    this.props.assignedTo = date;
    this.props.releasedBy = releasedBy;
  }
}
