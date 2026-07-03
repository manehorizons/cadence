import { describe, it, expect, afterEach } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import { runAdvanceConvertedToSettlePendingForPhase } from '../../src/intelligence/store/recommendations.js';
import { runRecommendationTransition } from '../../src/intelligence/store/recommendations.js';
import { checkRecommendationShippedDrift } from '../../src/doctor/run.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function seedSettlePendingRec(root: string, phaseId: string): Promise<string> {
  const rec = await addRecommendation(root, {
    title: 'ship me', summary: 's', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  await mkdir(join(root, '.cadence', 'phases', phaseId), { recursive: true });
  await runRecommendationTransition(root, rec.id, 'convert', phaseId);
  await runAdvanceConvertedToSettlePendingForPhase(root, phaseId);
  return rec.id;
}

describe('checkRecommendationShippedDrift', () => {
  it('AC-4: ok when no recommendations are settle-pending', async () => {
    active = await tempRepo({ initialized: true });
    const check = await checkRecommendationShippedDrift(active.root);
    expect(check.name).toBe('recommendation-shipped-drift');
    expect(check.severity).toBe('ok');
  });

  it('AC-4: warning naming each settle-pending recommendation and its phase', async () => {
    active = await tempRepo({ initialized: true });
    const id = await seedSettlePendingRec(active.root, '144-target');
    const check = await checkRecommendationShippedDrift(active.root);
    expect(check.severity).toBe('warning');
    expect(check.detail).toContain(id);
    expect(check.detail).toContain('144-target');
    expect(check.detail).toContain('ship me');
    expect(check.remediation).toMatch(/promote/);
    expect(check.remediation).toMatch(/shipped/);
  });
});
