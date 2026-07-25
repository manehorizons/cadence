import { describe, it, expect, afterEach } from 'vitest';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { addRecommendation } from '../../src/intelligence/store/recommendations.js';
import { readRecommendationLedger } from '../../src/intelligence/store/io.js';
import { recommendationPromoteService } from '../../src/services/recommendation-promote.js';
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

describe('recommendationPromoteService (phase 221)', () => {
  // AC-1: `ref` supplied alongside `status=shipped` sets `shippedRef` on the
  // resulting recommendation — MCP parity with `cadence recommendation
  // promote <id> --status=shipped --ref "<text>"`.
  it('applies shippedRef when promoting to status=shipped with ref set', async () => {
    active = await tempRepo({ initialized: true, projectName: 'promote-svc-ref' });
    const recId = await seedRec(active.root);

    const io = bufferIO();
    const res = await recommendationPromoteService(
      active.root,
      { id: recId, status: 'shipped', ref: 'PR #70 / v1.22.1' },
      io,
    );

    expect(res.exitCode).toBe(0);
    const data = res.data as { id: string; status: string; shippedRef?: string } | null;
    expect(data?.id).toBe(recId);
    expect(data?.status).toBe('shipped');
    expect(data?.shippedRef).toBe('PR #70 / v1.22.1');

    const ledger = await readRecommendationLedger(active.root);
    const persisted =
      ledger.recommendations.find((r) => r.id === recId) ??
      ledger.archived.find((r) => r.id === recId);
    expect(persisted?.status).toBe('shipped');
    expect((persisted as { shippedRef?: string } | undefined)?.shippedRef).toBe(
      'PR #70 / v1.22.1',
    );
  });

  // AC-1 regression: `ref` supplied when the target status is not `shipped`
  // must be REJECTED — not silently ignored — with the same refusal message
  // the CLI already gives (`shippedRef (--ref) is only valid when promoting
  // to shipped`). This is the failing-before-fix case: prior to adding `ref`
  // to `RecommendationPromoteArgs`, there was no way for an MCP caller to
  // even reach this validation.
  it('rejects ref when the target status is not shipped', async () => {
    active = await tempRepo({ initialized: true, projectName: 'promote-svc-ref-reject' });
    const recId = await seedRec(active.root);

    const io = bufferIO();
    const res = await recommendationPromoteService(
      active.root,
      { id: recId, status: 'accepted', ref: 'should not apply' },
      io,
    );

    expect(res.exitCode).toBe(1);
    expect(res.data).toBeUndefined();
    expect(io.stderr()).toContain(
      'shippedRef (--ref) is only valid when promoting to shipped',
    );

    // Not silently ignored *or* silently applied elsewhere: the recommendation
    // is untouched (still its original status, no shippedRef).
    const ledger = await readRecommendationLedger(active.root);
    const persisted = ledger.recommendations.find((r) => r.id === recId);
    expect(persisted?.status).toBe('candidate');
    expect((persisted as { shippedRef?: string } | undefined)?.shippedRef).toBeUndefined();
  });

  // AC-1 regression: `ref` supplied with no `status` at all (readiness-only
  // promotion) is also rejected, not silently dropped.
  it('rejects ref when status is omitted entirely', async () => {
    active = await tempRepo({ initialized: true, projectName: 'promote-svc-ref-no-status' });
    const recId = await seedRec(active.root);

    const io = bufferIO();
    const res = await recommendationPromoteService(
      active.root,
      { id: recId, readiness: 'ready-for-milestone', ref: 'should not apply' },
      io,
    );

    expect(res.exitCode).toBe(1);
    expect(res.data).toBeUndefined();
    expect(io.stderr()).toContain(
      'shippedRef (--ref) is only valid when promoting to shipped',
    );
  });
});
