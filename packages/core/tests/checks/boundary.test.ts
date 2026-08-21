import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  runBoundaryCheck,
  boundaryMessage,
  findUnmatchedBoundaryPatterns,
} from '../../src/checks/boundary.js';
import { AnomalyTypeZ } from '@thomas-powers-jr/cadence-types';

const PKG = join(__dirname, '..', '..', 'package.json');

const FIXED = '2026-05-30T00:00:00.000Z';
const stampFixed = () => FIXED;

describe('runBoundaryCheck (Phase 43.1)', () => {
  it('emits one warn files-outside-boundary event per non-declared file', () => {
    const events = runBoundaryCheck({
      declaredFiles: ['a.ts', 'b.ts'],
      touchedFiles: ['a.ts', 'stray.ts', 'other.ts'],
      stamp: stampFixed,
    });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.type)).toEqual([
      'files-outside-boundary',
      'files-outside-boundary',
    ]);
    expect(events[0]).toEqual({
      type: 'files-outside-boundary',
      severity: 'warn',
      message: "stray.ts touched but not declared in any task's files:",
      context: { file: 'stray.ts' },
      ts: FIXED,
    });
    expect(events[1]!.context).toEqual({ file: 'other.ts' });
  });

  it('emits nothing when every touched file is declared', () => {
    expect(
      runBoundaryCheck({
        declaredFiles: ['a.ts', 'b.ts'],
        touchedFiles: ['a.ts', 'b.ts'],
        stamp: stampFixed,
      }),
    ).toEqual([]);
  });

  it('iterates the caller-supplied order and does NOT dedup (hook path keeps raw order + dups)', () => {
    const events = runBoundaryCheck({
      declaredFiles: ['a.ts'],
      touchedFiles: ['z.ts', 'z.ts', 'a.ts'],
      stamp: stampFixed,
    });
    expect(events.map((e) => e.context.file)).toEqual(['z.ts', 'z.ts']);
  });

  it('respects a deduped Set input (settle path), preserving first-seen order', () => {
    const events = runBoundaryCheck({
      declaredFiles: new Set(['a.ts', 'b.ts']),
      touchedFiles: new Set(['a.ts', 'stray.ts', 'b.ts', 'extra.ts']),
      stamp: stampFixed,
    });
    expect(events.map((e) => e.context.file)).toEqual(['stray.ts', 'extra.ts']);
  });

  it('merges extraContext after the file key (hook source marker)', () => {
    const events = runBoundaryCheck({
      declaredFiles: [],
      touchedFiles: ['x.ts'],
      stamp: stampFixed,
      extraContext: { source: 'hook.preToolEdit' },
    });
    expect(events[0]!.context).toEqual({ file: 'x.ts', source: 'hook.preToolEdit' });
  });

  it('calls stamp once per emitted event', () => {
    let calls = 0;
    runBoundaryCheck({
      declaredFiles: [],
      touchedFiles: ['p.ts', 'q.ts', 'r.ts'],
      stamp: () => {
        calls += 1;
        return FIXED;
      },
    });
    expect(calls).toBe(3);
  });

  it('exposes the shared message builder', () => {
    expect(boundaryMessage('foo.ts')).toBe(
      "foo.ts touched but not declared in any task's files:",
    );
  });

  // Phase 47 — absolute-vs-relative path normalization (root supplied).
  const ROOT = '/home/u/repo';

  it('AC-1: with root, an absolute touched path matching a relative declared file emits nothing', () => {
    const events = runBoundaryCheck({
      root: ROOT,
      declaredFiles: ['packages/core/src/x.ts'],
      touchedFiles: [`${ROOT}/packages/core/src/x.ts`],
      stamp: stampFixed,
    });
    expect(events).toEqual([]);
  });

  it('AC-2: with NO root, exact-string matching is preserved (back-compat)', () => {
    const events = runBoundaryCheck({
      declaredFiles: ['a.ts', 'b.ts'],
      touchedFiles: ['a.ts', 'stray.ts'],
      stamp: stampFixed,
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.context.file).toBe('stray.ts');
  });

  it('AC-3: with root, a genuine stray still flags and emits the ORIGINAL absolute path', () => {
    const stray = `${ROOT}/packages/core/src/stray.ts`;
    const events = runBoundaryCheck({
      root: ROOT,
      declaredFiles: ['packages/core/src/x.ts'],
      touchedFiles: [stray],
      stamp: stampFixed,
    });
    expect(events).toHaveLength(1);
    expect(events[0]!.context.file).toBe(stray);
    expect(events[0]!.message).toBe(boundaryMessage(stray));
  });

  // Phase 155 T1 (AC-1) — optional severity param for boundaryEnforcement: 'block'.
  it('AC-1: omitting severity defaults every emitted event to warn (back-compat)', () => {
    const events = runBoundaryCheck({
      declaredFiles: ['a.ts'],
      touchedFiles: ['stray.ts'],
      stamp: stampFixed,
    });
    expect(events[0]!.severity).toBe('warn');
  });

  it("AC-1: an explicit severity: 'error' is applied to every emitted event", () => {
    const events = runBoundaryCheck({
      declaredFiles: ['a.ts'],
      touchedFiles: ['stray.ts', 'other.ts'],
      stamp: stampFixed,
      severity: 'error',
    });
    expect(events.map((e) => e.severity)).toEqual(['error', 'error']);
  });

  // Phase 286-01 (dec-20260821-001, D-Y) — `files:` glob expansion. T1 seeds
  // corpus-before-code fixtures for T2 (matcher, in this same shared home)
  // and the new-anomaly wire-up (build-task.ts only). Pre-existing test
  // titles above already own the bare `AC-1`/`AC-2`/`AC-3` tokens from
  // Phase 47/155, so this task's own fixtures are namespaced `286-01/AC-N`.

  it('286-01/AC-2: every pre-existing literal declared-file scenario in this suite matches an explicit hand-written expected value', () => {
    // Broadened from a single reused fixture to the FULL set of distinct
    // literal (non-wildcard) declared-file scenarios already exercised
    // earlier in this describe block (the plain files-outside-boundary
    // cases, the Set-input/dedup/order cases, extraContext merging, the
    // Phase 47 root-normalization cases, and the Phase 155 severity cases)
    // -- run together and asserted against an explicit hand-written expected
    // value so the AC-2 claim ("captured... across the existing boundary
    // test suite") is actually comprehensive for this file, not just one
    // representative case.
    // `ROOT` is the same constant the Phase 47 root-normalization tests
    // above use, still in scope in this closure.
    const scenarios: Array<{ scenario: string; events: unknown }> = [
      {
        scenario: 'emits one warn files-outside-boundary event per non-declared file',
        events: runBoundaryCheck({
          declaredFiles: ['a.ts', 'b.ts'],
          touchedFiles: ['a.ts', 'stray.ts', 'other.ts'],
          stamp: stampFixed,
        }),
      },
      {
        scenario: 'emits nothing when every touched file is declared',
        events: runBoundaryCheck({
          declaredFiles: ['a.ts', 'b.ts'],
          touchedFiles: ['a.ts', 'b.ts'],
          stamp: stampFixed,
        }),
      },
      {
        scenario: 'iterates the caller-supplied order and does NOT dedup (hook path)',
        events: runBoundaryCheck({
          declaredFiles: ['a.ts'],
          touchedFiles: ['z.ts', 'z.ts', 'a.ts'],
          stamp: stampFixed,
        }),
      },
      {
        scenario: 'respects a deduped Set input (settle path), preserving first-seen order',
        events: runBoundaryCheck({
          declaredFiles: new Set(['a.ts', 'b.ts']),
          touchedFiles: new Set(['a.ts', 'stray.ts', 'b.ts', 'extra.ts']),
          stamp: stampFixed,
        }),
      },
      {
        scenario: 'merges extraContext after the file key (hook source marker)',
        events: runBoundaryCheck({
          declaredFiles: [],
          touchedFiles: ['x.ts'],
          stamp: stampFixed,
          extraContext: { source: 'hook.preToolEdit' },
        }),
      },
      {
        scenario:
          'Phase 47 AC-1: with root, an absolute touched path matching a relative declared file emits nothing',
        events: runBoundaryCheck({
          root: ROOT,
          declaredFiles: ['packages/core/src/x.ts'],
          touchedFiles: [`${ROOT}/packages/core/src/x.ts`],
          stamp: stampFixed,
        }),
      },
      {
        scenario: 'Phase 47 AC-2: with NO root, exact-string matching is preserved (back-compat)',
        events: runBoundaryCheck({
          declaredFiles: ['a.ts', 'b.ts'],
          touchedFiles: ['a.ts', 'stray.ts'],
          stamp: stampFixed,
        }),
      },
      {
        scenario:
          'Phase 47 AC-3: with root, a genuine stray still flags and emits the ORIGINAL absolute path',
        events: runBoundaryCheck({
          root: ROOT,
          declaredFiles: ['packages/core/src/x.ts'],
          touchedFiles: [`${ROOT}/packages/core/src/stray.ts`],
          stamp: stampFixed,
        }),
      },
      {
        scenario: 'Phase 155 AC-1: omitting severity defaults every emitted event to warn',
        events: runBoundaryCheck({
          declaredFiles: ['a.ts'],
          touchedFiles: ['stray.ts'],
          stamp: stampFixed,
        }),
      },
      {
        scenario: "Phase 155 AC-1: an explicit severity: 'error' is applied to every emitted event",
        events: runBoundaryCheck({
          declaredFiles: ['a.ts'],
          touchedFiles: ['stray.ts', 'other.ts'],
          stamp: stampFixed,
          severity: 'error',
        }),
      },
    ];
    // Hand-written expected value, not a `.snap` file (dec-20260821-002):
    // a literal inline expectation is auditable from a static read, with no
    // claim about when it was captured.
    const EXPECTED: Array<{ scenario: string; events: unknown }> = [
      {
        scenario: 'emits one warn files-outside-boundary event per non-declared file',
        events: [
          {
            context: { file: 'stray.ts' },
            message: "stray.ts touched but not declared in any task's files:",
            severity: 'warn',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
          {
            context: { file: 'other.ts' },
            message: "other.ts touched but not declared in any task's files:",
            severity: 'warn',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
        ],
      },
      {
        scenario: 'emits nothing when every touched file is declared',
        events: [],
      },
      {
        scenario: 'iterates the caller-supplied order and does NOT dedup (hook path)',
        events: [
          {
            context: { file: 'z.ts' },
            message: "z.ts touched but not declared in any task's files:",
            severity: 'warn',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
          {
            context: { file: 'z.ts' },
            message: "z.ts touched but not declared in any task's files:",
            severity: 'warn',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
        ],
      },
      {
        scenario: 'respects a deduped Set input (settle path), preserving first-seen order',
        events: [
          {
            context: { file: 'stray.ts' },
            message: "stray.ts touched but not declared in any task's files:",
            severity: 'warn',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
          {
            context: { file: 'extra.ts' },
            message: "extra.ts touched but not declared in any task's files:",
            severity: 'warn',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
        ],
      },
      {
        scenario: 'merges extraContext after the file key (hook source marker)',
        events: [
          {
            context: { file: 'x.ts', source: 'hook.preToolEdit' },
            message: "x.ts touched but not declared in any task's files:",
            severity: 'warn',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
        ],
      },
      {
        scenario:
          'Phase 47 AC-1: with root, an absolute touched path matching a relative declared file emits nothing',
        events: [],
      },
      {
        scenario: 'Phase 47 AC-2: with NO root, exact-string matching is preserved (back-compat)',
        events: [
          {
            context: { file: 'stray.ts' },
            message: "stray.ts touched but not declared in any task's files:",
            severity: 'warn',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
        ],
      },
      {
        scenario:
          'Phase 47 AC-3: with root, a genuine stray still flags and emits the ORIGINAL absolute path',
        events: [
          {
            context: { file: `${ROOT}/packages/core/src/stray.ts` },
            message: `${ROOT}/packages/core/src/stray.ts touched but not declared in any task's files:`,
            severity: 'warn',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
        ],
      },
      {
        scenario: 'Phase 155 AC-1: omitting severity defaults every emitted event to warn',
        events: [
          {
            context: { file: 'stray.ts' },
            message: "stray.ts touched but not declared in any task's files:",
            severity: 'warn',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
        ],
      },
      {
        scenario: "Phase 155 AC-1: an explicit severity: 'error' is applied to every emitted event",
        events: [
          {
            context: { file: 'stray.ts' },
            message: "stray.ts touched but not declared in any task's files:",
            severity: 'error',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
          {
            context: { file: 'other.ts' },
            message: "other.ts touched but not declared in any task's files:",
            severity: 'error',
            ts: FIXED,
            type: 'files-outside-boundary',
          },
        ],
      },
    ];
    expect(scenarios).toEqual(EXPECTED);
  });

  it('286-01/AC-1: a wildcard declared entry (`.changeset/*.md`) matches a touched file of the same shape (`.changeset/foo.md`) -- no boundary anomaly', () => {
    // RED today: declaredFiles is compared via exact Set.has, so the literal
    // string '.changeset/*.md' never equals '.changeset/foo.md' and this
    // touched file is (wrongly) flagged as outside the boundary.
    const events = runBoundaryCheck({
      declaredFiles: ['.changeset/*.md'],
      touchedFiles: ['.changeset/foo.md'],
      stamp: stampFixed,
    });
    expect(events).toEqual([]);
  });

  it('286-01/AC-1: a wildcard declared entry does NOT match a nested path or a suffixed filename (`.changeset/nested/foo.md`, `.changeset/foo.md.bak`)', () => {
    // AC-1's own text (DRAFT.md): '*' matches within a single path segment
    // ([^/]*), so '.changeset/*.md' matches '.changeset/foo.md' but does
    // NOT match '.changeset/nested/foo.md' (the wildcard segment can't
    // cross a '/') or '.changeset/foo.md.bak' (the pattern's trailing
    // literal '.md' must match exactly, not as a prefix). Both are genuine
    // boundary violations and must still be flagged -- this is the negative
    // half of AC-1 that the positive-match test above does not cover.
    const events = runBoundaryCheck({
      declaredFiles: ['.changeset/*.md'],
      touchedFiles: ['.changeset/nested/foo.md', '.changeset/foo.md.bak'],
      stamp: stampFixed,
    });
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.type)).toEqual([
      'files-outside-boundary',
      'files-outside-boundary',
    ]);
    expect(events.map((e) => e.severity)).toEqual(['warn', 'warn']);
    expect(events.map((e) => e.context.file)).toEqual([
      '.changeset/nested/foo.md',
      '.changeset/foo.md.bak',
    ]);
  });

  it('286-01/AC-3: a wildcard entry covers its own file, but a second, genuinely undeclared file still flags in block mode (severity: error)', () => {
    // Adversarial fixture: '.changeset/*.md' legitimately covers
    // '.changeset/foo.md', but 'packages/core/src/random-untouched.ts' is
    // outside every declared entry and must still refuse. Asserted as the
    // EXACT event set (not just "contains the stray"), so this is
    // discriminating rather than coincidentally green: RED today because
    // '.changeset/foo.md' is ALSO (wrongly) flagged pre-T2, giving 2 events
    // instead of 1.
    const events = runBoundaryCheck({
      declaredFiles: ['.changeset/*.md'],
      touchedFiles: ['.changeset/foo.md', 'packages/core/src/random-untouched.ts'],
      stamp: stampFixed,
      severity: 'error',
    });
    expect(events).toEqual([
      {
        type: 'files-outside-boundary',
        severity: 'error',
        message: boundaryMessage('packages/core/src/random-untouched.ts'),
        context: { file: 'packages/core/src/random-untouched.ts' },
        ts: FIXED,
      },
    ]);
  });

  it("286-01/AC-5: 'boundary-pattern-unmatched' is not yet a recognized AnomalyType (schema pin -- red until AnomalyTypeZ is extended)", () => {
    // Per dec-20260821-001: a wildcard entry matching zero touched files is
    // surfaced via a NEW, additive AnomalyType (e.g. 'boundary-pattern-
    // unmatched'), hardcoded severity: 'warn', returned from a NEW function
    // -- NOT merged into runBoundaryCheck's own AnomalyEvent[] return. This
    // pin targets the schema itself (AnomalyTypeZ, packages/types/src/
    // anomaly.ts) rather than importing a not-yet-existing function, so a
    // missing export can't crash this whole file's collection. The real
    // behavioral contract lives in tests/cli/build-task-boundary.test.ts,
    // the one call site the decision wires this new anomaly into.
    expect(AnomalyTypeZ.safeParse('boundary-pattern-unmatched').success).toBe(true);
  });

  it("286-01/AC-5: a zero-match wildcard's 'boundary-pattern-unmatched' event is absent from runBoundaryCheck's own AnomalyEvent[] -- the array blockRefusal actually reads", () => {
    // The structural claim AC-5 makes is about WHICH array a zero-match
    // wildcard's advisory can appear in. `services/build-task.ts`'s
    // `blockRefusal` reads only `runBoundaryCheck`'s return value -- never
    // `findUnmatchedBoundaryPatterns`'s. This test asserts that directly,
    // at the unit level, rather than only inferring it from end-to-end
    // exit-code behavior in tests/cli/build-task-boundary.test.ts.
    const input = {
      declaredFiles: ['.changeset/*.md'],
      touchedFiles: ['src/unrelated.ts'],
      stamp: stampFixed,
      severity: 'error' as const, // block-mode severity -- must not matter.
    };
    const boundaryEvents = runBoundaryCheck(input);
    expect(boundaryEvents.map((e) => e.type)).not.toContain('boundary-pattern-unmatched');
    // Contrast: the SAME scenario, run through the separate function, DOES
    // produce the advisory -- proving the isolation is real (the anomaly
    // exists and is detectable), not just an artifact of an empty fixture.
    const unmatchedEvents = findUnmatchedBoundaryPatterns({
      declaredFiles: input.declaredFiles,
      touchedFiles: input.touchedFiles,
      stamp: stampFixed,
    });
    expect(unmatchedEvents.map((e) => e.type)).toEqual(['boundary-pattern-unmatched']);
    expect(unmatchedEvents[0]!.severity).toBe('warn');
  });

  it('286-01/AC-5: a literal declared entry matching zero touched files emits no extra anomaly (already the existing, correct behavior)', () => {
    // The overwhelmingly common case (a task declares 3 files, touches 2)
    // must not warn -- confirmed green today, kept as a regression pin.
    const events = runBoundaryCheck({
      declaredFiles: ['packages/core/src/checks/boundary.ts', 'a.ts'],
      touchedFiles: ['a.ts'],
      stamp: stampFixed,
    });
    expect(events).toEqual([]);
  });

  it('286-01/AC-4: the glob-matcher extraction added no new runtime dependency -- asserted against a captured baseline, not assumed', () => {
    // AC-4 requires the dependencies/devDependencies key set to be
    // "byte-unchanged (asserted, not assumed)". This baseline was captured
    // live from packages/core/package.json at the start of phase 286-01,
    // before T2's globToRegExp/toMatcher extraction into util/glob.ts --
    // that extraction moved code within packages/core, it did not add a
    // glob/minimatch/micromatch package. If this test ever needs to change,
    // that is itself the signal a dependency was added and deserves a
    // second look, not a routine snapshot update.
    const pkg = JSON.parse(readFileSync(PKG, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      '@anthropic-ai/sdk',
      '@modelcontextprotocol/sdk',
      '@thomas-powers-jr/cadence-types',
      'commander',
      'zod',
    ]);
    expect(Object.keys(pkg.devDependencies ?? {}).sort()).toEqual([
      '@thomas-powers-jr/cadence-testkit',
      'vitest',
    ]);
  });
});
