/** RouterOS "disabled" flag modeled as a named state instead of a bare boolean, with its wire ("yes"/"no") serialization. */
export class DisabledState {
  private constructor(public readonly value: boolean) {}

  public static create(value: boolean): DisabledState {
    return new DisabledState(value);
  }

  public static enabled(): DisabledState {
    return new DisabledState(false);
  }

  public static disabled(): DisabledState {
    return new DisabledState(true);
  }

  public isDisabled(): boolean {
    return this.value;
  }

  public isEnabled(): boolean {
    return !this.value;
  }

  public toRouterOsFlag(): 'yes' | 'no' {
    return this.value ? 'yes' : 'no';
  }
}
