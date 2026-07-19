import type { AutomationActionAdapter, AutomationActionInput, AutomationActionResult } from '../../../application/ports/automation/automation-action-adapter.port.js';

export class NoOpAutomationActionAdapter implements AutomationActionAdapter {
  public readonly type = 'noop';

  public async execute(
    _configurationReference: string | undefined,
    _input: AutomationActionInput,
  ): Promise<AutomationActionResult> {
    return {
      outcome: 'success',
      metadata: { message: 'NoOp executed successfully' },
    };
  }
}
