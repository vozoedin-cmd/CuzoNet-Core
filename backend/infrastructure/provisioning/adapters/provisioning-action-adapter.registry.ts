import type { ProvisioningActionAdapter } from '../../../application/ports/provisioning/provisioning-action-adapter.port.js';

export class ProvisioningActionAdapterRegistry {
  private readonly adapters = new Map<string, ProvisioningActionAdapter>();

  public register(adapter: ProvisioningActionAdapter): void {
    this.adapters.set(adapter.type, adapter);
  }

  public get(actionType: string): ProvisioningActionAdapter | undefined {
    return this.adapters.get(actionType);
  }

  public getMap(): ReadonlyMap<string, ProvisioningActionAdapter> {
    return this.adapters;
  }
}
