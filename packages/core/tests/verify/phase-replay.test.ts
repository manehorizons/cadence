import { describe, it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo } from '@thomas-powers-jr/cadence-testkit';
import { replayPhaseCoverage } from '../../src/verify/phase-replay.js';

// AC-1: replayPhaseCoverage re-derives per-AC drift from committed DRAFT.md +
//   SUMMARY.json alone (no state.json), scoped to the DRAFT's own declared
//   task files (never a whole-repo scan) — covers no-drift, drift, the
//   pre-140 no-evidence case, and the cross-phase AC-token-collision guard.
// AC-4: all malformed/missing-input outcomes are refused with a specific
//   `kind`, never a crash or a silent whole-repo fallback.

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

# ${id} — sample phase for phase-replay tests

## Objective

Sample objective for a phase-replay fixture.

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
  schemaVersion: number = 1,
): string {
  return JSON.stringify(
    {
      schemaVersion,
      draftId: id,
      completedAt: '2026-07-20T00:00:00.000Z',
      acResults,
      taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
      decisions: [],
      deferred: [],
      skillAudit: { required: [], invoked: [] },
      // Phase 239 T8: this file's fixtures represent a phase that settled
      // under the (explicit) bare scheme, exercising the unchanged
      // file-scoped replay path — NOT a pre-239 phase with no scheme
      // recorded at all. `coverageScheme` absent entirely is a DIFFERENT,
      // deliberately distinct case (`indeterminate`, see
      // phase-replay-indeterminate.test.ts) that must never take this
      // file's drift-computing path. Do not remove this field to "simplify"
      // the fixture — every assertion below depends on the bare branch
      // actually running.
      coverageScheme: 'bare',
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
  schemaVersion: number = 1,
): Promise<void> {
  const dir = join(root, '.cadence', 'phases', phase);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, `${id}-SUMMARY.json`),
    summaryBody(id, acResults, schemaVersion),
    'utf8',
  );
}

async function writeSourceFile(root: string, relPath: string, content: string): Promise<void> {
  const abs = join(root, relPath);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

describe('replayPhaseCoverage', () => {
  it('reports no drift when the recorded AC still has real coverage', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`');
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true, evidence: 'executed' }]);
      await writeSourceFile(fx.root, 'src/example.ts', 'export const x = 1;\n');
      await writeSourceFile(
        fx.root,
        'src/example.test.ts',
        "import { it } from 'vitest';\nit('covers AC-1', () => {});\n",
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(0);
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('reports drift when the recorded-executed AC lost its linked test', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`');
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true, evidence: 'executed' }]);
      await writeSourceFile(fx.root, 'src/example.ts', 'export const x = 1;\n');
      // src/example.test.ts is never written — the linked test is gone.

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(1);
        expect(outcome.data.perAc[0]).toMatchObject({
          id: 'AC-1',
          drift: true,
          currentlyCovered: false,
        });
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('does not report drift for an AC with no evidence tag (pre-140 record)', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`');
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true }]);
      await writeSourceFile(fx.root, 'src/example.ts', 'export const x = 1;\n');
      // No test file written, and no `evidence` field recorded.

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.perAc[0]?.drift).toBe(false);
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('does not false-negative when a DIFFERENT phase has a colliding AC-1 test elsewhere in the repo', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      // Both the phase's own files AND the colliding file live under
      // `packages/` so they'd actually match `scanTestCoverage`'s
      // `DEFAULT_GLOBS` (`packages/**/*.test.ts`) if the `globs: taskFiles`
      // scoping were ever regressed away. Fixtures rooted under `src/` (as
      // this test used to be) never match DEFAULT_GLOBS either way, so an
      // unscoped fallback scan would coincidentally match zero files and
      // this test would pass regardless of whether scoping actually works —
      // it would not be a real regression guard. Rooting everything under
      // `packages/` is what makes it one.
      await writeDraft(
        fx.root,
        phase,
        id,
        '`packages/fake-pkg/src/example.ts`, `packages/fake-pkg/src/example.test.ts`',
      );
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true, evidence: 'executed' }]);
      await writeSourceFile(fx.root, 'packages/fake-pkg/src/example.ts', 'export const x = 1;\n');
      // Phase 200's own AC-1 test is deleted — real drift.
      // A DIFFERENT phase's test, also under `packages/`, mentions AC-1; it
      // is the only file in the fixture that does. It must NOT mask the real
      // drift because the scan is scoped to this phase's own declared task
      // files, not a whole-repo scan.
      await writeSourceFile(
        fx.root,
        'packages/other-fake-pkg/unrelated.test.ts',
        "import { it } from 'vitest';\nit('covers AC-1', () => {});\n",
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(1);
        expect(outcome.data.perAc[0]).toMatchObject({
          id: 'AC-1',
          drift: true,
          currentlyCovered: false,
        });
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('returns summary-missing when SUMMARY.json is absent', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`');
      // No SUMMARY.json written.

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.kind).toBe('summary-missing');
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('returns summary-malformed on invalid JSON', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`');
      const dir = join(fx.root, '.cadence', 'phases', phase);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${id}-SUMMARY.json`), '{not json', 'utf8');

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.kind).toBe('summary-malformed');
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('returns summary-invalid on schema-violating JSON', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`');
      const dir = join(fx.root, '.cadence', 'phases', phase);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${id}-SUMMARY.json`), JSON.stringify({ nope: true }), 'utf8');

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.kind).toBe('summary-invalid');
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('returns summary-newer-version (not summary-invalid) for an unrecognized higher schemaVersion (AC-4)', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        3,
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        // AC-4: a distinct kind — a newer Cadence wrote this file, not a
        // schema violation — and the message says so, not a generic Zod dump.
        expect(outcome.kind).toBe('summary-newer-version');
        expect(outcome.message).toMatch(/newer version of Cadence/i);
        expect(outcome.message).toMatch(/schemaVersion 3/);
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('still replays a schemaVersion: 1 SUMMARY normally (regression, AC-3)', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        1,
      );
      await writeSourceFile(fx.root, 'src/example.ts', 'export const x = 1;\n');
      await writeSourceFile(
        fx.root,
        'src/example.test.ts',
        "import { it } from 'vitest';\nit('covers AC-1', () => {});\n",
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(0);
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('still replays a schemaVersion: 2 SUMMARY normally (AC-3)', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`');
      await writeSummary(
        fx.root,
        phase,
        id,
        [{ id: 'AC-1', pass: true, evidence: 'executed' }],
        2,
      );
      await writeSourceFile(fx.root, 'src/example.ts', 'export const x = 1;\n');
      await writeSourceFile(
        fx.root,
        'src/example.test.ts',
        "import { it } from 'vitest';\nit('covers AC-1', () => {});\n",
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.driftCount).toBe(0);
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('returns draft-missing when DRAFT.md is absent', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      // No DRAFT.md written at all.

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.kind).toBe('draft-missing');
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('returns no-scoped-files rather than a whole-repo scan when the DRAFT declares no task files', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '');
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true, evidence: 'executed' }]);

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.kind).toBe('no-scoped-files');
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('does not count a skip-dodged reference as coverage in assertion mode', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      await writeDraft(fx.root, phase, id, '`src/example.ts`, `src/example.test.ts`');
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true, evidence: 'executed' }]);
      await writeSourceFile(fx.root, 'src/example.ts', 'export const x = 1;\n');
      // AC-1's only reference sits inside an `it.skip(...)` block — a test
      // that never actually runs its assertion. Assertion mode must not
      // treat this as real coverage (the "skip dodge", phase 169).
      await writeSourceFile(
        fx.root,
        'src/example.test.ts',
        "import { it } from 'vitest';\nit.skip('covers AC-1', () => { expect(1).toBe(1); });\n",
      );

      const outcome = await replayPhaseCoverage(fx.root, phase, id, { coverageMode: 'assertion' });
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.data.perAc[0]).toMatchObject({
          id: 'AC-1',
          currentlyCovered: false,
        });
      }
    } finally {
      await fx.cleanup();
    }
  });

  it('returns draft-unparseable when DRAFT.md exists but has no frontmatter block', async () => {
    const fx = await tempRepo();
    try {
      const phase = '200-sample';
      const id = '200-01';
      const dir = join(fx.root, '.cadence', 'phases', phase);
      await mkdir(dir, { recursive: true });
      // Exists, but missing the required `---\n...\n---\n` frontmatter block
      // that `parseDraftMd` requires — distinct from draft-missing, where
      // the file itself is absent.
      await writeFile(
        join(dir, `${id}-DRAFT.md`),
        '# not a real draft\n\nno frontmatter here at all.\n',
        'utf8',
      );
      await writeSummary(fx.root, phase, id, [{ id: 'AC-1', pass: true, evidence: 'executed' }]);

      const outcome = await replayPhaseCoverage(fx.root, phase, id);
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.kind).toBe('draft-unparseable');
      }
    } finally {
      await fx.cleanup();
    }
  });
});
