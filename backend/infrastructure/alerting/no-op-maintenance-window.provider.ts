import type {
  MaintenanceSuppressionInput,
  MaintenanceWindowProvider,
} from '../../application/ports/alerting/maintenance-window.provider.js';

export class NoOpMaintenanceWindowProvider implements MaintenanceWindowProvider {
  public isSuppressed(_input: MaintenanceSuppressionInput): Promise<boolean> {
    return Promise.resolve(false);
  }
}
