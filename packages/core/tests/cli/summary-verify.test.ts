import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import type { Summary } from '@manehorizons/cadence-types';
import { computeSummaryContentHash } from '../../src/services/summary-hash.js';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

/** A minimal, valid `Summary` (per `SummaryZ`), same shape as
 *  `summary-render.test.ts`'s fixture, WITHOUT a `contentHash` yet — each
 *  test attaches one (or not) as its scenario requires. */
const BASE_SUMMARY = {
  schemaVersion: 1,
  draftId: '77-01',
  completedAt: '2026-07-15T10:00:00.000Z',
  acResults: [
    { id: 'AC-1', pass: true, evidence: 'executed', note: 'renders cleanly' },
    { id: 'AC-2', pass: false, evidence: 'assertion', note: 'edge case missing' },
  ],
  taskResults: [
    { id: 'T1', status: 'DONE', notes: 'wrote the renderer' },
    { id: 'T2', status: 'BLOCKED', notes: '' },
  ],
  decisions: [],
  deferred: [],
  skillAudit: { required: [], invoked: [] },
  gates: [
    { gate: 'structural-verifier', status: 'ran' },
    { gate: 'boundary-scan', status: 'skipped', skipReason: 'boundaryEnforcement is not "block"' },
  ],
};

async function writeSummary(root: string, phase: string, id: string, content: string): Promise<void> {
  const dir = join(root, '.cadence', 'phases', phase);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}-SUMMARY.json`), content);
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence summary verify', () => {
  it('reports MATCH for a summary whose stored contentHash matches a recomputation (AC-2)', async () => {
    active = await tempRepo({ initialized: true });

    // Build a summary the same way settle does: compute the hash over the
    // content, then attach it — mirrors T2's settle.ts sequencing.
    const withHash = {
      ...BASE_SUMMARY,
      contentHash: computeSummaryContentHash(BASE_SUMMARY as unknown as Summary),
    };
    await writeSummary(active.root, '77-team-rollout-kit', '77-01', JSON.stringify(withHash, null, 2));

    const r = await run(['summary', 'verify', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/^MATCH: SUMMARY\.json content hash verified \(sha256\)/);
  });

  it('reports MISMATCH (exit 1) when content was hand-edited after the hash was stored (AC-2)', async () => {
    active = await tempRepo({ initialized: true });

    const withHash = {
      ...BASE_SUMMARY,
      contentHash: computeSummaryContentHash(BASE_SUMMARY as unknown as Summary),
    };
    // Simulate a hand-edit after settle: mutate taskResults WITHOUT
    // recomputing contentHash, so the stored digest goes stale.
    const tampered = {
      ...withHash,
      taskResults: [
        { id: 'T1', status: 'DONE', notes: 'wrote the renderer' },
        { id: 'T2', status: 'DONE', notes: 'quietly hand-flipped to DONE' },
      ],
    };
    await writeSummary(active.root, '77-team-rollout-kit', '77-01', JSON.stringify(tampered, null, 2));

    const r = await run(['summary', 'verify', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/^MISMATCH: stored hash does not match recomputed content/);
    expect(r.stdout).toMatch(/edited after settle/);
  });

  it('reports NO_HASH (exit 0) for a pre-phase-223 summary with no contentHash field (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    // BASE_SUMMARY has no contentHash at all — same shape a pre-phase-223
    // SUMMARY.json (or a REFUSED-settle SUMMARY) would have.
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify(BASE_SUMMARY, null, 2),
    );

    const r = await run(['summary', 'verify', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/^NO_HASH: no contentHash present/);
    expect(r.stdout).toMatch(/cannot verify/);
  });

  it('refuses loudly when SUMMARY.json is missing (parity with summary render)', async () => {
    active = await tempRepo({ initialized: true });

    const r = await run(['summary', 'verify', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/77-team-rollout-kit/);
    expect(r.stderr).toMatch(/77-01/);
    expect(r.stderr).not.toMatch(/at file:\/\//);
  });

  it('refuses loudly when SUMMARY.json fails schema validation (parity with summary render)', async () => {
    active = await tempRepo({ initialized: true });
    const malformed = {
      schemaVersion: 1,
      completedAt: 12345,
      acResults: [],
      taskResults: [],
      decisions: [],
      deferred: [],
      skillAudit: { required: [], invoked: [] },
    };
    await writeSummary(active.root, '77-team-rollout-kit', '77-01', JSON.stringify(malformed));

    const r = await run(['summary', 'verify', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/does not match the expected SUMMARY schema/i);
  });
});
