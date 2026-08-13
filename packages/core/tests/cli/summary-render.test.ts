import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { MOCK_VERIFIER_CAPABILITY } from '@thomas-powers-jr/cadence-types';

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

describe('cadence summary render - Findings section (phase 257)', () => {
  it('257-01/AC-1: places ## Findings after ## Tasks and before ## Gates', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        codeReview: { 'src/a.ts': [{ severity: 'high', message: 'a high finding' }] },
        gates: [{ gate: 'code-review', status: 'ran' }],
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    const tasksIdx = r.stdout.indexOf('## Tasks');
    const findingsIdx = r.stdout.indexOf('## Findings');
    const gatesIdx = r.stdout.indexOf('## Gates');
    expect(tasksIdx).toBeGreaterThan(-1);
    expect(findingsIdx).toBeGreaterThan(tasksIdx);
    expect(gatesIdx).toBeGreaterThan(findingsIdx);
  });

  it('257-01/AC-1: renders codeReview findings of every severity, grouped by file then severity', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        codeReview: {
          'src/b.ts': [{ severity: 'low', message: 'b low finding' }],
          'src/a.ts': [
            { severity: 'medium', message: 'a medium finding' },
            { severity: 'critical', message: 'a critical finding' },
            { severity: 'high', message: 'a high finding' },
          ],
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('## Findings');
    expect(r.stdout).toContain('### Code review');

    const aIdx = r.stdout.indexOf('#### src/a.ts');
    const bIdx = r.stdout.indexOf('#### src/b.ts');
    expect(aIdx).toBeGreaterThan(-1);
    expect(bIdx).toBeGreaterThan(aIdx);

    const critIdx = r.stdout.indexOf('CRITICAL: a critical finding');
    const highIdx = r.stdout.indexOf('HIGH: a high finding');
    const medIdx = r.stdout.indexOf('MEDIUM: a medium finding');
    expect(critIdx).toBeGreaterThan(aIdx);
    expect(highIdx).toBeGreaterThan(critIdx);
    expect(medIdx).toBeGreaterThan(highIdx);
    expect(medIdx).toBeLessThan(bIdx);
    expect(r.stdout).toMatch(/LOW: b low finding/);
  });

  it('257-01/AC-1: renders securityAudit findings under a Security audit subsection', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        securityAudit: [
          { severity: 'high', message: 'sec high finding' },
          { severity: 'critical', message: 'sec critical finding' },
        ],
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('## Findings');
    expect(r.stdout).toContain('### Security audit');
    const critIdx = r.stdout.indexOf('CRITICAL: sec critical finding');
    const highIdx = r.stdout.indexOf('HIGH: sec high finding');
    expect(critIdx).toBeGreaterThan(-1);
    expect(highIdx).toBeGreaterThan(critIdx);
  });

  it('257-01/AC-1: renders a finding missing every optional field (no line/id/target/anchor/disposition)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        securityAudit: [{ severity: 'medium', message: 'bare finding' }],
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('- MEDIUM: bare finding');
    expect(r.stdout).not.toMatch(/bare finding.*\(line/);
    expect(r.stdout).not.toMatch(/bare finding.*\[/);
  });

  it('257-01/AC-1: renders anchor kind/ref/tier when present', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        codeReview: {
          'src/a.ts': [
            {
              severity: 'high',
              message: 'anchored finding',
              anchor: { kind: 'ac', ref: 'AC-3', tier: 'structured' },
            },
          ],
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/anchored finding.*\[anchor: kind=ac, ref=AC-3, tier=structured\]/);
  });

  it('257-01/AC-1: renders disposition waived together with its matching waiver expiry', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        codeReview: {
          'src/a.ts': [
            {
              severity: 'low',
              message: 'waived finding',
              disposition: 'waived',
              waiver: { expiry: '2026-09-01T00:00:00Z' },
            },
          ],
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(
      /waived finding.*\[disposition: waived; waiver-expiry: 2026-09-01T00:00:00Z\]/,
    );
  });

  it('257-01/AC-1: omits ## Findings entirely when codeReview is {} and securityAudit is absent', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({ ...VALID_SUMMARY, codeReview: {} }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/## Findings/);
  });

  it('257-01/AC-1: omits ## Findings entirely when a codeReview file key maps to [] and securityAudit is absent', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({ ...VALID_SUMMARY, codeReview: { 'src/a.ts': [] } }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/## Findings/);
  });

  it('257-01/AC-1: omits ## Findings entirely when securityAudit is [] and codeReview is absent', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({ ...VALID_SUMMARY, securityAudit: [] }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toMatch(/## Findings/);
  });

  it('257-01/AC-4: redacts an AWS-access-key-shaped string in a codeReview finding message', async () => {
    active = await tempRepo({ initialized: true });
    const leakedKey = 'AKIAABCDEFGHIJKLMNOP';
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        codeReview: {
          'src/a.ts': [{ severity: 'critical', message: `found ${leakedKey} leaked in code` }],
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[REDACTED]');
    expect(r.stdout).not.toContain(leakedKey);
  });

  it('257-01/AC-4: does NOT redact a plain local-absolute-path-shaped string (out of scope for redactSecrets)', async () => {
    active = await tempRepo({ initialized: true });
    const localPath = '/home/someone/.ssh/id_rsa';
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        securityAudit: [{ severity: 'medium', message: `found reference to ${localPath}` }],
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(localPath);
    expect(r.stdout).not.toContain('[REDACTED]');
  });
});

describe('cadence summary render - verifier rollup label precision (phase 264, T2)', () => {
  /** Base `evidenceTally` satisfying `AssuranceRecordZ` — every `AcEvidenceZ`
   *  key present, per its phase-233 exhaustive-record contract. */
  const EVIDENCE_TALLY = {
    'ai-verified': 0,
    executed: 1,
    assertion: 1,
    mention: 0,
    unverified: 0,
  };

  it('264-01/AC-1: renders an explicit (mixed) tag when matching mock gates disagree on providerSelection', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        schemaVersion: 2,
        gates: [
          { gate: 'code-review', status: 'ran', provider: 'mock', providerSelection: 'configured' },
          { gate: 'security-audit', status: 'ran', provider: 'mock', providerSelection: 'fallback' },
        ],
        assurance: {
          verifierRollup: [{ provider: 'mock', gateCount: 2 }],
          evidenceTally: EVIDENCE_TALLY,
          overall: 'mixed',
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('- verifier: mock (2 gate(s))');
    expect(r.stdout).toContain('(mixed)');
    expect(r.stdout).not.toContain('(configured)');
    expect(r.stdout).not.toContain('(fallback)');
  });

  it('264-01/AC-1: renders a (configured) tag -- distinct from the mixed case -- when every matching mock gate agrees', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        schemaVersion: 2,
        gates: [
          { gate: 'code-review', status: 'ran', provider: 'mock', providerSelection: 'configured' },
          { gate: 'security-audit', status: 'ran', provider: 'mock', providerSelection: 'configured' },
        ],
        assurance: {
          verifierRollup: [{ provider: 'mock', gateCount: 2 }],
          evidenceTally: EVIDENCE_TALLY,
          overall: 'weak',
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('(configured)');
    expect(r.stdout).not.toContain('(mixed)');
    expect(r.stdout).not.toContain('(fallback)');
  });

  it('264-01/AC-2: a pre-Phase-L record (verifierRollup populated, gates absent) renders no selection tag, matching pre-existing behavior plus the mock capability clause', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        // no `gates` override -- inherits VALID_SUMMARY.gates, which carries
        // no `provider`/`providerSelection` at all (a historical shape).
        assurance: {
          verifierRollup: [{ provider: 'mock', gateCount: 2 }],
          evidenceTally: EVIDENCE_TALLY,
          overall: 'weak',
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('- verifier: mock (2 gate(s))');
    expect(r.stdout).toContain(MOCK_VERIFIER_CAPABILITY.message);
    expect(r.stdout).not.toContain('(configured)');
    expect(r.stdout).not.toContain('(fallback)');
    expect(r.stdout).not.toContain('(empty-diff)');
    expect(r.stdout).not.toContain('(mixed)');
  });

  it('264-01/AC-2: a record with gates present but no providerSelection field on any entry renders no selection tag', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        schemaVersion: 2,
        gates: [
          { gate: 'code-review', status: 'ran', provider: 'anthropic', model: 'claude-x' },
        ],
        assurance: {
          verifierRollup: [{ provider: 'anthropic', model: 'claude-x', gateCount: 1 }],
          evidenceTally: EVIDENCE_TALLY,
          overall: 'strong',
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('- verifier: anthropic claude-x (1 gate(s))');
    expect(r.stdout).not.toMatch(/\(configured\)|\(fallback\)|\(empty-diff\)|\(mixed\)/);
  });

  it('264-01/AC-1: renders an (empty-diff) tag for a real (non-mock) provider gate tagged empty-diff, and omits the mock capability clause', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        schemaVersion: 2,
        gates: [
          {
            gate: 'code-review',
            status: 'ran',
            provider: 'anthropic',
            model: 'claude-x',
            providerSelection: 'empty-diff',
          },
        ],
        assurance: {
          verifierRollup: [{ provider: 'anthropic', model: 'claude-x', gateCount: 1 }],
          evidenceTally: EVIDENCE_TALLY,
          overall: 'strong',
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('- verifier: anthropic claude-x (1 gate(s))');
    expect(r.stdout).toContain('(empty-diff)');
    expect(r.stdout).not.toContain(MOCK_VERIFIER_CAPABILITY.message);
  });
});

describe('cadence summary render - mock-abstained review gates (phase 267, T3)', () => {
  const ABSTAIN_REASON =
    "code-review: mock-identified clean pass abstained — the mock provider is not real verification, recorded as skipped rather than a persisted pass";

  it('267-01/AC-3: an abstained mock code-review gate renders distinguishably from a real security-audit pass and from a plan-review gate absent entirely, and still surfaces in the Assurance verifier rollup', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        schemaVersion: 2,
        gates: [
          { gate: 'code-review', status: 'skipped', skipReason: ABSTAIN_REASON, provider: 'mock' },
          { gate: 'security-audit', status: 'ran', provider: 'anthropic', model: 'claude-x' },
          // plan-review deliberately absent -- total-absence comparison arm.
        ],
        assurance: {
          verifierRollup: [
            { provider: 'mock', gateCount: 1 },
            { provider: 'anthropic', model: 'claude-x', gateCount: 1 },
          ],
          evidenceTally: {
            'ai-verified': 0,
            executed: 1,
            assertion: 1,
            mention: 0,
            unverified: 0,
          },
          overall: 'mixed',
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);

    // Abstained: 'skipped', names the abstention reason -- never a bare pass.
    expect(r.stdout).toContain(`- code-review: skipped — ${ABSTAIN_REASON}`);
    expect(r.stdout).not.toContain('- code-review: ran');

    // Real pass: 'ran', untouched by abstention wording.
    expect(r.stdout).toContain('- security-audit: ran');
    expect(r.stdout).not.toMatch(/security-audit:.*abstain/i);

    // Total absence: no plan-review line anywhere.
    expect(r.stdout).not.toMatch(/plan-review:/);

    // Not silently dropped from the whole-run Assurance rollup either --
    // the abstained gate's mock identity still surfaces there.
    expect(r.stdout).toContain('## Assurance');
    expect(r.stdout).toContain('- verifier: mock (1 gate(s))');
    expect(r.stdout).toContain(MOCK_VERIFIER_CAPABILITY.message);
    expect(r.stdout).toContain('- verifier: anthropic claude-x (1 gate(s))');
  });
});

describe('cadence summary render - unobservable deep-verify marker (phase 274, T6)', () => {
  it('274-01/AC-1: renders an unobservable AC distinctly from a plain PASS and a plain FAIL line', async () => {
    active = await tempRepo({ initialized: true });
    const reason =
      "AC-7 self-references \"this phase's own SUMMARY\" — an artifact that does not exist until after this very settle produces it (no linked test coverage).";
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify({
        ...VALID_SUMMARY,
        acResults: [
          { id: 'AC-1', pass: true, evidence: 'executed' },
          { id: 'AC-2', pass: false, evidence: 'assertion', note: 'edge case missing' },
          { id: 'AC-7', pass: false, note: 'no linked task' },
        ],
        deepVerify: {
          'AC-7': { pass: false, reason, provider: 'mock', unobservable: true },
        },
      }),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);

    // The classifier's reason is carried through verbatim into stdout.
    expect(r.stdout).toContain(`  UNOBSERVABLE (deep-verify): ${reason}`);

    const ac1Line = r.stdout.split('\n').find((l) => l.startsWith('- AC-1:'));
    const ac2Line = r.stdout.split('\n').find((l) => l.startsWith('- AC-2:'));
    const ac7Line = r.stdout.split('\n').find((l) => l.startsWith('- AC-7:'));
    expect(ac1Line).toMatch(/^- AC-1: PASS/);
    expect(ac2Line).toMatch(/^- AC-2: FAIL/);
    expect(ac7Line).toMatch(/^- AC-7: FAIL/);

    // Neither the PASS nor the FAIL badge line carries the unobservable
    // marker -- it is exclusive to AC-7's sibling line.
    expect(r.stdout).not.toMatch(/AC-1:.*UNOBSERVABLE/);
    expect(r.stdout).not.toMatch(/AC-2:.*UNOBSERVABLE/);

    // The marker line itself is a genuinely third category -- not PASS, not
    // FAIL, reusing neither badge's wording.
    const unobservableLine = r.stdout.split('\n').find((l) => l.includes('UNOBSERVABLE'));
    expect(unobservableLine).toBeDefined();
    expect(unobservableLine).not.toMatch(/\bPASS\b/);
    expect(unobservableLine).not.toMatch(/\bFAIL\b/);
  });

  it('274-01/AC-1: omits the unobservable line when deepVerify is absent (back-compat)', async () => {
    active = await tempRepo({ initialized: true });
    await writeSummary(
      active.root,
      '77-team-rollout-kit',
      '77-01',
      JSON.stringify(VALID_SUMMARY),
    );

    const r = await run(['summary', 'render', '77-team-rollout-kit', '01'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('UNOBSERVABLE');
  });
});
