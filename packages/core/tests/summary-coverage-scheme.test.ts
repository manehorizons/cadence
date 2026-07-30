import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { SummaryZ } from '@manehorizons/cadence-types';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { computeSummaryContentHash } from '../src/services/summary-hash.js';

// Phase 239 (T6, AC-7): SUMMARY.json records the coverage scheme and mode in
// force at settle, and — the half that makes that record honest — the
// evidence in that same SUMMARY is derived under the SAME scheme. Recording
// `coverageScheme: 'phase-qualified'` while deriving per-AC evidence from a
// bare, unqualified scan would make the artifact contradict itself and
// contradict the gate that just ran.

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'dist',
  'cli',
  'index.js',
);

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

/** A minimal, valid pre-phase-239 SUMMARY — carries neither new field. */
function legacySummary(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    draftId: '01-01',
    completedAt: '2026-01-01T00:00:00.000Z',
    acResults: [{ id: 'AC-1', pass: true }],
    taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
    decisions: [],
    deferred: [],
    skillAudit: { required: [], invoked: [] },
  };
}

async function setConfig(root: string, patch: Record<string, unknown>): Promise<void> {
  const p = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(p, 'utf8')) as Record<string, unknown>;
  const merged = { ...cfg, ...patch };
  await writeFile(p, JSON.stringify(merged, null, 2), 'utf8');
}

/** Relax the evidence floor so fixtures probing evidence *strength* aren't
 *  refused by the floor gate before evidence can be inspected. */
async function relaxEvidenceFloor(root: string): Promise<void> {
  const p = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(p, 'utf8')) as Record<string, unknown>;
  cfg['gates'] = { ...(cfg['gates'] as Record<string, unknown>), evidenceFloor: 'unverified' };
  await writeFile(p, JSON.stringify(cfg, null, 2), 'utf8');
}

async function seedTest(root: string, rel: string, body: string): Promise<void> {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

describe('SUMMARY coverage-scheme provenance · schema (phase 239 T6)', () => {
  it('239-01/AC-7: a pre-phase-239 SUMMARY still parses, and neither field is injected', () => {
    const parsed = SummaryZ.parse(legacySummary());
    expect(parsed.schemaVersion).toBe(1);
    // Absent must stay ABSENT, not become `undefined` via a Zod default.
    expect(Object.hasOwn(parsed, 'coverageScheme')).toBe(false);
    expect(Object.hasOwn(parsed, 'coverageMode')).toBe(false);
  });

  it("239-01/AC-7: a legacy SUMMARY's contentHash still verifies after a schema round-trip", () => {
    // THE HAZARD THIS GUARDS: `cadence summary verify` Zod-parses the file and
    // then hashes the PARSED object. If either new field carried a Zod
    // `.default(...)`, parsing would inject it into every historical SUMMARY,
    // changing the digest and reporting every past settle as tampered. This
    // test fails the moment someone adds a default.
    const legacy = legacySummary();
    const hash = computeSummaryContentHash(legacy as never);
    const withHash = { ...legacy, contentHash: hash };

    const roundTripped = SummaryZ.parse(withHash);
    const recomputed = computeSummaryContentHash(roundTripped);

    expect(recomputed.value).toBe(hash.value);
  });

  it('239-01/AC-7: a SUMMARY carrying both fields parses and preserves them', () => {
    const parsed = SummaryZ.parse({
      ...legacySummary(),
      coverageScheme: 'phase-qualified',
      coverageMode: 'assertion',
    });
    expect(parsed.coverageScheme).toBe('phase-qualified');
    expect(parsed.coverageMode).toBe('assertion');
  });

  it('239-01/AC-7: an unknown coverageScheme value is rejected', () => {
    const bad = { ...legacySummary(), coverageScheme: 'strict' };
    expect(SummaryZ.safeParse(bad).success).toBe(false);
  });
});

describe('SUMMARY coverage-scheme provenance · settle records it (phase 239 T6)', () => {
  it('239-01/AC-7: a settle under the bare scheme records bare + the mode', async () => {
    active = await tempRepo({ initialized: true });
    await setConfig(active.root, {
      verification: { coverageScheme: 'bare', coverageMode: 'assertion', testGlobs: ['**/*.test.ts'] },
    });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedTest(
      active.root,
      'a.test.ts',
      `it('AC-1 fixture', () => { expect(true).toBe(true); });\n`,
    );

    const r = await run(['settle', 'run', '--auto'], active.root);
    expect(r.code).toBe(0);

    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(summary['coverageScheme']).toBe('bare');
    expect(summary['coverageMode']).toBe('assertion');
  });

  it('239-01/AC-7: a settle under the qualified scheme records phase-qualified', async () => {
    active = await tempRepo({ initialized: true });
    await setConfig(active.root, {
      verification: {
        coverageScheme: 'phase-qualified',
        coverageMode: 'assertion',
        testGlobs: ['**/*.test.ts'],
      },
    });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    // Qualified token for THIS fixture's draft id (01-01). Built by
    // concatenation because this file is itself matched by the repo's default
    // test globs: a contiguous `<id>/AC-N` literal sitting in real source
    // would be scannable evidence in this repo's own coverage runs. The token
    // is 01-01's, not this phase's, so it could never credit 239-01 — the
    // concatenation is about not planting stray qualified-looking literals at
    // all, which is the same hygiene rule the other 239 test files follow.
    const tok = '01-01' + '/' + 'AC-1';
    await seedTest(
      active.root,
      'a.test.ts',
      `it('${tok} fixture', () => { expect(true).toBe(true); });\n`,
    );

    const r = await run(['settle', 'run', '--auto'], active.root);
    expect(r.code).toBe(0);

    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(summary['coverageScheme']).toBe('phase-qualified');
  });

  it('239-01/AC-7: a REFUSED settle records the scheme too', async () => {
    // A refused settle also writes a SUMMARY (phase 170), and the scheme is
    // exactly the context needed to interpret why a coverage gate refused.
    active = await tempRepo({ initialized: true });
    await setConfig(active.root, {
      verification: {
        coverageScheme: 'phase-qualified',
        coverageMode: 'assertion',
        testGlobs: ['**/*.test.ts'],
      },
    });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    // Bare token under the qualified scheme → the gate refuses.
    await seedTest(
      active.root,
      'a.test.ts',
      `it('AC-1 bare only', () => { expect(true).toBe(true); });\n`,
    );

    const r = await run(['settle', 'run', '--auto'], active.root);
    expect(r.code).toBe(1);

    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(summary['coverageScheme']).toBe('phase-qualified');
    expect(summary['coverageMode']).toBe('assertion');
  });
});

describe('SUMMARY evidence is derived under the recorded scheme (phase 239 T6)', () => {
  it('239-01/AC-7: under phase-qualified, a bare-only reference yields unverified evidence', async () => {
    // Without the rewiring this is the headline defect: the gate refuses (or
    // is bypassed) on qualified matching while evidence is credited from a
    // bare scan, so the SUMMARY would claim 'assertion' evidence for an AC
    // the scheme says has none.
    active = await tempRepo({ initialized: true });
    await setConfig(active.root, {
      verification: {
        coverageScheme: 'phase-qualified',
        coverageMode: 'assertion',
        testGlobs: ['**/*.test.ts'],
      },
    });
    await relaxEvidenceFloor(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedTest(
      active.root,
      'a.test.ts',
      `it('AC-1 bare only', () => { expect(true).toBe(true); });\n`,
    );

    // The gate itself would refuse (bare token, qualified scheme); bypass it
    // so evidence derivation is what's under test here, not the gate.
    const r = await run(
      ['settle', 'run', '--auto', '--allow-missing-coverage'],
      active.root,
    );
    expect(r.code).toBe(0);

    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    ) as { acResults: Array<{ id: string; evidence?: string }> };
    const ac1 = summary.acResults.find((a) => a.id === 'AC-1');
    expect(ac1?.evidence).toBe('unverified');
  });

  it('239-01/AC-7: an EXPLICIT AC also derives evidence under the qualified scheme', async () => {
    // Explicit ACs are filtered out of the gate's `required` list, so they are
    // never qualifier-checked by the gate at all. That makes evidence
    // derivation the ONLY thing standing between an explicit AC and a
    // cross-phase bare-token collision crediting it.
    active = await tempRepo({ initialized: true });
    await setConfig(active.root, {
      verification: {
        coverageScheme: 'phase-qualified',
        coverageMode: 'assertion',
        testGlobs: ['**/*.test.ts'],
      },
    });
    await relaxEvidenceFloor(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedTest(
      active.root,
      'a.test.ts',
      `it('AC-1 bare only', () => { expect(true).toBe(true); });\n`,
    );

    const r = await run(
      ['settle', 'run', '--auto', '--ac', 'AC-1=pass:manual'],
      active.root,
    );
    expect(r.code).toBe(0);

    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    ) as { acResults: Array<{ id: string; evidence?: string }> };
    const ac1 = summary.acResults.find((a) => a.id === 'AC-1');
    expect(ac1?.evidence).toBe('unverified');
  });

  it('239-01/AC-7: the deep-verify gate also sees the qualified map, not a bare one', async () => {
    // Making the shared ctx.coverage() thunk scheme-aware changes what
    // `gates/deep-verify.ts` feeds the verifier as VerifyInput.tests. That is
    // NOT cosmetic: MockVerifier auto-fails any AC with zero linked tests
    // ('no linked test found'). So under the qualified scheme, an AC whose
    // only reference is a cross-phase bare token must now FAIL deep-verify —
    // where before T6 it would have been passed on the strength of that
    // foreign token. This is the same defect class as the evidence fix, and
    // without this test the behavior change would ship unproven.
    active = await tempRepo({ initialized: true });
    await setConfig(active.root, {
      verification: {
        coverageScheme: 'phase-qualified',
        coverageMode: 'assertion',
        testGlobs: ['**/*.test.ts'],
      },
    });
    await relaxEvidenceFloor(active.root);
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedTest(
      active.root,
      'a.test.ts',
      `it('AC-1 bare only', () => { expect(true).toBe(true); });\n`,
    );

    const r = await run(
      ['settle', 'run', '--auto', '--deep', '--allow-missing-coverage'],
      active.root,
    );

    // The verifier rejecting AC-1 makes the deep-verify gate refuse the whole
    // settle, so what lands is the minimal refused SUMMARY (no `deepVerify`
    // map) — the outcome is asserted through the exit code, the verifier's own
    // stderr line, and the gate provenance instead.
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('deep-verify: AC-1 failed — no linked test found');

    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    ) as { gates: Array<{ gate: string; status: string }>; coverageScheme?: string };
    expect(summary.gates[summary.gates.length - 1]).toMatchObject({
      gate: 'deep-verify',
      status: 'refused',
    });
    expect(summary.coverageScheme).toBe('phase-qualified');
  });

  it('239-01/AC-7: under the bare scheme deep-verify still sees the bare match', async () => {
    // Control for the test above: identical fixture, bare scheme, the mock
    // verifier still finds the linked test and passes. Proves the change
    // above is scheme-driven and not a blanket deep-verify regression.
    active = await tempRepo({ initialized: true });
    await setConfig(active.root, {
      verification: { coverageScheme: 'bare', coverageMode: 'assertion', testGlobs: ['**/*.test.ts'] },
    });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedTest(
      active.root,
      'a.test.ts',
      `it('AC-1 bare only', () => { expect(true).toBe(true); });\n`,
    );

    await run(['settle', 'run', '--auto', '--deep'], active.root);

    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    ) as { deepVerify?: Record<string, { pass: boolean }> };
    expect(summary.deepVerify?.['AC-1']?.pass).toBe(true);
  });

  it('239-01/AC-7: under the bare scheme the same fixture still credits assertion evidence', async () => {
    // Back-compat control for the two tests above: identical fixture, bare
    // scheme, evidence must be unchanged from historical behavior.
    active = await tempRepo({ initialized: true });
    await setConfig(active.root, {
      verification: { coverageScheme: 'bare', coverageMode: 'assertion', testGlobs: ['**/*.test.ts'] },
    });
    await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], active.root);
    await run(['draft', 'approve', '01-foundation', '01'], active.root);
    await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    await seedTest(
      active.root,
      'a.test.ts',
      `it('AC-1 bare only', () => { expect(true).toBe(true); });\n`,
    );

    const r = await run(['settle', 'run', '--auto'], active.root);
    expect(r.code).toBe(0);

    const summary = JSON.parse(
      await readFile(
        join(active.root, '.cadence/phases/01-foundation/01-01-SUMMARY.json'),
        'utf8',
      ),
    ) as { acResults: Array<{ id: string; evidence?: string }> };
    expect(summary.acResults.find((a) => a.id === 'AC-1')?.evidence).toBe('assertion');
  });
});
