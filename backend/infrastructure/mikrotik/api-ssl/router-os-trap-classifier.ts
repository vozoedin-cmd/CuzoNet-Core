import { RouterOsTrapError, UnknownTrap } from './router-os-api-errors.js';

export interface RouterOsTrapRule {
  category?: string;
  classification: 'PERMANENT' | 'RETRYABLE';
  message: RegExp;
}

const explicitRules: readonly RouterOsTrapRule[] = Object.freeze([
  { category: '0', classification: 'PERMANENT', message: /no such (command|item)/i },
  { category: '1', classification: 'PERMANENT', message: /invalid|expected|missing/i },
  { category: '2', classification: 'RETRYABLE', message: /busy|not ready|timed? ?out/i },
  { category: '5', classification: 'RETRYABLE', message: /busy|not ready|timed? ?out/i },
]);

export class RouterOsTrapClassifier {
  public constructor(private readonly rules: readonly RouterOsTrapRule[] = explicitRules) {}

  public classify(category: string | undefined, message: string): RouterOsTrapError {
    const rule = this.rules.find(
      (candidate) =>
        (candidate.category === undefined || candidate.category === category) &&
        candidate.message.test(message),
    );
    if (rule === undefined) return new UnknownTrap(category, message);
    return new RouterOsTrapError(category, rule.classification, message);
  }
}
