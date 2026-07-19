import { InvalidAutomationRuleError } from '../errors/invalid-automation-rule.error.js';
import { FactPath } from './fact-path.js';

export type AutomationActionType =
  | 'request_service_reactivation'
  | 'webhook'
  | 'n8n_webhook'
  | 'routeros_operation'
  | 'noop';

export type ActionDefinitionProps =
  | { actionType: 'request_service_reactivation'; actionVersion: number; reasonCode: string; targetFactPath: string }
  | { actionType: 'webhook'; actionVersion: number; configurationReference: string; payloadTemplate?: unknown }
  | { actionType: 'n8n_webhook'; actionVersion: number; configurationReference: string; workflowKey: string; payloadTemplate?: unknown }
  | { actionType: 'routeros_operation'; actionVersion: number; operationType: string; equipmentId: string; parameters?: Record<string, unknown> }
  | { actionType: 'noop'; actionVersion: number };

export class ActionDefinition {
  private constructor(
    public readonly actionType: AutomationActionType,
    public readonly actionVersion: number,
    public readonly reasonCode?: string,
    public readonly targetFactPath?: FactPath,
    public readonly configurationReference?: string,
    public readonly payloadTemplate?: unknown,
    public readonly workflowKey?: string,
    public readonly operationType?: string,
    public readonly equipmentId?: string,
    public readonly parameters?: Record<string, unknown>,
  ) {}

  public static create(props: ActionDefinitionProps): ActionDefinition {
    if (props.actionVersion !== 1)
      throw new InvalidAutomationRuleError(
        'actions.actionVersion',
        'La versión de acción soportada es 1.',
      );

    if (props.actionType === 'request_service_reactivation') {
      const target = FactPath.create(props.targetFactPath);
      if (target.value !== 'service.id')
        throw new InvalidAutomationRuleError(
          'actions.targetFactPath',
          'La reactivación debe obtener el objetivo de service.id.',
        );
      if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(props.reasonCode))
        throw new InvalidAutomationRuleError('actions.reasonCode', 'Reason code no permitido.');
      return new ActionDefinition(props.actionType, props.actionVersion, props.reasonCode, target);
    }

    if (props.actionType === 'webhook') {
      if (!/^[A-Z_]{2,63}$/.test(props.configurationReference)) {
        throw new InvalidAutomationRuleError('actions.configurationReference', 'Referencia de configuración inválida.');
      }
      return new ActionDefinition(
        props.actionType,
        props.actionVersion,
        undefined, undefined,
        props.configurationReference,
        props.payloadTemplate
      );
    }

    if (props.actionType === 'n8n_webhook') {
      if (!/^[A-Z_]{2,63}$/.test(props.configurationReference)) {
        throw new InvalidAutomationRuleError('actions.configurationReference', 'Referencia de configuración inválida.');
      }
      if (!props.workflowKey || typeof props.workflowKey !== 'string') {
        throw new InvalidAutomationRuleError('actions.workflowKey', 'El workflowKey es requerido.');
      }
      return new ActionDefinition(
        props.actionType,
        props.actionVersion,
        undefined, undefined,
        props.configurationReference,
        props.payloadTemplate,
        props.workflowKey
      );
    }

    if (props.actionType === 'routeros_operation') {
      if (!props.operationType || typeof props.operationType !== 'string') {
         throw new InvalidAutomationRuleError('actions.operationType', 'El operationType es requerido.');
      }
      if (!props.equipmentId || typeof props.equipmentId !== 'string') {
         throw new InvalidAutomationRuleError('actions.equipmentId', 'El equipmentId es requerido.');
      }
      return new ActionDefinition(
        props.actionType,
        props.actionVersion,
        undefined, undefined, undefined, undefined, undefined,
        props.operationType,
        props.equipmentId,
        props.parameters
      );
    }

    if (props.actionType === 'noop') {
      return new ActionDefinition(props.actionType, props.actionVersion);
    }

    throw new InvalidAutomationRuleError('actions.actionType', 'Tipo de acción no soportado.');
  }
}
