
import { describe, it, expect } from 'vitest';
import { Notification } from '../../../../backend/domain/notifications/notification.js';

describe('Notification', () => {
  let deliveryIdCounter = 1;
  const deliveryIdGen = () => `del_${deliveryIdCounter++}`;

  it('should create a notification in queued state', () => {
    const n = Notification.create({
      id: 'n1',
      companyId: 'c1',
      templateId: 't1',
      templateVersionId: 'v1',
      variables: {},
      destinations: [
        { recipient: { recipientId: 'r1', address: '123' }, channel: 'whatsapp' }
      ],
      deliveryIdGenerator: deliveryIdGen
    });

    expect(n.props.status).toBe('queued');
    expect(n.props.deliveries).toHaveLength(1);
    expect(n.props.deliveries[0]?.status).toBe('pending');
  });

  it('should claim and complete delivery', () => {
    const n = Notification.create({
      id: 'n2', companyId: 'c1', templateId: 't1', templateVersionId: 'v1', variables: {},
      destinations: [{ recipient: { recipientId: 'r1', address: '123' }, channel: 'whatsapp' }],
      deliveryIdGenerator: deliveryIdGen
    });

    const delId = n.props.deliveries[0]?.id as string;
    n.claimDelivery(delId, 'token123', 60);
    expect(n.props.deliveries[0]?.status).toBe('claimed');
    expect(n.props.status).toBe('processing');

    n.completeDelivery(delId);
    expect(n.props.deliveries[0]?.status).toBe('sent');
    expect(n.props.status).toBe('delivered');
  });

  it('should fail delivery and schedule retry', () => {
    const n = Notification.create({
      id: 'n3', companyId: 'c1', templateId: 't1', templateVersionId: 'v1', variables: {},
      destinations: [{ recipient: { recipientId: 'r1', address: '123' }, channel: 'whatsapp' }],
      deliveryIdGenerator: deliveryIdGen
    });

    const delId = n.props.deliveries[0]?.id as string;
    n.failDelivery(delId, 'att1', { code: 'ERR', message: 'test', sanitized: true }, 60);

    expect(n.props.deliveries[0]?.status).toBe('pending'); // scheduled for retry
    expect(n.props.deliveries[0]?.attemptCount).toBe(1);
    expect(n.props.deliveries[0]?.nextAttemptAt).toBeDefined();
    expect(n.props.status).toBe('queued');
  });

  it('should cancel notification', () => {
    const n = Notification.create({
      id: 'n4', companyId: 'c1', templateId: 't1', templateVersionId: 'v1', variables: {},
      destinations: [{ recipient: { recipientId: 'r1', address: '123' }, channel: 'whatsapp' }],
      deliveryIdGenerator: deliveryIdGen
    });

    n.cancel();
    expect(n.props.status).toBe('cancelled');
    expect(n.props.deliveries[0]?.status).toBe('cancelled');
  });
});
