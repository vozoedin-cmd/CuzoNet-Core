import type { ConsumedDomainEventDto } from '../../../application/dto/automation/consumed-domain-event.dto.js';
import type { AutomationFactsPort } from '../../../application/ports/automation/automation-facts.port.js';
import type { BillingAutomationReader } from '../../../application/ports/automation/billing-automation-reader.port.js';
import type { ClientAutomationReader } from '../../../application/ports/automation/client-automation-reader.port.js';
import type { ProvisioningAutomationReader } from '../../../application/ports/automation/provisioning-automation-reader.port.js';
import type { ServiceAutomationReader } from '../../../application/ports/automation/service-automation-reader.port.js';
import { EvaluationContext } from '../../../domain/automation/value-objects/evaluation-context.js';
export class CompositeAutomationFactsAdapter implements AutomationFactsPort {
  public constructor(
    private readonly clients: ClientAutomationReader,
    private readonly services: ServiceAutomationReader,
    private readonly billing: BillingAutomationReader,
    private readonly provisioning: ProvisioningAutomationReader,
  ) {}
  public async buildContexts(event: ConsumedDomainEventDto): Promise<readonly EvaluationContext[]> {
    const base: Record<string, unknown> = {
      'event.aggregateId': event.aggregateId,
      'event.eventType': event.eventType,
    };
    const payload = event.payload;
    if (event.eventType === 'ClientCreated.v1') {
      const clientId = this.string(payload.clientId);
      const client =
        clientId === null ? null : await this.clients.findFacts(event.companyId, clientId);
      return [
        EvaluationContext.create(clientId ?? event.aggregateId, {
          ...base,
          ...(client === null
            ? {}
            : { 'client.id': client.clientId, 'client.status': client.status }),
        }),
      ];
    }
    if (event.eventType === 'PaymentRecorded.v1') {
      const clientId = this.string(payload.clientId);
      if (clientId === null) return [EvaluationContext.create(event.aggregateId, base)];
      const billingAccountId =
        typeof payload.billingAccountId === 'string' ? payload.billingAccountId : null;
      const contexts = await this.billing.contextsForPayment(
        event.companyId,
        clientId,
        billingAccountId,
      );
      return Promise.all(
        contexts.map(async (billing) => {
          const service = await this.services.findFacts(event.companyId, billing.serviceId);
          return EvaluationContext.create(billing.serviceId, {
            ...base,
            'billing.billingAccountId': billing.billingAccountId,
            'billing.creditCents': billing.creditCents,
            'billing.currencyCode': billing.currencyCode,
            'billing.debtCents': billing.debtCents,
            'billing.overdueCents': billing.overdueCents,
            'client.id': clientId,
            'service.id': billing.serviceId,
            ...(service === null ? {} : { 'service.lifecycleStatus': service.lifecycleStatus }),
          });
        }),
      );
    }
    if (event.eventType === 'ServiceSuspended.v1' || event.eventType === 'ServiceReactivated.v1') {
      const serviceId = this.string(payload.serviceId);
      const service =
        serviceId === null ? null : await this.services.findFacts(event.companyId, serviceId);
      return [
        EvaluationContext.create(serviceId ?? event.aggregateId, {
          ...base,
          ...(service === null
            ? {}
            : {
                'service.id': service.serviceId,
                'service.lifecycleStatus': service.lifecycleStatus,
              }),
        }),
      ];
    }
    if (event.eventType === 'NetworkOperationFailed.v1') {
      const operationId = this.string(payload.operationId);
      const serviceId = this.string(payload.serviceId);
      const errorCode = this.string(payload.errorCode);
      const attemptCount = typeof payload.attemptCount === 'number' ? payload.attemptCount : 0;
      if (operationId === null || serviceId === null || errorCode === null)
        return [EvaluationContext.create(event.aggregateId, base)];
      const operation = await this.provisioning.findFailureFacts(
        event.companyId,
        operationId,
        errorCode,
        attemptCount,
        serviceId,
      );
      return [
        EvaluationContext.create(operationId, {
          ...base,
          'provisioning.attemptCount': operation.attemptCount,
          'provisioning.errorCode': operation.errorCode,
          'provisioning.operationId': operation.operationId,
          'provisioning.operationStatus': operation.operationStatus,
          'service.id': operation.serviceId,
        }),
      ];
    }
    return [EvaluationContext.create(event.aggregateId, base)];
  }
  private string(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}
