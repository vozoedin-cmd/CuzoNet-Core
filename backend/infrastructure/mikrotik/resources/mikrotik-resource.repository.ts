export type MikrotikResourceStatus = 'applied' | 'pending';

export interface MikrotikResource {
  companyId: string;
  createdAt: Date;
  desiredHash: string | undefined;
  lastReconciledAt: Date | undefined;
  remoteId: string | undefined;
  remoteName: string | undefined;
  resourceId: string;
  resourceType: 'simple_queue';
  routerId: string;
  serviceId: string;
  status: MikrotikResourceStatus;
  updatedAt: Date;
}

export interface ReserveMikrotikResourceInput {
  companyId: string;
  createdAt: Date;
  routerId: string;
  serviceId: string;
}

export interface MikrotikResourceRepository {
  markApplied(
    resourceId: string,
    input: {
      desiredHash: string;
      reconciledAt: Date;
      remoteId: string;
      remoteName: string;
    },
  ): Promise<void>;
  markPending(
    resourceId: string,
    input: { desiredHash: string; remoteName: string; updatedAt: Date },
  ): Promise<void>;
  reserve(input: ReserveMikrotikResourceInput): Promise<MikrotikResource>;
}
