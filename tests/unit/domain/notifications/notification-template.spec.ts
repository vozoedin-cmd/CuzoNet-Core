
import { describe, it, expect } from 'vitest';
import { NotificationTemplate } from '../../../../backend/domain/notifications/notification-template.js';

describe('NotificationTemplate', () => {
  it('should create template and add versions', () => {
    const t = NotificationTemplate.create({
      id: 't1',
      companyId: 'c1',
      code: 'WELCOME',
      name: 'Welcome Email',
      defaultChannel: 'email'
    });

    expect(t.props.code).toBe('WELCOME');
    
    t.addDraftVersion('v1', 'Hello {{name}}');
    expect(t.props.versions).toHaveLength(1);
    expect(t.props.versions[0]?.version).toBe(1);
    expect(t.props.versions[0]?.isPublished).toBe(false);

    t.publishVersion('v1');
    expect(t.props.versions[0]?.isPublished).toBe(true);

    const published = t.getPublishedVersion();
    expect(published?.id).toBe('v1');
  });

  it('should reject missing code', () => {
    expect(() => NotificationTemplate.create({
      id: 't1', companyId: 'c1', code: '', name: 'N', defaultChannel: 'email'
    })).toThrow('Template code is required');
  });
});
