import { InvalidDesiredResourceStateError } from './errors/invalid-desired-resource-state.error.js';
import { SYNC_RESOURCE_TYPES, type SyncResourceType } from './sync-resource-type.js';

export interface DesiredResourceStateProps {
  companyId: string;
  createdAt: Date;
  deletedAt: Date | undefined;
  desiredFields: Record<string, string>;
  desiredPosition: number | undefined;
  disabled: boolean;
  id: string;
  reference: string;
  resourceType: SyncResourceType;
  revision: number;
  routerId: string;
  updatedAt: Date;
}

export interface DesiredResourceStateInit {
  companyId: string;
  desiredFields: Record<string, string>;
  desiredPosition?: number;
  disabled: boolean;
  id: string;
  reference: string;
  resourceType: SyncResourceType;
  routerId: string;
}

function fieldsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => a[key] === b[key]);
}

function assertValid(reference: string, resourceType: string, position: number | undefined): void {
  if (reference.trim().length === 0) {
    throw new InvalidDesiredResourceStateError('reference', 'La referencia del recurso no puede estar vacía.');
  }
  if (!(SYNC_RESOURCE_TYPES as readonly string[]).includes(resourceType)) {
    throw new InvalidDesiredResourceStateError(
      'resourceType',
      `Debe ser uno de: ${SYNC_RESOURCE_TYPES.join(', ')}.`,
    );
  }
  if (position !== undefined && (!Number.isInteger(position) || position < 0)) {
    throw new InvalidDesiredResourceStateError('desiredPosition', 'La posición debe ser un entero mayor o igual a cero.');
  }
}

/**
 * The declarative, persisted desired configuration for one managed RouterOS
 * resource — the definitive source of truth the Synchronization Engine
 * compares against the router's real state. Each `replace()` is a full
 * declarative overwrite (not a patch), matching IaC semantics: the caller
 * always declares the complete desired shape, never an incremental diff.
 * `revision` increments only on an actual change, so it stays meaningful as
 * a staleness signal for future reconciliation-execution work.
 */
export class DesiredResourceState {
  private constructor(private props: DesiredResourceStateProps) {}

  public static create(init: DesiredResourceStateInit, at: Date): DesiredResourceState {
    assertValid(init.reference, init.resourceType, init.desiredPosition);
    return new DesiredResourceState({
      companyId: init.companyId,
      createdAt: at,
      deletedAt: undefined,
      desiredFields: { ...init.desiredFields },
      desiredPosition: init.desiredPosition,
      disabled: init.disabled,
      id: init.id,
      reference: init.reference,
      resourceType: init.resourceType,
      revision: 1,
      routerId: init.routerId,
      updatedAt: at,
    });
  }

  public static rehydrate(props: DesiredResourceStateProps): DesiredResourceState {
    return new DesiredResourceState(props);
  }

  public get id(): string {
    return this.props.id;
  }

  public get companyId(): string {
    return this.props.companyId;
  }

  public get routerId(): string {
    return this.props.routerId;
  }

  public get resourceType(): SyncResourceType {
    return this.props.resourceType;
  }

  public get reference(): string {
    return this.props.reference;
  }

  public get desiredFields(): Readonly<Record<string, string>> {
    return this.props.desiredFields;
  }

  public get desiredPosition(): number | undefined {
    return this.props.desiredPosition;
  }

  public get disabled(): boolean {
    return this.props.disabled;
  }

  public get revision(): number {
    return this.props.revision;
  }

  public get createdAt(): Date {
    return this.props.createdAt;
  }

  public get updatedAt(): Date {
    return this.props.updatedAt;
  }

  public get deletedAt(): Date | undefined {
    return this.props.deletedAt;
  }

  public get isDeleted(): boolean {
    return this.props.deletedAt !== undefined;
  }

  public toProps(): DesiredResourceStateProps {
    return { ...this.props };
  }

  /**
   * Declares the complete desired configuration, replacing whatever was
   * there before (including resurrecting a soft-deleted resource). A no-op
   * (revision unchanged) if the declared shape is identical to the current
   * one, so re-declaring the same desired state repeatedly is safe and
   * inexpensive.
   */
  public replace(fields: Record<string, string>, disabled: boolean, position: number | undefined, at: Date): boolean {
    assertValid(this.props.reference, this.props.resourceType, position);
    const resurrecting = this.props.deletedAt !== undefined;
    const changed =
      resurrecting ||
      disabled !== this.props.disabled ||
      position !== this.props.desiredPosition ||
      !fieldsEqual(fields, this.props.desiredFields);
    if (!changed) return false;

    this.props.desiredFields = { ...fields };
    this.props.disabled = disabled;
    this.props.desiredPosition = position;
    this.props.deletedAt = undefined;
    this.props.revision += 1;
    this.props.updatedAt = at;
    return true;
  }

  /** Idempotent: marking an already-deleted resource as deleted again is a no-op. */
  public markDeleted(at: Date): boolean {
    if (this.props.deletedAt !== undefined) return false;
    this.props.deletedAt = at;
    this.props.revision += 1;
    this.props.updatedAt = at;
    return true;
  }
}
