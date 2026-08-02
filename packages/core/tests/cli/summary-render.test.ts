import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

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

/** A minimal, valid `Summary` (per `SummaryZ`) with concrete, distinctive
 *  values so assertions can check real content rather than "non-empty". No
 *  `gateBypasses`, and empty `decisions`/`deferred` — used to verify those
 *  section headers are omitted entirely when there's nothing to show. */
const VALID_SUMMARY = {
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

describe('cadence summary render', () => {
  it('renders a valid SUMMARY.json deterministically for pasting into a PR (AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify(VALID_SUMMARY, null, 2),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');

    // AC-1: rendering surfaces per-AC pass/fail status and gate outcomes,
    // pasteable without opening SUMMARY.json by hand.
    expect(r.stdout).toMatch(/77-01/);
    expect(r.stdout).toMatch(/AC-1: PASS/);
    expect(r.stdout).toMatch(/AC-2: FAIL/);
    expect(r.stdout).toMatch(/edge case missing/);
    expect(r.stdout).toMatch(/T1: DONE/);
    expect(r.stdout).toMatch(/T2: BLOCKED/);
    expect(r.stdout).toMatch(/structural-verifier: ran/);
    expect(r.stdout).toMatch(/boundary-scan: skipped/);
    expect(r.stdout).toMatch(/boundaryEnforcement is not "block"/);

    const r2 = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r2.code).toBe(0);
    // AC-1: deterministic — running it twice against the same fixture
    // produces byte-identical output.
    expect(r2.stdout).toBe(r.stdout);
  });

  it('displays the content hash when present (AC-1, phase 223)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify(
        { ...VALID_SUMMARY, contentHash: { algorithm: 'sha256', value: 'deadbeef'.repeat(8) } },
        null,
        2,
      ),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    // AC-1: `cadence summary render` — not just the settle-time SUMMARY.md
    // sidecar — surfaces the content hash a caller would need to cross-check
    // against `cadence summary verify`.
    expect(r.stdout).toMatch(/Content hash \(sha256\):/);
    expect(r.stdout).toMatch(new RegExp('deadbeef'.repeat(8)));
  });

  it('omits the content-hash line for a pre-phase-223 SUMMARY.json with no hash (AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify(VALID_SUMMARY, null, 2),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/Content hash/);
  });

  it('omits empty gate-bypasses/decisions/deferred section headers (AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify(VALID_SUMMARY, null, 2),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    // AC-1: empty sections are omitted entirely rather than printed blank.
    expect(r.stdout).not.toMatch(/## Gate bypasses/);
    expect(r.stdout).not.toMatch(/## Decisions/);
    expect(r.stdout).not.toMatch(/## Deferred/);
  });

  it('refuses loudly when SUMMARY.json is missing (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    // No phase directory / SUMMARY.json written at all.

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stdout).toBe('');
    // AC-2: refuses loudly, naming the phase/path, rather than a raw stack trace.
    expect(r.stderr).toMatch(/77-team-rollout-kit/);
    expect(r.stderr).toMatch(/77-01/);
    expect(r.stderr).not.toMatch(/at file:\/\//); // no raw stack trace
  });

  it('refuses loudly when SUMMARY.json has broken JSON syntax (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(active.root, '77-team-rollout-kit', '77-01', '{ "schemaVersion": 1, ');

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stdout).toBe('');
    // AC-2: names the problem as invalid JSON, not a crash.
    expect(r.stderr).toMatch(/not valid JSON/i);
  });

  it('refuses loudly when SUMMARY.json fails schema validation (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    // Valid JSON, but missing the required `draftId` field and wrong type
    // for `completedAt` — should fail SummaryZ.safeParse, not crash.
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

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stdout).toBe('');
    // AC-2: names the schema mismatch (the missing/invalid fields), not a blank/garbled dump.
    expect(r.stderr).toMatch(/does not match the expected SUMMARY schema/i);
    expect(r.stderr).toMatch(/draftId/);
    expect(r.stderr).toMatch(/completedAt/);
  });

  it('reports "newer Cadence" (not a generic parse error) for an unrecognized higher schemaVersion (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({ ...VALID_SUMMARY, schemaVersion: 3 }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).not.toBe(0);
    expect(r.stdout).toBe('');
    // AC-4: a distinct "newer Cadence" diagnostic, not the generic
    // "does not match the expected SUMMARY schema" Zod-error message.
    expect(r.stderr).toMatch(/newer version of Cadence/i);
    expect(r.stderr).toMatch(/schemaVersion 3/);
    expect(r.stderr).not.toMatch(/does not match the expected SUMMARY schema/i);
  });

  it('still parses a schemaVersion: 1 SUMMARY normally (regression, AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({ ...VALID_SUMMARY, schemaVersion: 1 }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/77-01/);
  });

  it('still parses a schemaVersion: 2 SUMMARY normally (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({ ...VALID_SUMMARY, schemaVersion: 2 }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toMatch(/77-01/);
  });
});
