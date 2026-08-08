import { InvalidProvisioningDataError } from '../../errors/invalid-provisioning-data.error.js';
import type { RawRuleReference } from './raw-rule-reference.js';

const MARKER_PREFIX = 'cuzonet:firewall-raw:';
const MARKER_PATTERN = new RegExp(`^${MARKER_PREFIX}(\\S+)`);
const MAX_LENGTH = 255;

/**
 * Comentario de una regla de `/ip/firewall/raw` con el marcador estable
 * `cuzonet:firewall-raw:<ruleReference>` — deliberadamente distinto de los de Filter, NAT y
 * Mangle para que los cuatro recursos nunca se confundan al inspeccionar un router — de modo
 * que la identidad se recupere leyendo comentarios en vez de depender del `.id` mutable.
 */
export class RawRuleComment {
  private constructor(
    public readonly value: string,
    public readonly ruleReference: string,
  ) {}

  public static create(ruleReference: RawRuleReference, userComment?: string): RawRuleComment {
    const marker = `${MARKER_PREFIX}${ruleReference.value}`;
    const trimmedUserComment = userComment?.trim();
    const raw = trimmedUserComment && trimmedUserComment.length > 0 ? `${marker} ${trimmedUserComment}` : marker;
    if (raw.length > MAX_LENGTH) {
      throw new InvalidProvisioningDataError(
        'comment',
        `El comentario no puede exceder los ${MAX_LENGTH} caracteres, incluyendo el marcador técnico.`,
      );
    }
    return new RawRuleComment(raw, ruleReference.value);
  }

  /** Recupera la ruleReference embebida en un comentario crudo, o null si no lleva marcador de Raw. */
  public static extractReference(comment: string | undefined | null): string | null {
    if (comment === undefined || comment === null) {
      return null;
    }
    const match = MARKER_PATTERN.exec(comment);
    return match ? match[1]! : null;
  }

  /**
   * Clasifica un comentario crudo de RouterOS. Devuelve exactamente cuatro estados; solo
   * `valid` aporta `ruleReference`, que es lo que hace resoluble a una regla.
   *
   * No existe un estado `legacy`: Raw se implementa con un único formato de marcador desde
   * el principio, así que no hay ningún formato histórico que representar. Es el mismo
   * criterio con el que se eliminó ese estado de Filter por inalcanzable.
   */
  public static parseOwnership(comment: string | undefined | null): {
    status: 'valid' | 'malformed' | 'foreign' | 'unmanaged';
    ruleReference?: string;
    userComment?: string;
  } {
    if (!comment || comment.trim() === '') {
      return { status: 'unmanaged' };
    }
    const trimmed = comment.trim();
    if (!trimmed.startsWith('cuzonet:')) {
      return { status: 'unmanaged' };
    }
    if (!trimmed.startsWith(MARKER_PREFIX)) {
      return { status: 'foreign' };
    }
    const match = MARKER_PATTERN.exec(trimmed);
    if (!match || !match[1]) {
      return { status: 'malformed' };
    }
    const ruleReference = match[1];
    const userComment = trimmed.substring(match[0].length).trim();
    return {
      status: 'valid',
      ruleReference,
      ...(userComment ? { userComment } : {}),
    };
  }
}
