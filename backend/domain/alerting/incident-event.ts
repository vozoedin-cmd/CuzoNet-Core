import { incidentEventTypes, type IncidentEventType } from './incident-types.js';

export interface IncidentEventProps {
  readonly companyId: string;
  readonly id: string;
  readonly incidentId: string;
  readonly occurredAt: Date;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly type: IncidentEventType;
}

const forbiddenPayloadKeys = /password|community|credential|secret|token/i;

export class IncidentEvent {
  private constructor(public readonly props: IncidentEventProps) {}

  public static create(props: IncidentEventProps): IncidentEvent {
    if (props.id.trim().length === 0) throw new Error('IncidentEvent id is required.');
    if (props.incidentId.trim().length === 0)
      throw new Error('IncidentEvent incidentId is required.');
    if (props.companyId.trim().length === 0)
      throw new Error('IncidentEvent companyId is required.');
    if (!incidentEventTypes.includes(props.type)) throw new Error('IncidentEvent type is invalid.');
    if (Number.isNaN(props.occurredAt.getTime())) {
      throw new RangeError('IncidentEvent occurredAt must be valid.');
    }
    assertSafePayload(props.payload);
    return new IncidentEvent({
      ...props,
      occurredAt: new Date(props.occurredAt),
      payload: Object.freeze({ ...props.payload }),
    });
  }
}

function assertSafePayload(payload: Readonly<Record<string, unknown>>): void {
  for (const [key, value] of Object.entries(payload)) {
    if (forbiddenPayloadKeys.test(key)) throw new Error('IncidentEvent payload contains a secret.');
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      assertSafePayload(value as Readonly<Record<string, unknown>>);
    }
  }
}
