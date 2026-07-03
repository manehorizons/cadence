import { describe, it, expect, afterEach } from 'vitest';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  addRecommendation,
  runAdvanceConvertedToSettlePendingForPhase,
  runRecommendationTransition,
} from '../../src/intelligence/store/recommendations.js';
import { progressService } from '../../src/services/progress.js';
import type { CommandIO } from '../../src/services/io.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

function captureIO(): { io: CommandIO; out: string[] } {
  const out: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => out.push(s) }, out };
}

async function seedSettlePendingRec(root: string, phaseId: string): Promise<void> {
  const rec = await addRecommendation(root, {
    title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
    affectedAreas: [], affectedFiles: [],
  });
  await mkdir(join(root, '.cadence', 'phases', phaseId), { recursive: true });
  await runRecommendationTransition(root, rec.id, 'convert', phaseId);
  await runAdvanceConvertedToSettlePendingForPhase(root, phaseId);
}

describe('progressService settle-pending note', () => {
  it('AC-5: omits Note when no recommendations are settle-pending', async () => {
    active = await tempRepo({ initialized: true });
    const { io, out } = captureIO();
    await progressService(active.root, io, {});
    expect(out.join('')).not.toMatch(/Note:/);
  });

  it('AC-5: includes a Note naming the settle-pending count', async () => {
    active = await tempRepo({ initialized: true });
    await seedSettlePendingRec(active.root, '144-a');
    const { io, out } = captureIO();
    const result = await progressService(active.root, io, {});
    expect(out.join('')).toMatch(/Note: 1 recommendation\(s\) settled but not yet confirmed shipped/);
    expect((result.data as { note?: string }).note).toMatch(/1 recommendation/);
  });

  it('AC-5: --json output includes an optional note field only when non-empty', async () => {
    active = await tempRepo({ initialized: true });
    await seedSettlePendingRec(active.root, '144-b');
    const { io, out } = captureIO();
    await progressService(active.root, io, { json: true });
    const parsed = JSON.parse(out.join(''));
    expect(parsed.note).toMatch(/settled but not yet confirmed shipped/);
  });
});
