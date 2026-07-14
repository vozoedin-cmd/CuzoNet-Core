import { describe, expect, it } from 'vitest';

import { Plan } from '../../../../backend/domain/plans/plan.js';
import { BandwidthProfile } from '../../../../backend/domain/plans/value-objects/bandwidth-profile.js';
import { CompatibleServiceType } from '../../../../backend/domain/plans/value-objects/compatible-service-type.js';
import { PlanCode } from '../../../../backend/domain/plans/value-objects/plan-code.js';
import { PlanId } from '../../../../backend/domain/plans/value-objects/plan-id.js';
import { PlanName } from '../../../../backend/domain/plans/value-objects/plan-name.js';
import { PlanVersionId } from '../../../../backend/domain/plans/value-objects/plan-version-id.js';

const planId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c40';
const firstVersionId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c41';
const secondVersionId = '01890f2e-7b2a-7cc0-8b9a-7e6b4f3a2c42';

function createPlan(): Plan {
  return Plan.create({
    bandwidth: BandwidthProfile.create({ downloadKbps: 20_000, uploadKbps: 10_000 }),
    causationId: 'create-plan-0001',
    code: PlanCode.create('HOME_20'),
    companyId: 'company-one',
    correlationId: 'correlation-one',
    createdAt: new Date('2026-07-13T12:00:00.000Z'),
    effectiveFrom: '2026-07-13',
    eventId: 'event-one',
    id: PlanId.create(planId),
    name: PlanName.create('Hogar 20 Mbps'),
    planVersionId: PlanVersionId.create(firstVersionId),
    priceCents: 25_000,
    serviceType: CompatibleServiceType.create('simple_queue'),
  });
}

describe('Plan domain', () => {
  it('mantiene UUIDv7 como identidad y versionNumber como secuencia humana', () => {
    const plan = createPlan();
    const firstVersion = plan.currentVersion;
    plan.pullDomainEvents();

    plan.revise({
      bandwidth: BandwidthProfile.create({ downloadKbps: 30_000, uploadKbps: 15_000 }),
      causationId: 'revise-plan-0001',
      correlationId: 'correlation-two',
      effectiveFrom: '2026-08-01',
      eventId: 'event-two',
      isActive: undefined,
      planVersionId: PlanVersionId.create(secondVersionId),
      priceCents: 30_000,
      revisedAt: new Date('2026-07-20T12:00:00.000Z'),
    });

    expect(plan.currentVersion.id.value).toBe(secondVersionId);
    expect(plan.currentVersion.versionNumber).toBe(2);
    expect(firstVersion).toMatchObject({ versionNumber: 1, priceCents: 25_000 });
    expect(plan.pullDomainEvents()[0]).toMatchObject({
      eventType: 'PlanVersionCreated.v1',
      payload: { companyId: 'company-one', planVersionId: secondVersionId },
    });
  });

  it('modela BandwidthProfile extensible sin exponer estado mutable', () => {
    const profile = BandwidthProfile.create({
      burstDownloadKbps: 60_000,
      burstUploadKbps: 30_000,
      downloadKbps: 50_000,
      priority: 2,
      uploadKbps: 25_000,
    });

    expect(profile.toPrimitives()).toEqual({
      burstDownloadKbps: 60_000,
      burstUploadKbps: 30_000,
      downloadKbps: 50_000,
      priority: 2,
      uploadKbps: 25_000,
    });
  });

  it.each(['simple_queue', 'pppoe', 'hotspot'])('reconoce %s como tipo compatible', (value) => {
    expect(CompatibleServiceType.create(value).value).toBe(value);
  });

  it('rechaza identidades de version que no sean UUIDv7', () => {
    expect(() => PlanVersionId.create('550e8400-e29b-41d4-a716-446655440000')).toThrow();
  });
});
