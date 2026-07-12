export interface BillingClientSnapshot {
  clientId: string;
  companyId: string;
  status: 'active' | 'archived';
}
export interface ClientBillingReader {
  findById(companyId: string, clientId: string): Promise<BillingClientSnapshot | null>;
}
