import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';
import type { MangleRuleReference } from './mangle-rule-reference.js';

const MARKER_PREFIX = 'cuzonet:firewall-mangle:';
const MARKER_PATTERN = new RegExp(`^${MARKER_PREFIX}(\\S+)`);
const MAX_LENGTH = 255;

/**
 * RouterOS firewall Mangle comment carrying a stable
 * "cuzonet:firewall-mangle:<ruleReference>" marker — deliberately distinct
 * from Filter Rules' and NAT's markers so the three resource kinds are
 * never confused when inspecting a router — so rule identity can be
 * recovered by scanning comments instead of depending on RouterOS's
 * mutable ".id".
 */
export class MangleRuleComment {
  private constructor(
    public readonly value: string,
    public readonly ruleReference: string,
  ) {}

  public static create(ruleReference: MangleRuleReference, userComment?: string): MangleRuleComment {
    const marker = `${MARKER_PREFIX}${ruleReference.value}`;
    const trimmedUserComment = userComment?.trim();
    const raw = trimmedUserComment && trimmedUserComment.length > 0 ? `${marker} ${trimmedUserComment}` : marker;
    if (raw.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'comment',
        `El comentario no puede exceder los ${MAX_LENGTH} caracteres, incluyendo el marcador técnico.`,
      );
    }
    return new MangleRuleComment(raw, ruleReference.value);
  }

  /** Recovers the ruleReference embedded in a raw RouterOS comment, or null if it carries no Mangle marker. */
  public static extractReference(comment: string | undefined | null): string | null {
    if (comment === undefined || comment === null) {
      return null;
    }
    const match = MARKER_PATTERN.exec(comment);
    return match ? match[1]! : null;
  }
}
