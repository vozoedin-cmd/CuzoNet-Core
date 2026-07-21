import { describe, it, expect } from 'vitest';
import { routerOsPppoeInputSchema } from '../../../../../backend/infrastructure/provisioning/routeros/routeros-pppoe.input.js';

describe('RouterOsPppoeInput', () => {
  it('should validate a correct create payload', () => {
    const payload = {
      actionType: 'routeros.pppoe.create',
      name: 'user1',
      password: 'password123',
      profile: 'profile1',
      routerId: 'router-1',
    };
    const result = routerOsPppoeInputSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it('should invalidate create payload with empty password', () => {
    const payload = {
      actionType: 'routeros.pppoe.create',
      name: 'user1',
      password: '',
      profile: 'profile1',
      routerId: 'router-1',
    };
    const result = routerOsPppoeInputSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should invalidate payload with control characters in password', () => {
    const payload = {
      actionType: 'routeros.pppoe.create',
      name: 'user1',
      password: 'password\n123',
      profile: 'profile1',
      routerId: 'router-1',
    };
    const result = routerOsPppoeInputSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it('should validate a correct update payload', () => {
    const payload = {
      actionType: 'routeros.pppoe.update',
      password: 'newpassword',
      routerId: 'router-1',
      secretReference: 'secret-1',
    };
    const result = routerOsPppoeInputSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});
