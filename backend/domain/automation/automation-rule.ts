import { AutomationRuleConflictError } from './errors/automation-rule-conflict.error.js';
import { InvalidAutomationRuleError } from './errors/invalid-automation-rule.error.js';
import { UnsupportedAutomationActionError } from './errors/unsupported-automation-action.error.js';
import type { ActionDefinition } from './value-objects/action-definition.js';
import type { AutomationRuleId } from './value-objects/automation-rule-id.js';
import type { AutomationRuleName } from './value-objects/automation-rule-name.js';
import { AutomationRuleStatus } from './value-objects/automation-rule-status.js';
import type { AutomationRuleVersion } from './value-objects/automation-rule-version.js';
import type { EventTrigger } from './value-objects/event-trigger.js';
import type { RuleCondition } from './value-objects/rule-condition.js';
export interface AutomationRuleProps {
  actions: readonly ActionDefinition[];
  companyId: string;
  condition: RuleCondition;
  createdAt: Date;
  createdBy: string;
  id: AutomationRuleId;
  name: AutomationRuleName;
  priority: number;
  status: AutomationRuleStatus;
  trigger: EventTrigger;
  updatedAt: Date | undefined;
  updatedBy: string | undefined;
  version: AutomationRuleVersion;
}
export interface ReviseAutomationRuleProps {
  actions: readonly ActionDefinition[];
  condition: RuleCondition;
  expectedVersion: number;
  name: AutomationRuleName;
  priority: number;
  updatedAt: Date;
  updatedBy: string;
}
export class AutomationRule {
  private constructor(private readonly props: AutomationRuleProps) {
    this.validate();
  }
  public static create(
    props: Omit<AutomationRuleProps, 'updatedAt' | 'updatedBy' | 'version'> & {
      version: AutomationRuleVersion;
    },
  ): AutomationRule {
    return new AutomationRule({ ...props, updatedAt: undefined, updatedBy: undefined });
  }
  public static rehydrate(props: AutomationRuleProps): AutomationRule {
    return new AutomationRule(props);
  }
  private validate(): void {
    if (
      !Number.isSafeInteger(this.props.priority) ||
      this.props.priority < 0 ||
      this.props.priority > 1000
    )
      throw new InvalidAutomationRuleError('priority', 'Debe ser un entero entre 0 y 1000.');
    if (this.props.actions.length < 1 || this.props.actions.length > 5)
      throw new InvalidAutomationRuleError('actions', 'Debe contener entre 1 y 5 acciones.');
    if (
      this.props.actions.some((action) => action.actionType === 'request_service_reactivation') &&
      this.props.trigger.eventType !== 'PaymentRecorded.v1'
    )
      throw new UnsupportedAutomationActionError();
  }
  public revise(props: ReviseAutomationRuleProps): void {
    if (props.expectedVersion !== this.version.value)
      throw new AutomationRuleConflictError('La versión de la regla cambió.');
    this.props.name = props.name;
    this.props.condition = props.condition;
    this.props.actions = [...props.actions];
    this.props.priority = props.priority;
    this.props.version = this.props.version.next();
    this.props.updatedAt = props.updatedAt;
    this.props.updatedBy = props.updatedBy;
    this.validate();
  }
  public activate(): void {
    this.props.status = AutomationRuleStatus.active();
  }
  public deactivate(): void {
    this.props.status = AutomationRuleStatus.inactive();
  }
  public get id(): AutomationRuleId {
    return this.props.id;
  }
  public get companyId(): string {
    return this.props.companyId;
  }
  public get name(): AutomationRuleName {
    return this.props.name;
  }
  public get version(): AutomationRuleVersion {
    return this.props.version;
  }
  public get status(): AutomationRuleStatus {
    return this.props.status;
  }
  public get trigger(): EventTrigger {
    return this.props.trigger;
  }
  public get condition(): RuleCondition {
    return this.props.condition;
  }
  public get actions(): readonly ActionDefinition[] {
    return [...this.props.actions];
  }
  public get priority(): number {
    return this.props.priority;
  }
  public get createdAt(): Date {
    return new Date(this.props.createdAt);
  }
  public get createdBy(): string {
    return this.props.createdBy;
  }
  public get updatedAt(): Date | undefined {
    return this.props.updatedAt === undefined ? undefined : new Date(this.props.updatedAt);
  }
  public get updatedBy(): string | undefined {
    return this.props.updatedBy;
  }
}
