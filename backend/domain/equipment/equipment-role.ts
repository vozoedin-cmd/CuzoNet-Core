export class EquipmentRole {
  private constructor(public readonly value: string) {}

  public static create(value: string): EquipmentRole {
    if (!value || value.trim() === '') {
      throw new Error('EquipmentRole cannot be empty');
    }
    return new EquipmentRole(value.trim());
  }
}
