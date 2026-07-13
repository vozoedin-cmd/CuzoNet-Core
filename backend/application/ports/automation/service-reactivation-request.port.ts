export interface ServiceReactivationRequest {
  actionRequestKey: string;
  causationId: string;
  companyId: string;
  correlationId: string;
  reasonCode: string;
  serviceId: string;
}
export interface ServiceReactivationResult {
  requestId?: string;
  status: 'accepted' | 'rejected' | 'unavailable';
}
export interface ServiceReactivationRequestPort {
  requestReactivation(request: ServiceReactivationRequest): Promise<ServiceReactivationResult>;
}
