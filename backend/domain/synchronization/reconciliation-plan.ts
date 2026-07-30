import type { ReconciliationItem } from './reconciliation-item.js';
import { isActionableReconciliationStatus } from './reconciliation-status.js';

export type ReconciliationMode = 'dry-run';

export interface ReconciliationSummary {
  readonly ambiguous: number;
  readonly drifted: number;
  readonly inSync: number;
  readonly isConverged: boolean;
  readonly missing: number;
  readonly total: number;
  readonly unexpected: number;
}

export interface ReconciliationPlanProps {
  readonly companyId: string;
  readonly generatedAt: Date;
  readonly items: readonly ReconciliationItem[];
  readonly mode: ReconciliationMode;
  readonly routerId: string;
  readonly summary: ReconciliationSummary;
}

/**
 * The result of one Synchronization Engine run for a router: every compared
 * resource's reconciliation status, plus a summary count. Phase 1 only ever
 * produces `mode: 'dry-run'` plans — no action is taken on the router, ever,
 * regardless of what the plan finds. Applying a plan is a future phase, and
 * would be a separate step that hands `missing`/`drifted` items to the
 * Provisioning Engine.
 */
export class ReconciliationPlan {
  private constructor(private readonly props: ReconciliationPlanProps) {}

  public static create(
    companyId: string,
    routerId: string,
    generatedAt: Date,
    items: readonly ReconciliationItem[],
  ): ReconciliationPlan {
    const summary: ReconciliationSummary = {
      ambiguous: items.filter((item) => item.status === 'ambiguous').length,
      drifted: items.filter((item) => item.status === 'drifted').length,
      inSync: items.filter((item) => item.status === 'in_sync').length,
      isConverged: !items.some(
        (item) => item.status === 'ambiguous' || isActionableReconciliationStatus(item.status),
      ),
      missing: items.filter((item) => item.status === 'missing').length,
      total: items.length,
      unexpected: items.filter((item) => item.status === 'unexpected').length,
    };
    return new ReconciliationPlan({
      companyId,
      generatedAt,
      items,
      mode: 'dry-run',
      routerId,
      summary,
    });
  }

  public get companyId(): string {
    return this.props.companyId;
  }

  public get routerId(): string {
    return this.props.routerId;
  }

  public get generatedAt(): Date {
    return this.props.generatedAt;
  }

  public get mode(): ReconciliationMode {
    return this.props.mode;
  }

  public get items(): readonly ReconciliationItem[] {
    return this.props.items;
  }

  public get summary(): ReconciliationSummary {
    return this.props.summary;
  }
}
