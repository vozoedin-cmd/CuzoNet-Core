import type { BillingAccountDto } from '../../../../dto/billing/billing-account.dto.js';
import type { BillingAccountReader } from '../../../../ports/billing/billing-account-reader.port.js';
import type { BillingAccountRepository } from '../../../../ports/billing/billing-account-repository.port.js';
import type { ClientBillingReader } from '../../../../ports/billing/client-billing-reader.port.js';
import type { CompanyBillingSettingsPort } from '../../../../ports/billing/company-billing-settings.port.js';
import type { ServiceBillingReader } from '../../../../ports/billing/service-billing-reader.port.js';
import type { Clock } from '../../../../ports/clock.port.js';
import type { CompanyContext } from '../../../../ports/company-context.port.js';
import type { IdGenerator } from '../../../../ports/id-generator.port.js';
import { BillingAccount } from '../../../../../domain/billing/accounts/billing-account.js';
import { BillingAccountId } from '../../../../../domain/billing/accounts/value-objects/billing-account-id.js';
import { ClientBillingReferenceId } from '../../../../../domain/billing/accounts/value-objects/client-billing-reference-id.js';
import { ServiceBillingReferenceId } from '../../../../../domain/billing/accounts/value-objects/service-billing-reference-id.js';
import { BillingConflictError } from '../../../../../domain/billing/errors/billing-conflict.error.js';
import { CurrencyCode } from '../../../../../domain/billing/shared/currency-code.js';
import { ServiceNotFoundError } from '../../../../../domain/services/errors/service-not-found.error.js';

export class OpenBillingAccount {
  public constructor(
    private readonly repository: BillingAccountRepository,
    private readonly _reader: BillingAccountReader,
    private readonly serviceReader: ServiceBillingReader,
    private readonly clientReader: ClientBillingReader,
    private readonly settings: CompanyBillingSettingsPort,
    private readonly companyContext: CompanyContext,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}
  public async execute(input: { serviceId: string }): Promise<BillingAccountDto> {
    const companyId = this.companyContext.getCompanyId();
    const service = await this.serviceReader.findById(companyId, input.serviceId);
    if (service === null) throw new ServiceNotFoundError();
    const client = await this.clientReader.findById(companyId, service.clientId);
    if (client === null || client.status === 'archived')
      throw new BillingConflictError('El cliente no puede abrir una cuenta de facturación.');
    const config = await this.settings.get(companyId);
    if (await this.repository.hasActive(companyId, service.serviceId, config.currencyCode))
      throw new BillingConflictError('Ya existe una cuenta activa para el servicio y moneda.');
    const account = BillingAccount.open({
      clientId: ClientBillingReferenceId.create(service.clientId),
      companyId,
      currency: CurrencyCode.create(config.currencyCode),
      id: BillingAccountId.create(this.idGenerator.generate()),
      openedAt: this.clock.now(),
      serviceId: ServiceBillingReferenceId.create(service.serviceId),
    });
    await this.repository.save(account);
    return {
      clientId: account.clientId,
      currencyCode: account.currency.value,
      id: account.id.value,
      openedAt: account.openedAt.toISOString(),
      serviceId: account.serviceId.value,
      status: account.status,
    };
  }
}
