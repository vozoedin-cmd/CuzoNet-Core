import { describe, expect, it } from 'vitest';
import { WebhookAutomationActionAdapter } from '../../../../backend/infrastructure/automation/adapters/webhook.adapter.js';

describe('WebhookAutomationActionAdapter SSRF Protection', () => {
  it('blocks localhost', async () => {
    process.env['WEBHOOK_URL_LOCAL'] = 'http://localhost:8080/webhook';
    const adapter = new WebhookAutomationActionAdapter(true);
    
    const result = await adapter.execute('LOCAL', {
      companyId: 'test',
      contextId: 'test',
      eventId: '{}',
      executionId: 'test',
      ruleId: 'test',
      ruleVersion: 1,
    });
    
    expect(result.outcome).toBe('permanent_failure');
    expect(result).toHaveProperty('errorCode', 'SSRF_PROTECTION');
  });

  it('blocks 127.0.0.1', async () => {
    process.env['WEBHOOK_URL_IP'] = 'http://127.0.0.1:8080/webhook';
    const adapter = new WebhookAutomationActionAdapter(true);
    
    const result = await adapter.execute('IP', {
      companyId: 'test',
      contextId: 'test',
      eventId: '{}',
      executionId: 'test',
      ruleId: 'test',
      ruleVersion: 1,
    });
    
    expect(result.outcome).toBe('permanent_failure');
    expect(result).toHaveProperty('errorCode', 'SSRF_PROTECTION');
  });

  it('blocks 169.254.169.254 (metadata service)', async () => {
    process.env['WEBHOOK_URL_AWS'] = 'http://169.254.169.254/latest/meta-data/';
    const adapter = new WebhookAutomationActionAdapter(true);
    
    const result = await adapter.execute('AWS', {
      companyId: 'test',
      contextId: 'test',
      eventId: '{}',
      executionId: 'test',
      ruleId: 'test',
      ruleVersion: 1,
    });
    
    expect(result.outcome).toBe('permanent_failure');
    expect(result).toHaveProperty('errorCode', 'SSRF_PROTECTION');
  });

  it('blocks HTTP when not allowed', async () => {
    process.env['WEBHOOK_URL_HTTP'] = 'http://example.com/webhook';
    const adapter = new WebhookAutomationActionAdapter(false); // HTTP not allowed
    
    const result = await adapter.execute('HTTP', {
      companyId: 'test',
      contextId: 'test',
      eventId: '{}',
      executionId: 'test',
      ruleId: 'test',
      ruleVersion: 1,
    });
    
    expect(result.outcome).toBe('permanent_failure');
    expect(result).toHaveProperty('errorCode', 'INSECURE_URL');
  });
});
