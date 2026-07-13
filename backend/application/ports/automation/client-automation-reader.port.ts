export interface ClientAutomationFacts {
  clientId: string;
  status: 'active' | 'archived';
}
export interface ClientAutomationReader {
  findFacts(companyId: string, clientId: string): Promise<ClientAutomationFacts | null>;
}
