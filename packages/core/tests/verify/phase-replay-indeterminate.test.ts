/**
 * Phase 239 (T8) — AC-9: a settled phase whose SUMMARY.json records no
 * `coverageScheme` at all predates the scheme entirely (real example: phase
 * 233, on `feat/kernel-assurance-v2` — measured directly against that
 * branch, not merely cited — its SUMMARY records all five ACs
 * pass/executed while the pre-T8 bare/file-scoped replay reports 5 false
 * drifts under `assertion` mode, the mode `cadence verify phase` actually
 * runs under by default (`defaultConfig.verification.coverageMode` is
 * `'assertion'`, not this module's own `'mention'` fallback), because its
 * DRAFT under-declared the test files it actually wrote). Nothing in a
 * pre-239 artifact records which phase a test belongs to, so its coverage
 * evidence is not phase-attributable and no verdict can be substantiated.
 * This suite proves `replayPhaseCoverage` reports every such AC
 * `indeterminate` with `drift: false` instead of asserting a verdict it
 * cannot support, and that the human-readable `cadence verify phase`
 * output states the reason — never reusing "no drift" wording, and always
 * reaching stderr too (the degradation-notice fix), not just stdout.
 *
 * Also AC-8 (carried over from T7, see the DRAFT's T7 As built (3)): T7
 * added `PhaseReplayConfig.testGlobs` and proved it at the function level
 * (`phase-replay-qualified.test.ts`), but `services/verify.ts`'s
 * `runVerifyPhase` never read `config.verification.testGlobs` to pass it
 * through — so a real `cadence verify phase` run still took the engine's
 * `DEFAULT_GLOBS` branch for every consumer, regardless of configuration.
 * The service-level test below proves the wiring: a repo whose tests live
 * outside `packages/**`, with `verification.testGlobs` configured to match
 * them, must replay as covered through `runVerifyPhase` itself — not just
 * through a manually-supplied function argument.
 *
 * FIXTURE TOKEN HYGIENE (same rule as
 * tests/verify/phase-replay-qualified.test.ts and
 * tests/verify/coverage-explain-qualified.test.ts): this file covers AC-8
 * and AC-9, and this comment block deliberately never writes this repo's
 * qualifier prefix directly adjoining either bare AC id — the scanner
 * dedups per AC-id per file, first-occurrence-wins, so an early
 * comment-only occurrence of the contiguous qualified form would silently
 * outrank the real coverage below it and zero it out. The one contiguous
 * qualified literal for each AC sits inside an asserting `it()` title,
 * further down. Every fixture phase
 * replayed in this file uses a draft id other than this repo's own
 * (`233-01`, `250-01`, ...) and any qualified token written into fixture
 * source files is built by interpolation (`` `${id}/AC-1` ``), never as a
 * contiguous `239-01/AC-N` literal, so it can't collide with this repo's
 * own qualifier either.
 */
import { describe, it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo } from '@thomas-powers-jr/cadence-testkit';
import { replayPhaseCoverage } from '../../src/verify/phase-replay.js';
import { runVerifyPhase } from '../../src/services/verify.js';

interface AcResultFixture {
  id: string;
  pass: boolean;
  evidence?: 'ai-verified' | 'executed' | 'assertion' | 'mention' | 'unverified';
}

function draftBody(phase: string, id: string, filesLine: string, acCount: number): string {
  const acs = Array.from({ length: acCount }, (_, i) => {
    const n = i + 1;
    return `### AC-${n}: sample ac ${n}\nGiven a precondition\nWhen an action\nThen an outcome\n`;
  }).join('\n');
  return `---
phase: ${phase}
id: ${id}
tier: standard
status: PENDING
---

# ${id} — sample phase for phase-replay indeterminate tests

## Objective

Sample objective for a phase-replay indeterminate-scheme fixture.

## Acceptance Criteria

${acs}
## Tasks

### T1: sample task
- files: ${filesLine}
- action: sample action
- verify: sample verify
- done: AC-1

## Boundaries

- DO NOT widen scope
`;
}

function summaryBody(
  id: string,
  acResults: AcResultFixture[],
  coverageScheme?: 'bare' | 'phase-qualified',
): string {
  return JSON.stringify(
    {
      schemaVersion: 1,
      draftId: id,
      completedAt: '2026-07-20T00:00:00.000Z',
      acResults,
      taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
      decisions: [],
      deferred: [],
      skillAudit: { required: [], invoked: [] },
      ...(coverageScheme !== undefined ? { coverageScheme } : {}),
    },
    null,
    2,
  );
}

async function writeDraft(
  root: string,
  phase: string,
  id: string,
  filesLine: string,
  acCount = 1,
): Promise<void> {
  const dir = join(root, '.cadence', 'phases', phase);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}-DRAFT.md`), draftBody(phase, id, filesLine, acCount), 'utf8');
}

async function writeSummary(
  root: string,
  phase: string,
  id: string,
  acResults: AcResultFixture[],
  coverageScheme?: 'bare' | 'phase-qualified',
): Promise<void> {
  const dir = join(root, '.cadence', 'phases', phase);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${id}-SUMMARY.json`),
    summaryBody(id, acResults, coverageScheme),
    'utf8',
  );
}

async function writeSourceFile(root: string, relPath: string, content: string): Promise<void> {
  const abs = join(root, relPath);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

async function writeConfig(root: string, config: unknown): Promise<void> {
  await mkdir(join(root, '.cadence'), { recursive: true });
  await writeFile(join(root, '.cadence', 'config.json'), JSON.stringify(config, null, 2), 'utf8');
}

function makeIo() {
  const out: string[] = [];
  const err: string[] = [];
  return { out, err, io: { out: (s: string) => out.push(s), err: (s: string) => err.push(s) } };
}

describe('replayPhaseCoverage · pre-scheme SUMMARY (phase 239 T8, AC-9)', () => {
  it('239-01/AC-9: a SUMMARY recording no coverage scheme reports every AC indeterminate, never drift — equivalent to phase 233', async () => {
    const fx = await tempRepo();
    try {
      // Equivalent to real phase 233 (feat/kernel-assurance-v2, measured
      // directly): 5 ACs recorded pass/executed, a DRAFT that declares
      // files but none of them are the test file that would actually
      // satisfy the ACs — under the pre-T8 bare path this reports 5 false
      // drifts under `assertion` mode (the mode `cadence verify phase`
      // actually runs under by default). No `coverageScheme` field at all
      // in the SUMMARY.
      const phase = '233-sample';
      const id = '233-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`', 5);
      await writeSummary(
        fx.root,
        phase,
        id,
        Array.from({ length: 5 }, (_, i) => ({
          id: `AC-${i + 1}`,
          pass: true,
          evidence: 'executed' as const,
        })),
        // coverageScheme intentionally omitted — pre-239 SUMMARY.
      );
      await writeSourceFile(fx.root, 'src/example.ts', 'export const x = 1;\n');
      // No test file exists anywhere — under the old bare/file-scoped logic
      // this would report all 5 ACs as real drift.

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(0);
        expect(outcome.data.indeterminate).toBe(true);
        expect(outcome.data.note).toMatch(/not phase-attributable/i);
        expect(outcome.data.perAc).toHaveLength(5);
        for (const ac of outcome.data.perAc) {
          expect(ac.indeterminate).toBe(true);
          expect(ac.drift).toBe(false);
        }
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('reports indeterminate even when the DRAFT declares no task files at all — never a no-scoped-files refusal for a pre-scheme SUMMARY', async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      await writeDraft(fx.root, phase, id, '', 1);
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true, evidence: 'executed' }]);

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(0);
        expect(outcome.data.perAc[0]).toMatchObject({ id: 'AC-1', indeterminate: true, drift: false });
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('does not treat a pre-140 no-evidence AC any differently — still indeterminate, not drift', async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`', 1);
      // No `evidence` field recorded (pre-140), and no coverageScheme.
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true }]);

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.perAc[0]).toMatchObject({ id: 'AC-1', indeterminate: true, drift: false });
        expect(outcome.data.perAc[0]?.recordedEvidence).toBeUndefined();
      }
    } finally {
      await fx.cleanup();
    }
  });

  it("239-01/AC-9: cadence verify phase's human-readable output states pre-scheme coverage is not phase-attributable, never claims 'no drift', and exits 0", async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      await writeConfig(fx.root, {});
      await writeDraft(fx.root, phase, id, '`src/example.ts`', 1);
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true, evidence: 'executed' }]);
      await writeSourceFile(fx.root, 'src/example.ts', 'export const x = 1;\n');
      // No test file — under the pre-T8 bare path this would be real drift
      // and exit 1. Under T8 it must be indeterminate and exit 0.

      const { io, out, err } = makeIo();
      const res = await runVerifyPhase({ cwd: fx.root, phase, num: '01', testRun: false }, io);

      expect(res.exitCode).toBe(0);
      const rendered = out.join('');
      expect(rendered).toMatch(/not phase-attributable/i);
      expect(rendered).toMatch(/unverifiable/i);
      // The headline itself must never say "no drift" — that claims a
      // substantiated clean bill of health this replay cannot back. Pin the
      // exact NOT VERIFIED wording so a future edit can't silently regress
      // to reusing the "no drift" string for an indeterminate phase.
      expect(rendered).toContain(
        `${phase}/${id}: coverage NOT VERIFIED (SUMMARY records no coverage scheme)\n`,
      );
      expect(rendered).not.toMatch(/: no drift/);
      // The degradation notice must ALSO reach stderr — CLAUDE.md's "The
      // Quiet Fallback" — not just the human-readable stdout line, so a
      // consumer that only checks stderr for problems (or greps it) isn't
      // silently fooled either.
      const renderedErr = err.join('');
      expect(renderedErr).toMatch(/not phase-attributable/i);
      expect(renderedErr).toMatch(/unverifiable/i);
    } finally {
      await fx.cleanup();
    }
  });

  it('239-01/AC-9: under --json, the degradation notice reaches stderr even though stdout is pure JSON', async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      await writeConfig(fx.root, {});
      await writeDraft(fx.root, phase, id, '`src/example.ts`', 1);
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true, evidence: 'executed' }]);
      await writeSourceFile(fx.root, 'src/example.ts', 'export const x = 1;\n');
      // No test file — same pre-scheme/indeterminate fixture as above, but
      // exercised under --json, where before this fix stderr received ZERO
      // bytes and the only trace was a key inside stdout JSON — invisible
      // to a CI workflow or `jq` script that only checks stdout/exit code.

      const { io, out, err } = makeIo();
      const res = await runVerifyPhase(
        { cwd: fx.root, phase, num: '01', testRun: false, json: true },
        io,
      );

      expect(res.exitCode).toBe(0);
      // stdout stays the --json contract: parses clean, no prose mixed in.
      const parsed = JSON.parse(out.join(''));
      expect(parsed.results[0].indeterminate).toBe(true);
      // stderr must be non-empty and carry the same degradation notice.
      const renderedErr = err.join('');
      expect(renderedErr.length).toBeGreaterThan(0);
      expect(renderedErr).toMatch(/not phase-attributable/i);
      expect(renderedErr).toMatch(/unverifiable/i);
    } finally {
      await fx.cleanup();
    }
  });

  it('239-01/AC-9: the discriminator — absent coverageScheme is indeterminate, but the SAME fixture with coverageScheme explicitly "bare" takes the file-scoped path and computes a real drift verdict', async () => {
    const fx = await tempRepo();
    try {
      const phase = '260-sample';
      const id = '260-01';
      // Shared fixture: DRAFT declares a test file that is never written —
      // genuine lost coverage IF the bare file-scoped path actually runs.
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`', 1);
      await writeSourceFile(fx.root, 'src/example.ts', 'export const x = 1;\n');
      // src/example.test.ts intentionally never written.

      // (1) coverageScheme absent entirely — a pre-239 phase. Must be
      // indeterminate, never a computed drift verdict, regardless of the
      // real (missing) coverage on disk.
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true, evidence: 'executed' }]);
      const absent = await replayPhaseCoverage(fx.root, phase, id);
      expect(absent.ok).toBe(true);
      if (absent.ok) {
        expect(absent.data.indeterminate).toBe(true);
        expect(absent.data.driftCount).toBe(0);
        expect(absent.data.perAc[0]).toMatchObject({ id: 'AC-1', indeterminate: true, drift: false });
      }

      // (2) SAME fixture, only difference: coverageScheme explicitly
      // recorded as 'bare' — a post-239 phase that opted into the
      // unchanged file-scoped path (AC-1's "the bare scheme is unchanged").
      // This must NOT be indeterminate: it must actually scan and report
      // the real drift the missing test file causes.
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        'bare',
      );
      const bare = await replayPhaseCoverage(fx.root, phase, id);
      expect(bare.ok).toBe(true);
      if (bare.ok) {
        expect(bare.data.indeterminate).toBeUndefined();
        expect(bare.data.driftCount).toBe(1);
        expect(bare.data.perAc[0]).toMatchObject({
          id: 'AC-1',
          currentlyCovered: false,
          drift: true,
        });
        expect(bare.data.perAc[0]?.indeterminate).toBeUndefined();
      }
    } finally {
      await fx.cleanup();
    }
  });
});

describe('runVerifyPhase · testGlobs wiring (phase 239 T8, AC-8)', () => {
  it("239-01/AC-8: cadence verify phase reports ZERO drift for a qualified phase whose tests live outside packages/**, once verification.testGlobs is configured — it reports drift without this task's wiring", async () => {
    const fx = await tempRepo();
    try {
      const phase = '250-sample';
      const id = '250-01';
      await writeConfig(fx.root, {
        verification: { testGlobs: ['src/**/*.spec.ts'] },
      });
      await writeDraft(fx.root, phase, id, '', 1);
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        'phase-qualified',
      );
      // Lives outside packages/**, which the engine's DEFAULT_GLOBS never
      // match — this file is only found if `runVerifyPhase` actually reads
      // `config.verification.testGlobs` and threads it through to
      // `replayPhaseCoverage`. Before this task's wiring, this test fails:
      // the call site passed no `testGlobs` at all, so the qualified branch
      // fell back to `DEFAULT_GLOBS` (`packages/**/*.test.ts{,x}`) and
      // reported the AC as drifted regardless of the configured globs.
      // A real `expect(...)` is required in the body: `runVerifyPhase`
      // resolves `coverageMode` from the real loaded config, whose
      // `defaultConfig` baseline (`packages/types/src/config.ts`) is
      // `'assertion'`, not `'mention'` — an empty `it()` callback would be
      // filtered as non-qualifying and mask the very thing this test proves.
      await writeSourceFile(
        fx.root,
        'src/foo.spec.ts',
        `import { it, expect } from 'vitest';\nit('covers ${id}/AC-1', () => { expect(1).toBe(1); });\n`,
      );

      const { io } = makeIo();
      const res = await runVerifyPhase({ cwd: fx.root, phase, num: '01', testRun: false }, io);

      expect(res.exitCode).toBe(0);
      const payload = res.data as { results: { driftCount: number }[] };
      expect(payload.results[0]?.driftCount).toBe(0);
    } finally {
      await fx.cleanup();
    }
  });
});
