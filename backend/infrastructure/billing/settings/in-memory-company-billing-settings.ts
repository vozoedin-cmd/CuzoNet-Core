import type {
  CompanyBillingSettings,
  CompanyBillingSettingsPort,
} from '../../../application/ports/billing/company-billing-settings.port.js';
export class InMemoryCompanyBillingSettings implements CompanyBillingSettingsPort {
  public constructor(
    private readonly settings: CompanyBillingSettings = {
      currencyCode: 'GTQ',
      timezone: 'America/Guatemala',
    },
  ) {}
  public get(_companyId: string): Promise<CompanyBillingSettings> {
    return Promise.resolve(this.settings);
  }
}
