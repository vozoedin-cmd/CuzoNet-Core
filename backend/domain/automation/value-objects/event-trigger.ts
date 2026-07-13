import { UnsupportedAutomationEventError } from '../errors/unsupported-automation-event.error.js';
export const automationEventTypes = [
  'ClientCreated.v1',
  'PlanVersionCreated.v1',
  'PaymentRecorded.v1',
  'ServiceSuspended.v1',
  'ServiceReactivated.v1',
  'NetworkOperationFailed.v1',
] as const;
export type AutomationEventType = (typeof automationEventTypes)[number];
export class EventTrigger {
  private constructor(
    public readonly eventType: AutomationEventType,
    public readonly schemaVersion: 1,
  ) {}
  public static create(eventType: string, schemaVersion: number): EventTrigger {
    if (!automationEventTypes.some((candidate) => candidate === eventType) || schemaVersion !== 1)
      throw new UnsupportedAutomationEventError();
    return new EventTrigger(eventType as AutomationEventType, 1);
  }
}
