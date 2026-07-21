import { describe, it, expect } from 'vitest';
import { routerOsPppoeInputSchema } from '../../../../../backend/infrastructure/provisioning/routeros/routeros-pppoe.input.js';

describe('RouterOsPppoeInput', () => {
  it('should validate a correct create payload', () => {
    const payload = {
      actionType: 'routeros.pppoe.create',
      credentialReference: 'pppoe-password-user1',
      name: 'user1',
      profile: 'profile1',
      routerId: 'router-1',
    };
    const result = routerOsPppoeInputSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should invalidate create payload with empty credentialReference', () => {
    const payload = {
      actionType: 'routeros.pppoe.create',
      credentialReference: '',
      name: 'user1',
      profile: 'profile1',
      routerId: 'router-1',
    };
    const result = routerOsPppoeInputSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should invalidate a create payload that still carries a plaintext password field', () => {
    const payload = {
      actionType: 'routeros.pppoe.create',
      name: 'user1',
      password: 'password123',
      profile: 'profile1',
      routerId: 'router-1',
    };
    const result = routerOsPppoeInputSchema.safeParse(payload);
    expect(result.success).toBe(false); // credentialReference is required; raw passwords are not accepted
  });

  it('should invalidate payload with control characters in the name', () => {
    const payload = {
      actionType: 'routeros.pppoe.create',
      credentialReference: 'pppoe-password-user1',
      name: 'user\n1',
      profile: 'profile1',
      routerId: 'router-1',
    };
    const result = routerOsPppoeInputSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should validate a correct update payload', () => {
    const payload = {
      actionType: 'routeros.pppoe.update',
      credentialReference: 'pppoe-password-user1-new',
      pppoeReference: 'secret-1',
      routerId: 'router-1',
    };
    const result = routerOsPppoeInputSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should invalidate an update payload with an empty pppoeReference', () => {
    const payload = {
      actionType: 'routeros.pppoe.update',
      pppoeReference: '',
      routerId: 'router-1',
    };
    const result = routerOsPppoeInputSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
