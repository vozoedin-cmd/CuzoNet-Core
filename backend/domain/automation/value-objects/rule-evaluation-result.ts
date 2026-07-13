export class RuleEvaluationResult {
  private constructor(public readonly matched: boolean) {}
  public static matched(): RuleEvaluationResult {
    return new RuleEvaluationResult(true);
  }
  public static notMatched(): RuleEvaluationResult {
    return new RuleEvaluationResult(false);
  }
}
