import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';
import { UnsupportedAutomationActionError } from '../errors/unsupported-automation-action.error.js';
import { FactPath } from './fact-path.js';
export type AutomationActionType = 'request_service_reactivation';
export interface ActionDefinitionProps {
  actionType: string;
  actionVersion: number;
  reasonCode: string;
  targetFactPath: string;
}
export class ActionDefinition {
  private constructor(
    public readonly actionType: AutomationActionType,
    public readonly actionVersion: 1,
    public readonly reasonCode: string,
    public readonly targetFactPath: FactPath,
  ) {}
  public static create(props: ActionDefinitionProps): ActionDefinition {
    if (props.actionType !== 'request_service_reactivation')
      throw new UnsupportedAutomationActionError();
    if (props.actionVersion !== 1)
      throw new InvalidAutomationRuleError(
        'actions.actionVersion',
        'La versión de acción soportada es 1.',
      );
    const target = FactPath.create(props.targetFactPath);
    if (target.value !== 'service.id')
      throw new InvalidAutomationRuleError(
        'actions.targetFactPath',
        'La reactivación debe obtener el objetivo de service.id.',
      );
    if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(props.reasonCode))
      throw new InvalidAutomationRuleError('actions.reasonCode', 'Reason code no permitido.');
    return new ActionDefinition('request_service_reactivation', 1, props.reasonCode, target);
  }
}
