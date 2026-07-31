import { describe, it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo } from '@manehorizons/cadence-testkit';
import { replayPhaseCoverage } from '../../src/verify/phase-replay.js';

// Phase 239 (T7): AC-8 — a settled phase whose SUMMARY records
// `coverageScheme: "phase-qualified"` must replay repo-wide, matched by its
// own qualified token, and must NEVER scope to `draft.tasks[].files` or
// return `no-scoped-files`. This is the fix for `replayPhaseCoverage`'s
// over-refusal: file-scoped replay under-declares constantly (phase 233, on
// `feat/kernel-assurance-v2` — measured directly against that branch —
// reports 5 false drifts under `assertion` mode, which is the mode
// `cadence verify phase` actually runs under by default
// (`defaultConfig.verification.coverageMode` is `'assertion'`, not
// `mention`), against a SUMMARY that recorded all five as pass/executed,
// because DRAFT.md's `files:` lines are chronically incomplete). The
// qualifier makes the token itself globally unique, so scoping is no
// longer needed to avoid cross-phase AC-N collisions.
//
// FIXTURE TOKEN HYGIENE (same rule as tests/verify/coverage-explain-qualified.test.ts):
// this file covers AC-8 only, and this comment block itself must not carry
// a contiguous qualified token for it — the scanner dedups per AC-id per
// file, first-occurrence-wins, so an early comment-only occurrence would
// silently outrank the real coverage below it and zero it out. The one
// contiguous qualified AC-8 literal in this file sits inside an asserting
// `it()` title, further down, where it belongs. Every fixture phase
// replayed in this file uses a draft id OTHER than this repo's own
// (`233-01`, `211-01`, ...) so none of the qualified tokens written into
// fixture source files are this repo's own qualifier — no concatenation
// trick is needed for them.

interface AcResultFixture {
  id: string;
  pass: boolean;
  evidence?: 'ai-verified' | 'executed' | 'assertion' | 'mention' | 'unverified';
}

function draftBody(phase: string, id: string, filesLine: string): string {
  return `---
phase: ${phase}
id: ${id}
tier: standard
status: PENDING
---

# ${id} — sample phase for phase-replay qualified-scheme tests

## Objective

Sample objective for a phase-replay qualified-scheme fixture.

## Acceptance Criteria

### AC-1: sample ac
Given a precondition
When an action
Then an outcome

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
  coverageScheme: 'bare' | 'phase-qualified',
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
      coverageScheme,
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
): Promise<void> {
  const dir = join(root, '.cadence', 'phases', phase);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${id}-DRAFT.md`), draftBody(phase, id, filesLine), 'utf8');
}

async function writeSummary(
  root: string,
  phase: string,
  id: string,
  acResults: AcResultFixture[],
  coverageScheme: 'bare' | 'phase-qualified',
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

describe('replayPhaseCoverage · phase-qualified scheme (phase 239 T7)', () => {
  it('239-01/AC-8: replays as covered from a repo-wide qualified match even when the DRAFT declares no task files', async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      // The DRAFT under-declares — empty files line, exactly the pattern
      // that produced the pre-fix `no-scoped-files` refusal / false drift.
      await writeDraft(fx.root, phase, id, '');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        'phase-qualified',
      );
      // The real test lives somewhere the DRAFT never named.
      await writeSourceFile(
        fx.root,
        'packages/elsewhere/src/undeclared.test.ts',
        `import { it } from 'vitest';\nit('covers ${id}/AC-1', () => {});\n`,
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(0);
        expect(outcome.data.perAc[0]).toMatchObject({
          id: 'AC-1',
          currentlyCovered: true,
          drift: false,
        });
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('239-01/AC-8: never returns no-scoped-files under the qualified scheme, regardless of declared task files', async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      await writeDraft(fx.root, phase, id, '');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        'phase-qualified',
      );
      // No source file written at all — coverage should come back as real
      // drift (uncovered), never as the `no-scoped-files` refusal kind.

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(1);
        expect(outcome.data.perAc[0]).toMatchObject({
          id: 'AC-1',
          currentlyCovered: false,
          drift: true,
        });
      }
    } finally {
      await fx.cleanup();
    }
  });

  it("239-01/AC-8: ignores the DRAFT's declared task files entirely and still matches a file outside them", async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      // The DRAFT points at a file that does NOT contain the real test —
      // proof the qualified path never consults `draft.tasks[].files` for
      // scoping (unlike the bare path, which would scope the scan to only
      // this file and find nothing).
      await writeDraft(fx.root, phase, id, '`packages/decoy/src/decoy.ts`');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        'phase-qualified',
      );
      await writeSourceFile(fx.root, 'packages/decoy/src/decoy.ts', 'export const x = 1;\n');
      await writeSourceFile(
        fx.root,
        'packages/real/src/actual.test.ts',
        `import { it } from 'vitest';\nit('covers ${id}/AC-1', () => {});\n`,
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(0);
        expect(outcome.data.perAc[0]?.currentlyCovered).toBe(true);
      }
    } finally {
      await fx.cleanup();
    }
  });

  it("239-01/AC-8: a DIFFERENT phase's identically-numbered AC token never satisfies this phase's replay", async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      const foreignId = '211-01';
      await writeDraft(fx.root, phase, id, '');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        'phase-qualified',
      );
      // Only a foreign phase's own qualified AC-1 token exists in the repo.
      await writeSourceFile(
        fx.root,
        'packages/foreign/src/foreign.test.ts',
        `import { it } from 'vitest';\nit('covers ${foreignId}/AC-1', () => {});\n`,
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(1);
        expect(outcome.data.perAc[0]).toMatchObject({
          id: 'AC-1',
          currentlyCovered: false,
          drift: true,
        });
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('239-01/AC-8: with config.testGlobs set, a qualified test file OUTSIDE packages/ is found and counts as covered', async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      await writeDraft(fx.root, phase, id, '');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        'phase-qualified',
      );
      // Outside packages/**, which the engine's DEFAULT_GLOBS never match —
      // proof this test would fail without FIX 1's testGlobs wiring.
      await writeSourceFile(
        fx.root,
        'src/foo.spec.ts',
        `import { it } from 'vitest';\nit('covers ${id}/AC-1', () => {});\n`,
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id, {
        testGlobs: ['src/**/*.spec.ts'],
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(0);
        expect(outcome.data.perAc[0]).toMatchObject({
          id: 'AC-1',
          currentlyCovered: true,
          drift: false,
        });
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('239-01/AC-8: with config.testGlobs ABSENT, a file outside packages/ is not found — engine defaults still used', async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      await writeDraft(fx.root, phase, id, '');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        'phase-qualified',
      );
      // Same fixture shape as the previous test, minus `testGlobs` — this
      // must NOT be found, proving the config-absent path still falls back
      // to the engine's default globs rather than silently widening to
      // match everything.
      await writeSourceFile(
        fx.root,
        'src/foo.spec.ts',
        `import { it } from 'vitest';\nit('covers ${id}/AC-1', () => {});\n`,
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(1);
        expect(outcome.data.perAc[0]).toMatchObject({
          id: 'AC-1',
          currentlyCovered: false,
          drift: true,
        });
      }
    } finally {
      await fx.cleanup();
    }
  });

  it("239-01/AC-8: config.testGlobs REPLACES the engine defaults rather than adding to them — a packages/**/*.test.ts file is not credited when testGlobs points elsewhere", async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      await writeDraft(fx.root, phase, id, '');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        'phase-qualified',
      );
      // This file matches DEFAULT_GLOBS (`packages/**/*.test.ts`) but NOT
      // the configured `testGlobs` below. A mutant that unions
      // `[...DEFAULT_GLOBS, ...(config.testGlobs ?? [])]` instead of
      // replacing DEFAULT_GLOBS with `config.testGlobs` when set would
      // still find this file and wrongly credit the AC — reintroducing
      // gate/replay divergence the qualifier was meant to close.
      await writeSourceFile(
        fx.root,
        'packages/legacy/old.test.ts',
        `import { it } from 'vitest';\nit('covers ${id}/AC-1', () => {});\n`,
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id, {
        testGlobs: ['src/**/*.spec.ts'],
      });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(1);
        expect(outcome.data.perAc[0]).toMatchObject({
          id: 'AC-1',
          currentlyCovered: false,
          drift: true,
        });
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('239-01/AC-8: a bare (unqualified) token in the repo does not satisfy a qualified-scheme replay', async () => {
    const fx = await tempRepo();
    try {
      const phase = '233-sample';
      const id = '233-01';
      await writeDraft(fx.root, phase, id, '');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        'phase-qualified',
      );
      await writeSourceFile(
        fx.root,
        'packages/bare/src/bare.test.ts',
        "import { it } from 'vitest';\nit('covers AC-1', () => {});\n",
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(1);
        expect(outcome.data.perAc[0]?.currentlyCovered).toBe(false);
      }
    } finally {
      await fx.cleanup();
    }
  });
});
