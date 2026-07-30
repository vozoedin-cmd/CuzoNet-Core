import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';
import type { FilterRuleReference } from './filter-rule-reference.js';

const MARKER_PREFIX = 'cuzonet:firewall-filter:';
const MARKER_PATTERN = new RegExp(`^${MARKER_PREFIX}(\\S+)`);
const MAX_LENGTH = 255;

/**
 * RouterOS firewall filter comment carrying a stable
 * "cuzonet:firewall-filter:<ruleReference>" marker, so rule identity can be
 * recovered by scanning comments instead of depending on RouterOS's mutable
 * ".id" (which does not survive exports/restores/recreations).
 */
export class FilterRuleComment {
  private constructor(
    public readonly value: string,
    public readonly ruleReference: string,
  ) {}

  public static create(ruleReference: FilterRuleReference, userComment?: string): FilterRuleComment {
    const marker = `${MARKER_PREFIX}${ruleReference.value}`;
    const trimmedUserComment = userComment?.trim();
    const raw = trimmedUserComment && trimmedUserComment.length > 0 ? `${marker} ${trimmedUserComment}` : marker;
    if (raw.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'comment',
        `El comentario no puede exceder los ${MAX_LENGTH} caracteres, incluyendo el marcador técnico.`,
      );
    }
    return new FilterRuleComment(raw, ruleReference.value);
  }

  /** Recovers the ruleReference embedded in a raw RouterOS comment, or null if it carries no marker. */
  public static extractReference(comment: string | undefined | null): string | null {
    if (comment === undefined || comment === null) {
      return null;
    }
    const match = MARKER_PATTERN.exec(comment);
    return match ? match[1]! : null;
  }

  public static parseOwnership(comment: string | undefined | null): {
    status: 'valid' | 'legacy' | 'malformed' | 'foreign' | 'unmanaged';
    ruleReference?: string;
    userComment?: string;
  } {
    if (!comment || comment.trim() === '') {
      return { status: 'unmanaged' };
    }
    const trimmed = comment.trim();
    if (trimmed.startsWith('cuzonet:')) {
      if (trimmed.startsWith(MARKER_PREFIX)) {
        const match = MARKER_PATTERN.exec(trimmed);
        if (match && match[1]) {
          const ruleReference = match[1];
          const userComment = trimmed.substring(match[0].length).trim();
          return {
            status: 'valid',
            ruleReference,
            ...(userComment ? { userComment } : {}),
          };
        }
        return { status: 'malformed' };
      }
      return { status: 'foreign' };
    }
    return { status: 'unmanaged' };
  }
}
