export interface NotificationOutboxEnvelope {
  aggregateId: string;
  aggregateType: string;
  causationId: string;
  companyId: string;
  correlationId: string;
  eventId: string;
  eventType: string;
  occurredAt: string;
  payload: Readonly<Record<string, unknown>>;
  schemaVersion: number;
}
