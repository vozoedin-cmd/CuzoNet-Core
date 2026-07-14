export class EquipmentType {
  private constructor(public readonly value: string) {}

  public static create(value: string): EquipmentType {
    if (!value || value.trim() === '') {
      throw new Error('EquipmentType cannot be empty');
    }
    return new EquipmentType(value.trim());
  }
}
