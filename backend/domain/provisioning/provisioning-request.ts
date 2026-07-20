import { ProvisioningTransitionError, SensitiveDataInProvisioningError } from './errors/provisioning-engine.error.js';
import type { ProvisioningRequestDto } from '../../application/dto/provisioning/provisioning-request.dto.js';

export type ProvisioningStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ProvisioningRequestProps {
  actionType: string;
  attemptCount: number;
  companyId: string;
  completedAt: Date | undefined;
  configurationReference: string | undefined;
  createdAt: Date;
  id: string;
  idempotencyKey: string;
  inputHash: string;
  inputSnapshotJson: string;
  lastErrorCode: string | undefined;
  lastErrorMessage: string | undefined;
  maxAttempts: number;
  nextAttemptAt: Date | undefined;
  processingStartedAt: Date | undefined;
  processingWorkerId: string | undefined;
  sourceExecutionId: string | undefined;
  status: ProvisioningStatus;
  targetId: string;
  targetType: string;
  updatedAt: Date;
}

const SENSITIVE_KEYS = ['password', 'apikey', 'api_key', 'token', 'authorization', 'secret', 'privatekey', 'private_key', 'bearer'];

import { createHash } from 'node:crypto';

export class ProvisioningRequest {
  private constructor(private readonly props: ProvisioningRequestProps) {
    this.validateNoSecrets(this.props.inputSnapshotJson);
  }

  public static rehydrate(props: ProvisioningRequestProps): ProvisioningRequest {
    return new ProvisioningRequest(props);
  }


  public static generateInputHash(actionType: string, targetType: string, targetId: string, configurationReference: string | undefined, payloadSnapshot: string): string {
    const payloadObj = JSON.parse(payloadSnapshot);
    const canonicalPayload = ProvisioningRequest.canonicalize(payloadObj);
    const blueprint = {
      actionType,
      targetType,
      targetId,
      configurationReference,
      payload: canonicalPayload
    };
    const canonicalBlueprint = ProvisioningRequest.canonicalize(blueprint);
    return createHash('sha256').update(canonicalBlueprint).digest('hex');
  }

  private static canonicalize(obj: unknown): string {
    if (obj === null || obj === undefined) {
      return 'null';
    }
    if (Array.isArray(obj)) {
      const items = obj.map(item => ProvisioningRequest.canonicalize(item));
      return `[${items.join(',')}]`;
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj).sort();
      const items = keys.map(key => `"${key}":${ProvisioningRequest.canonicalize((obj as Record<string, unknown>)[key])}`);
      return `{${items.join(',')}}`;
    }
    if (typeof obj === 'string') {
      return JSON.stringify(obj);
    }
    return String(obj);
  }

  public static create(
    props: Omit<
      ProvisioningRequestProps,
      | 'attemptCount'
      | 'completedAt'
      | 'createdAt'
      | 'lastErrorCode'
      | 'lastErrorMessage'
      | 'nextAttemptAt'
      | 'processingStartedAt'
      | 'processingWorkerId'
      | 'status'
      | 'updatedAt'
    >,
  ): ProvisioningRequest {
    return new ProvisioningRequest({
      ...props,
      attemptCount: 0,
      completedAt: undefined,
      createdAt: new Date(),
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      nextAttemptAt: undefined,
      processingStartedAt: undefined,
      processingWorkerId: undefined,
      status: 'pending',
      updatedAt: new Date(),
    });
  }

  public get id(): string { return this.props.id; }
  public get companyId(): string { return this.props.companyId; }
  public get sourceExecutionId(): string | undefined { return this.props.sourceExecutionId; }
  public get inputHash(): string {
    return this.props.inputHash;
  }

  public get idempotencyKey(): string { return this.props.idempotencyKey; }
  public get actionType(): string { return this.props.actionType; }
  public get targetType(): string { return this.props.targetType; }
  public get targetId(): string { return this.props.targetId; }
  public get configurationReference(): string | undefined { return this.props.configurationReference; }
  public get inputSnapshotJson(): string { return this.props.inputSnapshotJson; }
  public get status(): ProvisioningStatus { return this.props.status; }
  public get attemptCount(): number { return this.props.attemptCount; }
  public get maxAttempts(): number { return this.props.maxAttempts; }
  public get nextAttemptAt(): Date | undefined { return this.props.nextAttemptAt; }
  public get processingWorkerId(): string | undefined { return this.props.processingWorkerId; }
  public get processingStartedAt(): Date | undefined { return this.props.processingStartedAt; }
  public get completedAt(): Date | undefined { return this.props.completedAt; }
  public get lastErrorCode(): string | undefined { return this.props.lastErrorCode; }
  public get lastErrorMessage(): string | undefined { return this.props.lastErrorMessage; }
  public get createdAt(): Date { return this.props.createdAt; }
  public get updatedAt(): Date { return this.props.updatedAt; }

  public claim(workerId: string, at: Date): void {
    if (this.props.status === 'completed' || this.props.status === 'cancelled') {
      throw new ProvisioningTransitionError(this.props.status, 'processing');
    }
    if (this.props.status === 'failed' && !this.props.nextAttemptAt) {
      throw new ProvisioningTransitionError(this.props.status, 'processing');
    }
    if (this.props.attemptCount >= this.props.maxAttempts) {
      throw new ProvisioningTransitionError(this.props.status, 'processing');
    }

    this.props.status = 'processing';
    this.props.processingWorkerId = workerId;
    this.props.processingStartedAt = at;
    this.props.updatedAt = at;
  }

  public complete(at: Date): void {
    if (this.props.status !== 'processing') {
      throw new ProvisioningTransitionError(this.props.status, 'completed');
    }
    this.props.status = 'completed';
    this.props.completedAt = at;
    this.props.processingWorkerId = undefined;
    this.props.processingStartedAt = undefined;
    this.props.updatedAt = at;
  }

  public failTemporarily(errorCode: string, errorMessage: string, nextAttemptAt: Date, at: Date): void {
    if (this.props.status !== 'processing') {
      throw new ProvisioningTransitionError(this.props.status, 'failed');
    }
    this.props.attemptCount += 1;
    this.props.status = 'failed';
    this.props.lastErrorCode = errorCode;
    this.props.lastErrorMessage = errorMessage;
    this.props.nextAttemptAt = nextAttemptAt;
    this.props.processingWorkerId = undefined;
    this.props.processingStartedAt = undefined;
    this.props.updatedAt = at;
  }

  public failPermanently(errorCode: string, errorMessage: string, at: Date): void {
    if (this.props.status !== 'processing') {
      throw new ProvisioningTransitionError(this.props.status, 'failed');
    }
    this.props.attemptCount += 1;
    this.props.status = 'failed';
    this.props.lastErrorCode = errorCode;
    this.props.lastErrorMessage = errorMessage;
    this.props.nextAttemptAt = undefined;
    this.props.processingWorkerId = undefined;
    this.props.processingStartedAt = undefined;
    this.props.updatedAt = at;
  }

  public cancel(at: Date): void {
    if (this.props.status === 'completed') {
      throw new ProvisioningTransitionError(this.props.status, 'cancelled');
    }
    if (this.props.status === 'processing') {
      throw new ProvisioningTransitionError(this.props.status, 'cancelled');
    }
    this.props.status = 'cancelled';
    this.props.nextAttemptAt = undefined;
    this.props.updatedAt = at;
  }

  public toDto(): ProvisioningRequestDto {
    const dto: Partial<ProvisioningRequestDto> = {
      actionType: this.props.actionType,
      attemptCount: this.props.attemptCount,
      companyId: this.props.companyId,
      createdAt: this.props.createdAt.toISOString(),
      id: this.id,
      idempotencyKey: this.props.idempotencyKey,
      inputHash: this.props.inputHash,
      inputSnapshotJson: this.props.inputSnapshotJson,
      maxAttempts: this.props.maxAttempts,
      status: this.props.status,
      targetId: this.props.targetId,
      targetType: this.props.targetType,
      updatedAt: this.props.updatedAt.toISOString(),
    };

    if (this.props.completedAt) dto.completedAt = this.props.completedAt.toISOString();
    if (this.props.configurationReference !== undefined) dto.configurationReference = this.props.configurationReference;
    if (this.props.lastErrorCode !== undefined) dto.lastErrorCode = this.props.lastErrorCode;
    if (this.props.lastErrorMessage !== undefined) dto.lastErrorMessage = this.props.lastErrorMessage;
    if (this.props.nextAttemptAt) dto.nextAttemptAt = this.props.nextAttemptAt.toISOString();
    if (this.props.processingStartedAt) dto.processingStartedAt = this.props.processingStartedAt.toISOString();
    if (this.props.processingWorkerId !== undefined) dto.processingWorkerId = this.props.processingWorkerId;
    if (this.props.sourceExecutionId !== undefined) dto.sourceExecutionId = this.props.sourceExecutionId;

    return dto as ProvisioningRequestDto;
  }

  private validateNoSecrets(jsonString: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString) as unknown;
    } catch {
      return; // Ignorar si no es JSON válido
    }
    if (parsed !== null && typeof parsed === 'object') {
      this.checkKeysRecursively(parsed as Record<string, unknown>);
    }
  }

  private checkKeysRecursively(obj: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (SENSITIVE_KEYS.some((sensitive) => lowerKey.includes(sensitive))) {
        throw new SensitiveDataInProvisioningError(key);
      }
      if (value !== null && typeof value === 'object') {
        this.checkKeysRecursively(value as Record<string, unknown>);
      }
    }
  }
}
