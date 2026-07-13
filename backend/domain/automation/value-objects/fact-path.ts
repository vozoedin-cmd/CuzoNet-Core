import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';
export const authorizedFactPaths = [
  'event.eventType',
  'event.aggregateId',
  'client.id',
  'client.status',
  'service.id',
  'service.lifecycleStatus',
  'billing.billingAccountId',
  'billing.debtCents',
  'billing.creditCents',
  'billing.overdueCents',
  'billing.currencyCode',
  'provisioning.operationId',
  'provisioning.operationStatus',
  'provisioning.attemptCount',
  'provisioning.errorCode',
] as const;
export type FactPathValue = (typeof authorizedFactPaths)[number];
export class FactPath {
  private constructor(public readonly value: FactPathValue) {}
  public static create(value: string): FactPath {
    if (!authorizedFactPaths.some((candidate) => candidate === value))
      throw new InvalidAutomationRuleError('condition.path', 'FactPath no autorizado.');
    return new FactPath(value as FactPathValue);
  }
}
