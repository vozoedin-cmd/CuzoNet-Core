export interface ProvisioningProfile {
  planVersionId: string;
  values: Readonly<Record<string, string | number | boolean>>;
}

export interface ProvisioningProfileReader {
  findByPlanVersionId(
    companyId: string,
    planVersionId: string,
  ): Promise<ProvisioningProfile | null>;
}
