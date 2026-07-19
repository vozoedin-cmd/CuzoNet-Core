export interface MaintenanceSuppressionInput {
  readonly companyId: string;
  readonly equipmentId: string;
  readonly observedAt: Date;
}

export interface MaintenanceWindowProvider {
  isSuppressed(input: MaintenanceSuppressionInput): Promise<boolean>;
}
