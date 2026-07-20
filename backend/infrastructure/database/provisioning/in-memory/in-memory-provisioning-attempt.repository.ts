import type { ProvisioningAttemptRepository } from '../../../../application/ports/provisioning/provisioning-attempt-repository.port.js';
import type { ProvisioningAttempt } from '../../../../domain/provisioning/provisioning-attempt.js';

export class InMemoryProvisioningAttemptRepository implements ProvisioningAttemptRepository {
  public attempts = new Map<string, ProvisioningAttempt>();

  public async save(attempt: ProvisioningAttempt): Promise<void> {
    this.attempts.set(attempt.id, attempt);
  }

  public async findByRequestId(requestId: string): Promise<readonly ProvisioningAttempt[]> {
    const matched: ProvisioningAttempt[] = [];
    for (const attempt of this.attempts.values()) {
      if (attempt.requestId === requestId) {
        matched.push(attempt);
      }
    }
    return matched.sort((a, b) => a.attemptNumber - b.attemptNumber);
  }
}
