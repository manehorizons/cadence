import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import { readRecommendationLedger } from '../../src/intelligence/store/io.js';
import { recommendationArchiveService } from '../../src/services/recommendation-archive.js';
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

describe('recommendationArchiveService (phase 153)', () => {
  it('archives a live recommendation, stamping archivedAt/archiveReason', async () => {
    active = await tempRepo({ initialized: true, projectName: 'archive-svc' });
    const recId = await seedRec(active.root);

    const io = bufferIO();
    const res = await recommendationArchiveService(active.root, { recId }, io);

    expect(res.exitCode).toBe(0);
    const data = res.data as { id: string; archivedAt?: string; archiveReason?: string } | null;
    expect(data?.id).toBe(recId);
    expect(data?.archiveReason).toBe('manual');
    expect(typeof data?.archivedAt).toBe('string');
    expect(io.stdout()).toContain('archived');

    const ledger = await readRecommendationLedger(active.root);
    expect(ledger.recommendations.find((r) => r.id === recId)).toBeUndefined();
    const archived = ledger.archived.find((r) => r.id === recId);
    expect(archived?.archiveReason).toBe('manual');
    expect(typeof archived?.archivedAt).toBe('string');
  });

  it('fails cleanly on an unknown recommendation id', async () => {
    active = await tempRepo({ initialized: true, projectName: 'archive-svc-fail' });

    const io = bufferIO();
    const res = await recommendationArchiveService(
      active.root,
      { recId: 'rec-does-not-exist' },
      io,
    );

    expect(res.exitCode).toBe(1);
    expect(res.data).toBeUndefined();
    expect(io.stderr()).toContain('recommendation archive refused');
  });

  it('fails cleanly when archiving an already-archived recommendation', async () => {
    active = await tempRepo({ initialized: true, projectName: 'archive-svc-double' });
    const recId = await seedRec(active.root);

    const io1 = bufferIO();
    const first = await recommendationArchiveService(active.root, { recId }, io1);
    expect(first.exitCode).toBe(0);

    const io2 = bufferIO();
    const second = await recommendationArchiveService(active.root, { recId }, io2);
    expect(second.exitCode).toBe(1);
    expect(second.data).toBeUndefined();
    expect(io2.stderr()).toContain('recommendation archive refused');
  });
});
