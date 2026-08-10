import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import type { Summary } from '@thomas-powers-jr/cadence-types';
import { computeSummaryContentHash } from '../../src/services/summary-hash.js';

// Phase 266 T1 (rec-20260806-010): `cadence summary verify-all` sweeps every
// `*-SUMMARY.json` under `.cadence/phases` in a single in-process walk,
// instead of the old sweep test's one-CLI-subprocess-per-file pattern
// (`packages/core/tests/parse/summary-verify-sweep.test.ts`, rewritten by
// T2 to spawn this subcommand exactly once). NOTE for downstream tasks: the
// DRAFT's prose says "cadence summary verify --all", but Commander throws
// on registering a second subcommand literally named `verify` alongside the
// existing `verify <phase> <num>` (empirically confirmed — see the T1
// report) — the actual registered subcommand is named `verify-all`, invoked
// as `cadence summary verify-all` with no flags.
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

/** Same minimal, valid `Summary` shape used by `summary-verify.test.ts` and
 *  `summary-render.test.ts`, WITHOUT a `contentHash` — each test attaches
 *  one (or not) as its scenario requires. */
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

describe('cadence summary verify-all', () => {
  it('266-01/AC-1: sweeps every *-SUMMARY.json in-process (MATCH + NO_HASH), exits 0 when nothing fails', async () => {
    active = await tempRepo({ initialized: true });

    const withHash = {
      ...BASE_SUMMARY,
      contentHash: computeSummaryContentHash(BASE_SUMMARY as unknown as Summary),
    };
    await writeSummary(active.root, '10-alpha', '10-01', JSON.stringify(withHash));
    // A pre-phase-223-shaped record with no contentHash at all: NO_HASH is
    // informational, not a failure, per AC-1's classification.
    await writeSummary(active.root, '11-beta', '11-01', JSON.stringify(BASE_SUMMARY));

    const r = await run(['summary', 'verify-all'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/11-beta\/11-01: NO_HASH/);
    expect(r.stdout).toMatch(/2 checked: 1 MATCH, 1 NO_HASH, 0 failed/);
    // MATCH files are not individually printed — 275+ MATCH lines would be
    // noise; the aggregate count above is the proof.
    expect(r.stdout).not.toMatch(/10-alpha\/10-01/);
  });

  it('266-01/AC-1: classifies MISMATCH as a failure, exits nonzero, without aborting the rest of the sweep', async () => {
    active = await tempRepo({ initialized: true });

    const withHash = {
      ...BASE_SUMMARY,
      contentHash: computeSummaryContentHash(BASE_SUMMARY as unknown as Summary),
    };
    // Hand-edited after the hash was stored, mirroring summary-verify.test.ts's tamper scenario.
    const tampered = {
      ...withHash,
      taskResults: [
        { id: 'T1', status: 'DONE', notes: 'wrote the renderer' },
        { id: 'T2', status: 'DONE', notes: 'quietly hand-flipped to DONE' },
      ],
    };
    await writeSummary(active.root, '20-gamma', '20-01', JSON.stringify(tampered));
    // A clean, valid summary in a different phase directory, to prove one
    // bad file doesn't abort the whole in-process walk.
    await writeSummary(active.root, '21-delta', '21-01', JSON.stringify(withHash));

    const r = await run(['summary', 'verify-all'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stdout).toMatch(/20-gamma\/20-01: MISMATCH/);
    expect(r.stdout).toMatch(/2 checked: 1 MATCH, 0 NO_HASH, 1 failed/);
  });

  it('266-01/AC-1: classifies a load/parse/schema failure as a failure, exits nonzero, without aborting the rest of the sweep', async () => {
    active = await tempRepo({ initialized: true });

    await writeSummary(active.root, '30-epsilon', '30-01', '{ not valid json');
    const withHash = {
      ...BASE_SUMMARY,
      contentHash: computeSummaryContentHash(BASE_SUMMARY as unknown as Summary),
    };
    await writeSummary(active.root, '31-zeta', '31-01', JSON.stringify(withHash));

    const r = await run(['summary', 'verify-all'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/30-epsilon\/30-01: FAILURE/);
    expect(r.stderr).toMatch(/is not valid JSON/);
    expect(r.stdout).toMatch(/2 checked: 1 MATCH, 0 NO_HASH, 1 failed/);
  });

  it('266-01/AC-1: classifies a schema-invalid SUMMARY.json as a failure (distinct from a parse error)', async () => {
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
    await writeSummary(active.root, '32-mu', '32-01', JSON.stringify(malformed));

    const r = await run(['summary', 'verify-all'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toMatch(/32-mu\/32-01: FAILURE/);
    expect(r.stderr).toMatch(/does not match the expected SUMMARY schema/i);
  });

  it('266-01/AC-1: NO_HASH-only files are informational and never fail the sweep (all-NO_HASH is still the all-pass case)', async () => {
    active = await tempRepo({ initialized: true });

    await writeSummary(active.root, '40-eta', '40-01', JSON.stringify(BASE_SUMMARY));
    await writeSummary(active.root, '41-theta', '41-01', JSON.stringify(BASE_SUMMARY));

    const r = await run(['summary', 'verify-all'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/2 checked: 0 MATCH, 2 NO_HASH, 0 failed/);
  });

  it('266-01/AC-1: an all-MATCH corpus is the clean all-pass case', async () => {
    active = await tempRepo({ initialized: true });

    const withHash = {
      ...BASE_SUMMARY,
      contentHash: computeSummaryContentHash(BASE_SUMMARY as unknown as Summary),
    };
    await writeSummary(active.root, '50-nu', '50-01', JSON.stringify(withHash));
    await writeSummary(active.root, '51-xi', '51-01', JSON.stringify(withHash));
    await writeSummary(active.root, '52-omicron', '52-01', JSON.stringify(withHash));

    const r = await run(['summary', 'verify-all'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/3 checked: 3 MATCH, 0 NO_HASH, 0 failed/);
  });

  it('reports a loud stderr notice (not silent success) when no summaries exist, still exits 0', async () => {
    active = await tempRepo({ initialized: true });

    const r = await run(['summary', 'verify-all'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/no \*-SUMMARY\.json files found/);
  });
});
