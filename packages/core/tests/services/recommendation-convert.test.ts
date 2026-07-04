import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import { readRecommendationLedger } from '../../src/intelligence/store/io.js';
import { recommendationConvertService } from '../../src/services/recommendation-convert.js';
import { bufferIO } from '../../src/services/io.js';

async function seedRec(root: string): Promise<string> {
  const r = await addRecommendation(root, {
    title: 'Demo rec',
    summary: 'A test recommendation',
    priority: 'medium',
    readiness: 'ready-for-cadence-spec',
    affectedAreas: [],
    affectedFiles: [],
  });
  return r.id;
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('recommendationConvertService (phase 153)', () => {
  it('converts a candidate recommendation into an existing phase', async () => {
    active = await tempRepo({ initialized: true, projectName: 'convert-svc' });
    const recId = await seedRec(active.root);
    await mkdir(join(active.root, '.cadence', 'phases', '153-demo'), { recursive: true });

    const io = bufferIO();
    const res = await recommendationConvertService(
      active.root,
      { recId, toPhase: '153-demo' },
      io,
    );

    expect(res.exitCode).toBe(0);
    const data = res.data as { status: string; convertedToPhaseId: string } | null;
    expect(data?.status).toBe('converted');
    expect(data?.convertedToPhaseId).toBe('153-demo');
    expect(io.stdout()).toContain('converted');

    const ledger = await readRecommendationLedger(active.root);
    const persisted = ledger.recommendations.find((r) => r.id === recId);
    expect(persisted?.status).toBe('converted');
    expect(persisted?.convertedToPhaseId).toBe('153-demo');
  });

  it('fails cleanly on an unknown recommendation id', async () => {
    active = await tempRepo({ initialized: true, projectName: 'convert-svc-fail' });
    await mkdir(join(active.root, '.cadence', 'phases', '153-demo'), { recursive: true });

    const io = bufferIO();
    const res = await recommendationConvertService(
      active.root,
      { recId: 'rec-does-not-exist', toPhase: '153-demo' },
      io,
    );

    expect(res.exitCode).toBe(1);
    expect(res.data).toBeUndefined();
    expect(io.stderr()).toContain('recommendation convert refused');
  });
});
