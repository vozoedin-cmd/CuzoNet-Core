export class ActionRequestKey {
  private constructor(public readonly value: string) {}
  public static create(
    ruleId: string,
    ruleVersion: number,
    eventId: string,
    contextId: string,
    actionIndex: number,
  ): ActionRequestKey {
    return new ActionRequestKey(`${ruleId}:${ruleVersion}:${eventId}:${contextId}:${actionIndex}`);
  }
}
