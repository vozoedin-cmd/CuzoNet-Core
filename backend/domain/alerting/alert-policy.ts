
import type { AlertSeverity, AlertCategory, AlertCondition } from './types.js';

export interface AlertPolicyProps {
  id: string;
  companyId: string;
  name: string;
  category: AlertCategory;
  severity: AlertSeverity;
  condition: AlertCondition;
  isActive: boolean;
}

export class AlertPolicy {
  private constructor(public readonly props: AlertPolicyProps) {}

  public static create(props: AlertPolicyProps): AlertPolicy {
    // Basic validation
    if (!props.name || props.name.trim() === '') {
      throw new Error('AlertPolicy must have a name');
    }
    return new AlertPolicy({ ...props });
  }
}
