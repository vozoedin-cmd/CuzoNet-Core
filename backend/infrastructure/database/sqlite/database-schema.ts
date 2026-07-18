type Nullable<T> = T | null;

export interface SchemaMigrationTable {
  applied_at: string;
  checksum: string;
  name: string;
  version: number;
}

export interface DatabaseMetadataTable {
  database_version: number;
  id: number;
  schema_version: number;
  updated_at: string;
}

export interface CompanyTable {
  created_at: string;
  currency_code: string;
  display_name: string;
  id: string;
  legal_name: string;
  status: 'active' | 'inactive';
  timezone: string;
}

export interface DocumentSequenceTable {
  company_id: string;
  document_type: string;
  next_value: number;
  updated_at: string;
}

export interface ClientTable {
  archived_at: Nullable<string>;
  client_type: string;
  company_id: string;
  created_at: string;
  document_key: string;
  document_number: string;
  document_type: string;
  id: string;
  legal_name: string;
  status: 'active' | 'archived';
  updated_at: Nullable<string>;
}

export interface ClientContactTable {
  client_id: string;
  contact_type: string;
  id: string;
  is_primary: number;
  position: number;
  value_display: string;
  value_normalized: string;
  verified_at: Nullable<string>;
}

export interface ClientAddressTable {
  address_line: string;
  client_id: string;
  id: string;
  is_service_address: number;
  label: Nullable<string>;
  latitude: Nullable<number>;
  longitude: Nullable<number>;
  position: number;
}

export interface ClientNoteTable {
  body: string;
  client_id: string;
  created_at: string;
  id: string;
  position: number;
}

export interface ClientServiceTable {
  billing_day: number;
  client_id: string;
  company_id: string;
  created_at: string;
  ended_on: Nullable<string>;
  id: string;
  lifecycle_status: string;
  plan_version_id: string;
  service_type: string;
  started_on: Nullable<string>;
}

export interface PlanTable {
  code: string;
  company_id: string;
  created_at: string;
  id: string;
  is_active: number;
  name: string;
  service_type: 'simple_queue' | 'pppoe' | 'hotspot';
  updated_at: Nullable<string>;
}

export interface PlanVersionTable {
  burst_download_kbps: Nullable<number>;
  burst_upload_kbps: Nullable<number>;
  created_at: string;
  download_kbps: number;
  effective_from: string;
  id: string;
  plan_id: string;
  price_cents: number;
  priority: Nullable<number>;
  upload_kbps: number;
  version_number: number;
}
export interface BillingAccountTable {
  client_id: string;
  closed_at: Nullable<string>;
  company_id: string;
  currency_code: string;
  id: string;
  opened_at: string;
  service_id: string;
  status: string;
}

export interface InvoiceTable {
  billing_account_id: string;
  cancelled_at: Nullable<string>;
  cancellation_reason: Nullable<string>;
  client_id: string;
  company_id: string;
  created_at: string;
  currency_code: string;
  document_status: string;
  due_on: string;
  id: string;
  issued_on: string;
  number: string;
  total_cents: number;
}

export interface InvoiceItemTable {
  amount_cents: number;
  description: string;
  id: string;
  invoice_id: string;
  item_type: string;
  period_end: Nullable<string>;
  period_start: Nullable<string>;
  position: number;
}

export interface PaymentTable {
  amount_cents: number;
  client_id: string;
  company_id: string;
  currency_code: string;
  external_reference: Nullable<string>;
  id: string;
  idempotency_key: string;
  method: string;
  received_at: string;
  received_by: string;
  recorded_at: string;
  reversal_reason: Nullable<string>;
  reversed_at: Nullable<string>;
  reversed_by: Nullable<string>;
  status: string;
}

export interface PaymentAllocationTable {
  allocated_at: string;
  amount_cents: number;
  billing_account_id: string;
  id: string;
  invoice_id: string;
  payment_id: string;
}

export interface ProvisioningOperationTable {
  attempt_count: number;
  causation_id: string;
  company_id: string;
  completed_at: Nullable<string>;
  correlation_id: string;
  created_at: string;
  id: string;
  idempotency_key: string;
  ip_address_id: Nullable<string>;
  last_error_code: Nullable<string>;
  last_error_message: Nullable<string>;
  max_attempts: number;
  next_attempt_at: Nullable<string>;
  operation_type: string;
  requested_by: string;
  router_id: string;
  service_address_id: Nullable<string>;
  service_id: string;
  started_at: Nullable<string>;
  status: string;
}

export interface OutboxEventTable {
  aggregate_id: string;
  aggregate_type: string;
  causation_id: string;
  company_id: string;
  correlation_id: string;
  event_type: string;
  id: string;
  occurred_at: string;
  payload: string;
  published_at: Nullable<string>;
  schema_version: number;
}

export interface EventDeliveryTable {
  attempt_count: number;
  consumer_name: string;
  event_id: string;
  id: string;
  last_error: Nullable<string>;
  next_attempt_at: Nullable<string>;
  processed_at: Nullable<string>;
  status: string;
}

export interface IdempotencyKeyTable {
  api_client_id: string;
  completed_at: Nullable<string>;
  created_at: string;
  expires_at: string;
  id: string;
  key: string;
  request_hash: string;
  request_method: string;
  request_path: string;
  response_body: Nullable<string>;
  response_status: Nullable<number>;
  status: string;
}

export interface AutomationRuleTable {
  actions_definition: string;
  company_id: string;
  condition_definition: string;
  created_at: string;
  created_by: string;
  id: string;
  name: string;
  priority: number;
  schema_version: number;
  status: string;
  trigger_event_type: string;
  updated_at: Nullable<string>;
  updated_by: Nullable<string>;
  version: number;
}

export interface AutomationRuleVersionTable {
  actions_definition: string;
  condition_definition: string;
  created_at: string;
  created_by: string;
  name: string;
  priority: number;
  rule_id: string;
  schema_version: number;
  trigger_event_type: string;
  version: number;
}

export interface AutomationExecutionTable {
  action_results: string;
  company_id: string;
  completed_at: Nullable<string>;
  context_id: string;
  error_code: Nullable<string>;
  error_message: Nullable<string>;
  event_id: string;
  id: string;
  matched: number;
  rule_id: string;
  rule_version: number;
  started_at: string;
  status: string;
}

export interface MikrotikResourceTable {
  company_id: string;
  created_at: string;
  desired_hash: Nullable<string>;
  id: string;
  last_reconciled_at: Nullable<string>;
  observed_hash: Nullable<string>;
  remote_id: Nullable<string>;
  remote_name: Nullable<string>;
  resource_type: 'simple_queue';
  router_id: string;
  service_id: string;
  status: 'applied' | 'pending';
  updated_at: string;
}

export interface WorkLeaseTable {
  acquired_at: string;
  expires_at: string;
  fencing_token: number;
  owner_id: string;
  renewed_at: string;
  role: 'automation' | 'monitoring' | 'outbox' | 'provisioning';
  work_id: string;
}

export interface WorkerStatisticsTable {
  failed_count: number;
  heartbeat_at: string;
  last_error: Nullable<string>;
  last_error_at: Nullable<string>;
  last_success_at: Nullable<string>;
  lease_lost_count: number;
  processed_count: number;
  retry_count: number;
  role: 'automation' | 'monitoring' | 'outbox' | 'provisioning';
  skipped_count: number;
  started_at: string;
  stopped_at: Nullable<string>;
  worker_id: string;
}

export interface NetworkAssetTable {
  acquired_on: string;
  asset_model_id: Nullable<string>;
  asset_type: string;
  capabilities: string;
  company_id: string;
  id: string;
  mac_address: Nullable<string>;
  management_host: Nullable<string>;
  role: string;
  serial_number: Nullable<string>;
  status: 'active' | 'inactive' | 'retired';
}

export interface DatabaseSchema {
  automation_executions: AutomationExecutionTable;
  automation_rule_versions: AutomationRuleVersionTable;
  automation_rules: AutomationRuleTable;
  billing_accounts: BillingAccountTable;
  client_addresses: ClientAddressTable;
  client_contacts: ClientContactTable;
  client_notes: ClientNoteTable;
  client_services: ClientServiceTable;
  clients: ClientTable;
  companies: CompanyTable;
  database_metadata: DatabaseMetadataTable;
  document_sequences: DocumentSequenceTable;
  event_deliveries: EventDeliveryTable;
  idempotency_keys: IdempotencyKeyTable;
  invoice_items: InvoiceItemTable;
  invoices: InvoiceTable;
  outbox_events: OutboxEventTable;
  payment_allocations: PaymentAllocationTable;
  payments: PaymentTable;
  plan_versions: PlanVersionTable;
  plans: PlanTable;
  mikrotik_resources: MikrotikResourceTable;
  network_assets: NetworkAssetTable;
  provisioning_operations: ProvisioningOperationTable;
  schema_migrations: SchemaMigrationTable;
  work_leases: WorkLeaseTable;
  worker_statistics: WorkerStatisticsTable;
}
