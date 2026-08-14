import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import {
  addRecommendation,
  runRecommendationPromotion,
  runRecommendationUnarchive,
  runRecommendationTransition,
  runAdvanceConvertedToSettlePendingForPhase,
  readRecommendationLedger,
} from '../../src/intelligence/store/recommendations.js';
import { checkRecommendationArchiveCurrency, runDoctor } from '../../src/doctor/run.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

/**
 * Seeds a recommendation that reaches a terminal status ('shipped' or
 * 'rejected') via `runRecommendationPromotion` (which auto-archives it under
 * the default `recommendations.autoArchive: true` config) and then restores
 * it to the active `recommendations` array via `runRecommendationUnarchive`
 * — which clears only `archivedAt`/`archiveReason`, leaving `status`
 * untouched. This reproduces exactly the phase-276 scenario this check
 * guards against: a terminal-status record sitting in the active array,
 * unarchived (as if it predated the phase-102 auto-archive feature).
 */
async function seedActiveTerminal(
  root: string,
  status: 'shipped' | 'rejected',
): Promise<string> {
  const rec = await addRecommendation(root, {
    title: `terminal ${status}`,
    summary: 's',
    priority: 'medium',
    readiness: 'raw-idea',
    affectedAreas: [],
    affectedFiles: [],
  });
  const promoted = await runRecommendationPromotion(root, rec.id, {
    status,
    ...(status === 'shipped' ? { shippedRef: 'PR #1' } : {}),
  });
  if (!promoted.ok) throw new Error(`seed setup failed: ${promoted.error}`);
  const unarchived = await runRecommendationUnarchive(root, rec.id);
  if (!unarchived.ok) throw new Error(`seed setup failed: ${unarchived.error}`);
  return rec.id;
}

async function seedConverted(root: string, phaseId: string): Promise<string> {
  const rec = await addRecommendation(root, {
    title: 'converted rec',
    summary: 's',
    priority: 'medium',
    readiness: 'raw-idea',
    affectedAreas: [],
    affectedFiles: [],
  });
  await mkdir(join(root, '.cadence', 'phases', phaseId), { recursive: true });
  const transitioned = await runRecommendationTransition(root, rec.id, 'convert', phaseId);
  if (!transitioned.ok) throw new Error(`seed setup failed: ${transitioned.error}`);
  return rec.id;
}

async function seedSettlePending(root: string, phaseId: string): Promise<string> {
  const id = await seedConverted(root, phaseId);
  const advanced = await runAdvanceConvertedToSettlePendingForPhase(root, phaseId);
  if (!advanced.includes(id)) {
    throw new Error('seed setup failed: recommendation did not advance to settle-pending');
  }
  return id;
}

describe('checkRecommendationArchiveCurrency', () => {
  it('277-01/AC-1: flags a shipped record and a rejected record in the active array, severity warning', async () => {
    active = await tempRepo({ initialized: true });
    const shippedId = await seedActiveTerminal(active.root, 'shipped');
    const rejectedId = await seedActiveTerminal(active.root, 'rejected');

    // Verify the seeded precondition: both records are terminal-status but
    // sitting in the active array, not archived — otherwise a pass here
    // would be green for the wrong reason.
    const ledger = await readRecommendationLedger(active.root);
    const shippedRec = ledger.recommendations.find((r) => r.id === shippedId);
    const rejectedRec = ledger.recommendations.find((r) => r.id === rejectedId);
    expect(shippedRec?.status).toBe('shipped');
    expect(rejectedRec?.status).toBe('rejected');
    expect(ledger.archived.some((r) => r.id === shippedId || r.id === rejectedId)).toBe(false);

    const check = await checkRecommendationArchiveCurrency(active.root);
    expect(check.name).toBe('recommendation-archive-currency');
    expect(check.severity).toBe('warning');
    expect(check.detail).toContain(shippedId);
    expect(check.detail).toContain('shipped');
    expect(check.detail).toContain(rejectedId);
    expect(check.detail).toContain('rejected');
    expect(check.remediation).toMatch(/cadence recommendation archive/);
  });

  it('277-01/AC-2: candidate, accepted, deferred, converted, and settle-pending records are all present and none flagged', async () => {
    active = await tempRepo({ initialized: true });
    const candidate = await addRecommendation(active.root, {
      title: 'candidate rec',
      summary: 's',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
    });
    const acceptedRec = await addRecommendation(active.root, {
      title: 'accepted rec',
      summary: 's',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
    });
    const accepted = await runRecommendationPromotion(active.root, acceptedRec.id, {
      status: 'accepted',
    });
    if (!accepted.ok) throw new Error(`seed setup failed: ${accepted.error}`);
    const deferredRec = await addRecommendation(active.root, {
      title: 'deferred rec',
      summary: 's',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
    });
    const deferred = await runRecommendationPromotion(active.root, deferredRec.id, {
      status: 'deferred',
    });
    if (!deferred.ok) throw new Error(`seed setup failed: ${deferred.error}`);
    // Convert two recs to two DIFFERENT phases so advancing only one phase to
    // settle-pending leaves the other genuinely 'converted' — advancing
    // shares no phase id, or both would flip to settle-pending together.
    const convertedId = await seedConverted(active.root, '900-stays-converted');
    const settlePendingId = await seedSettlePending(active.root, '901-advances');

    // Verify every seeded precondition before trusting a green check.
    const ledger = await readRecommendationLedger(active.root);
    const byId = (id: string) => ledger.recommendations.find((r) => r.id === id);
    expect(byId(candidate.id)?.status).toBe('candidate');
    expect(byId(acceptedRec.id)?.status).toBe('accepted');
    expect(byId(deferredRec.id)?.status).toBe('deferred');
    expect(byId(convertedId)?.status).toBe('converted');
    expect(byId(settlePendingId)?.status).toBe('settle-pending');
    expect(ledger.recommendations).toHaveLength(5);

    const check = await checkRecommendationArchiveCurrency(active.root);
    expect(check.severity).toBe('ok');
  });

  it('277-01/AC-2: a shipped record already in ledger.archived does not cause a flag', async () => {
    active = await tempRepo({ initialized: true });
    const rec = await addRecommendation(active.root, {
      title: 'already archived shipped rec',
      summary: 's',
      priority: 'medium',
      readiness: 'raw-idea',
      affectedAreas: [],
      affectedFiles: [],
    });
    const promoted = await runRecommendationPromotion(active.root, rec.id, {
      status: 'shipped',
      shippedRef: 'PR #2',
    });
    if (!promoted.ok) throw new Error(`seed setup failed: ${promoted.error}`);

    // Verify the seeded precondition: auto-archive left this record in
    // `archived`, not `recommendations`.
    const ledger = await readRecommendationLedger(active.root);
    expect(ledger.recommendations.some((r) => r.id === rec.id)).toBe(false);
    const archivedRec = ledger.archived.find((r) => r.id === rec.id);
    expect(archivedRec?.status).toBe('shipped');

    const check = await checkRecommendationArchiveCurrency(active.root);
    expect(check.severity).toBe('ok');
  });

  it('277-01/AC-3: malformed JSON in recommendations.json produces severity indeterminate, not ok', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.cadence', 'intelligence');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'recommendations.json'), '{ not valid json');

    const check = await checkRecommendationArchiveCurrency(active.root);
    expect(check.severity).toBe('indeterminate');
    expect(check.severity).not.toBe('ok');
  });

  it('277-01/AC-3: schema-invalid recommendations.json produces severity indeterminate, not ok', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.cadence', 'intelligence');
    await mkdir(dir, { recursive: true });
    // Valid JSON, but fails RecommendationLedgerZ validation (recommendations
    // must be an array; schemaVersion must be the literal 1).
    await writeFile(
      join(dir, 'recommendations.json'),
      JSON.stringify({ schemaVersion: 2, recommendations: 'not-an-array' }),
    );

    const check = await checkRecommendationArchiveCurrency(active.root);
    expect(check.severity).toBe('indeterminate');
    expect(check.severity).not.toBe('ok');
  });

  // Deliberately untagged with an AC- token: this is NOT an AC-3 case.
  // readRecommendationLedger does not throw for a missing recommendations.json —
  // readLedger's `existsSync` contract (../../src/intelligence/store/ledger.ts)
  // returns an empty ledger instead, and a brand-new `cadence init` has no
  // recommendations.json at all (tempRepo({ initialized: true }) creates no
  // intelligence/ dir). Mirrors checkConductionDriftStreak's own precedent:
  // corpus absent entirely -> ok; corpus present but unassessable -> indeterminate.
  it('a genuinely missing recommendations.json is severity ok, not indeterminate', async () => {
    active = await tempRepo({ initialized: true });
    // No .cadence/intelligence/recommendations.json written at all.

    const check = await checkRecommendationArchiveCurrency(active.root);
    expect(check.severity).toBe('ok');
  });

  it('277-01/AC-5: fixId is null on the warning path', async () => {
    active = await tempRepo({ initialized: true });
    await seedActiveTerminal(active.root, 'shipped');

    const check = await checkRecommendationArchiveCurrency(active.root);
    expect(check.severity).toBe('warning');
    expect(check.fixId).toBeNull();
  });

  it('277-01/AC-5: fixId is null on the indeterminate path', async () => {
    active = await tempRepo({ initialized: true });
    const dir = join(active.root, '.cadence', 'intelligence');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'recommendations.json'), '{ not valid json');

    const check = await checkRecommendationArchiveCurrency(active.root);
    expect(check.severity).toBe('indeterminate');
    expect(check.fixId).toBeNull();
  });

  it('277-01/AC-4: wired into runDoctor() — the check is present in the full report', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, { nodeVersion: 'v22.11.0', platform: 'linux' });
    const check = report.checks.find((c) => c.name === 'recommendation-archive-currency');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('ok');
  });
});
