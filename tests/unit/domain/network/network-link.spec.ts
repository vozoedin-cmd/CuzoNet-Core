import { describe, it, expect } from 'vitest';
import { NetworkLink } from '../../../../backend/domain/network/network-link.js';
import { NetworkLinkEndpoint } from '../../../../backend/domain/network/network-link-endpoint.js';

describe('NetworkLink', () => {
  it('should create a valid network link with exactly 2 endpoints', () => {
    const ep1 = NetworkLinkEndpoint.create({
      id: 'e1',
      side: 'A',
      nodeId: 'n1',
      equipmentId: 'eq1'
    });
    const ep2 = NetworkLinkEndpoint.create({
      id: 'e2',
      side: 'B',
      nodeId: 'n2',
      equipmentId: 'eq2'
    });

    const link = NetworkLink.create({
      id: 'l1',
      companyId: 'c1',
      linkType: 'ptp_wireless',
      name: 'Link 1',
      status: 'active',
      endpoints: [ep1, ep2]
    });

    expect(link.props.endpoints.length).toBe(2);
  });

  it('should reject a link with less or more than 2 endpoints', () => {
    const ep1 = NetworkLinkEndpoint.create({
      id: 'e1',
      side: 'A',
      nodeId: 'n1',
      equipmentId: 'eq1'
    });

    expect(() => {
      NetworkLink.create({
        id: 'l1',
        companyId: 'c1',
        linkType: 'ptp_wireless',
        name: 'Link 1',
        status: 'active',
        endpoints: [ep1]
      });
    }).toThrow('A network link must have exactly two endpoints');
  });

  it('should reject endpoints from the same node', () => {
    const ep1 = NetworkLinkEndpoint.create({
      id: 'e1',
      side: 'A',
      nodeId: 'n1',
      equipmentId: 'eq1'
    });
    const ep2 = NetworkLinkEndpoint.create({
      id: 'e2',
      side: 'B',
      nodeId: 'n1',
      equipmentId: 'eq2'
    });

    expect(() => {
      NetworkLink.create({
        id: 'l1',
        companyId: 'c1',
        linkType: 'ptp_wireless',
        name: 'Link 1',
        status: 'active',
        endpoints: [ep1, ep2]
      });
    }).toThrow('Link endpoints must belong to different nodes');
  });

  it('should reject endpoints using the same equipment', () => {
    const ep1 = NetworkLinkEndpoint.create({
      id: 'e1',
      side: 'A',
      nodeId: 'n1',
      equipmentId: 'eq1'
    });
    const ep2 = NetworkLinkEndpoint.create({
      id: 'e2',
      side: 'B',
      nodeId: 'n2',
      equipmentId: 'eq1'
    });

    expect(() => {
      NetworkLink.create({
        id: 'l1',
        companyId: 'c1',
        linkType: 'ptp_wireless',
        name: 'Link 1',
        status: 'active',
        endpoints: [ep1, ep2]
      });
    }).toThrow('Link endpoints must use different equipment');
  });
});
