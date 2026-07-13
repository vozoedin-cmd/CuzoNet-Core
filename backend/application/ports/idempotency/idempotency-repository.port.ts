export interface IdempotencyRecord {
  apiClientId: string;
  completedAt?: string;
  createdAt: string;
  expiresAt: string;
  id: string;
  key: string;
  requestHash: string;
  requestMethod: string;
  requestPath: string;
  responseBody?: string;
  responseStatus?: number;
  status: 'processing' | 'completed' | 'failed';
}

export interface IdempotencyRepository {
  find(
    apiClientId: string,
    requestMethod: string,
    requestPath: string,
    key: string,
  ): Promise<IdempotencyRecord | null>;
  save(record: IdempotencyRecord): Promise<void>;
}
