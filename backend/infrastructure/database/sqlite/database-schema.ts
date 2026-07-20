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
  id: string;
  company_id: string;
  rule_id: string;
  event_id: string;
  event_type: string;
  action_type: string;
  action_snapshot_json: string;
  event_snapshot_json: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  processing_started_at: string | null;
  processing_worker_id: string | null;
  processing_lease_until: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  provider_execution_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationAttemptTable {
  id: string;
  execution_id: string;
  attempt_number: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  response_code: number | null;
  error_code: string | null;
  error_message: string | null;
  provider_execution_id: string | null;
  metadata_json: string;
  created_at: string;
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
  role:
    | 'automation'
    | 'automation_dispatch'
    | 'monitoring'
    | 'notification_dispatch'
    | 'notification_outbox'
    | 'outbox'
    | 'provisioning'
    | 'provisioning_dispatch';
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
  role:
    | 'automation'
    | 'automation_dispatch'
    | 'monitoring'
    | 'notification_dispatch'
    | 'notification_outbox'
    | 'outbox'
    | 'provisioning'
    | 'provisioning_dispatch';
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

export interface AlertRuleTable {
  code: string;
  company_id: string;
  condition_type: 'equipment_status' | 'metric_threshold';
  created_at: string;
  duration_seconds: number;
  enabled: number;
  expected_status: Nullable<'DOWN'>;
  id: string;
  metric_type: Nullable<string>;
  name: string;
  operator: 'equals' | 'greater_than';
  recovery_duration_seconds: number;
  severity: 'info' | 'warning' | 'minor' | 'major' | 'critical';
  threshold: Nullable<number>;
  updated_at: string;
}

export interface IncidentTable {
  acknowledged_at: Nullable<string>;
  acknowledged_by: Nullable<string>;
  company_id: string;
  correlation_key: string;
  created_at: string;
  duration_seconds: Nullable<number>;
  equipment_id: string;
  id: string;
  last_evaluated_at: string;
  last_triggered_at: string;
  opened_at: string;
  resolved_at: Nullable<string>;
  rule_id: string;
  severity: 'info' | 'warning' | 'minor' | 'major' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved';
  title: string;
  updated_at: string;
}

export interface IncidentEventTable {
  company_id: string;
  created_at: string;
  id: string;
  incident_id: string;
  occurred_at: string;
  payload_json: string;
  type: 'opened' | 'condition_reconfirmed' | 'acknowledged' | 'resolved' | 'reopened';
}

export interface AlertEvaluationStateTable {
  company_id: string;
  condition_started_at: Nullable<string>;
  equipment_id: string;
  last_condition_matched: number;
  last_observed_at: Nullable<string>;
  recovery_started_at: Nullable<string>;
  rule_id: string;
  updated_at: string;
}

export interface NotificationDestinationTable {
  address: Nullable<string>;
  channel: 'webhook' | 'whatsapp' | 'telegram' | 'email';
  company_id: string;
  configuration_reference: string;
  created_at: string;
  enabled: number;
  event_types_json: string;
  id: string;
  minimum_severity: Nullable<'info' | 'warning' | 'minor' | 'major' | 'critical'>;
  name: string;
  updated_at: string;
}

export interface NotificationTable {
  attempts: number;
  channel: 'webhook' | 'whatsapp' | 'telegram' | 'email';
  company_id: string;
  created_at: string;
  destination_id: string;
  failed_at: Nullable<string>;
  id: string;
  idempotency_key: string;
  incident_id: string;
  last_error: Nullable<string>;
  last_failure_retryable: Nullable<number>;
  max_attempts: number;
  payload_json: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  processing_lease_until: Nullable<string>;
  processing_started_at: Nullable<string>;
  processing_worker_id: Nullable<string>;
  scheduled_at: string;
  sent_at: Nullable<string>;
  source_event_id: string;
  source_event_type: 'incident_opened' | 'incident_acknowledged' | 'incident_resolved';
  status: 'pending' | 'processing' | 'sent' | 'retrying' | 'failed' | 'cancelled' | 'skipped';
  template_code: string;
  updated_at: string;
}

export interface NotificationAttemptTable {
  attempt_number: number;
  completed_at: Nullable<string>;
  created_at: string;
  error_code: Nullable<string>;
  error_message: Nullable<string>;
  id: string;
  metadata_json: Nullable<string>;
  notification_id: string;
  response_code: Nullable<number>;
  retry_at: Nullable<string>;
  started_at: string;
  status: 'processing' | 'sent' | 'retrying' | 'failed';
}

export interface NotificationEventReceiptTable {
  company_id: string;
  created_notifications: number;
  event_id: string;
  event_type: string;
  last_error: Nullable<string>;
  processed_at: string;
  status: 'processed' | 'failed';
}
export interface ProvisioningRequestTable {
  id: string;
  company_id: string;
  source_execution_id: Nullable<string>;
  idempotency_key: string;
  action_type: string;
  target_type: string;
  target_id: string;
  configuration_reference: Nullable<string>;
  input_hash: string;
  input_snapshot_json: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: Nullable<string>;
  processing_worker_id: Nullable<string>;
  processing_started_at: Nullable<string>;
  completed_at: Nullable<string>;
  last_error_code: Nullable<string>;
  last_error_message: Nullable<string>;
  created_at: string;
  updated_at: string;
}
export interface ProvisioningAttemptTable {
  id: string;
  request_id: string;
  attempt_number: number;
  worker_id: string;
  started_at: string;
  finished_at: Nullable<string>;
  outcome: string;
  error_code: Nullable<string>;
  error_message: Nullable<string>;
  duration_ms: Nullable<number>;
  metadata_json: Nullable<string>;
}
export interface DatabaseSchema {
  alert_evaluation_states: AlertEvaluationStateTable;
  alert_rules: AlertRuleTable;
  automation_attempts: AutomationAttemptTable;
  automation_executions: AutomationExecutionTable;
  legacy_automation_executions: Record<string, unknown>;
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
  incident_events: IncidentEventTable;
  incidents: IncidentTable;
  invoice_items: InvoiceItemTable;
  invoices: InvoiceTable;
  outbox_events: OutboxEventTable;
  payment_allocations: PaymentAllocationTable;
  payments: PaymentTable;
  plan_versions: PlanVersionTable;
  plans: PlanTable;
  mikrotik_resources: MikrotikResourceTable;
  network_assets: NetworkAssetTable;
  notification_attempts: NotificationAttemptTable;
  notification_destinations: NotificationDestinationTable;
  notification_event_receipts: NotificationEventReceiptTable;
  notifications: NotificationTable;
  provisioning_operations: ProvisioningOperationTable;
  provisioning_requests: ProvisioningRequestTable;
  provisioning_attempts: ProvisioningAttemptTable;
  schema_migrations: SchemaMigrationTable;
  work_leases: WorkLeaseTable;
  worker_statistics: WorkerStatisticsTable;
}
