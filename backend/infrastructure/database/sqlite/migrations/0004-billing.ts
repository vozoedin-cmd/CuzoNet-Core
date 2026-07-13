import type { Migration } from '../migration/migration.js';

export const billingMigration: Migration = {
  name: 'billing',
  version: 4,
  sql: `
    CREATE TABLE billing_accounts (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
      status TEXT NOT NULL CHECK (status IN ('active', 'closed')),
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      UNIQUE (company_id, id),
      FOREIGN KEY (company_id, client_id) REFERENCES clients(company_id, id),
      FOREIGN KEY (company_id, service_id) REFERENCES client_services(company_id, id)
    );
    CREATE UNIQUE INDEX billing_accounts_active_service_unique
      ON billing_accounts(company_id, service_id, currency_code)
      WHERE status = 'active';
    CREATE INDEX billing_accounts_client_idx ON billing_accounts(company_id, client_id);

    CREATE TABLE invoices (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      billing_account_id TEXT NOT NULL,
      number TEXT NOT NULL,
      currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
      issued_on TEXT NOT NULL,
      due_on TEXT NOT NULL,
      document_status TEXT NOT NULL CHECK (document_status IN ('issued', 'cancelled')),
      total_cents INTEGER NOT NULL CHECK (total_cents > 0),
      cancellation_reason TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (company_id, id),
      UNIQUE (company_id, number),
      FOREIGN KEY (billing_account_id) REFERENCES billing_accounts(id),
      FOREIGN KEY (company_id, client_id) REFERENCES clients(company_id, id)
    );
    CREATE INDEX invoices_account_status_due_idx
      ON invoices(billing_account_id, document_status, due_on);
    CREATE INDEX invoices_company_client_issued_idx
      ON invoices(company_id, client_id, issued_on DESC);

    CREATE TABLE invoice_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      item_type TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      period_start TEXT,
      period_end TEXT,
      position INTEGER NOT NULL CHECK (position >= 0),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
      UNIQUE (invoice_id, position)
    );

    CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      currency_code TEXT NOT NULL CHECK (length(currency_code) = 3),
      method TEXT NOT NULL,
      external_reference TEXT,
      idempotency_key TEXT NOT NULL,
      received_at TEXT NOT NULL,
      received_by TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('recorded', 'reversed')),
      reversal_reason TEXT,
      reversed_at TEXT,
      reversed_by TEXT,
      UNIQUE (company_id, id),
      UNIQUE (company_id, idempotency_key),
      FOREIGN KEY (company_id, client_id) REFERENCES clients(company_id, id)
    );
    CREATE UNIQUE INDEX payments_external_reference_unique
      ON payments(company_id, method, external_reference)
      WHERE external_reference IS NOT NULL;
    CREATE INDEX payments_company_received_idx ON payments(company_id, received_at DESC, id);

    CREATE TABLE payment_allocations (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      invoice_id TEXT NOT NULL,
      billing_account_id TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
      allocated_at TEXT NOT NULL,
      FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id),
      FOREIGN KEY (billing_account_id) REFERENCES billing_accounts(id),
      UNIQUE (payment_id, invoice_id)
    );
    CREATE INDEX payment_allocations_payment_idx ON payment_allocations(payment_id);
    CREATE INDEX payment_allocations_invoice_idx ON payment_allocations(invoice_id);
  `,
};
