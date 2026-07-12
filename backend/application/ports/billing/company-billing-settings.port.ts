export interface CompanyBillingSettings {
  currencyCode: string;
  timezone: string;
}
export interface CompanyBillingSettingsPort {
  get(companyId: string): Promise<CompanyBillingSettings>;
}
