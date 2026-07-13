import type { AutomationUnitOfWork } from '../../../../application/ports/automation/automation-unit-of-work.port.js';
export class InMemoryAutomationUnitOfWork implements AutomationUnitOfWork {
  public execute<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}
