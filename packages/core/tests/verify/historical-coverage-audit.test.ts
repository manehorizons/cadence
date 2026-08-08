import { describe, it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo } from '@thomas-powers-jr/cadence-testkit';
import type { Draft, Summary } from '@thomas-powers-jr/cadence-types';
import {
  classifyPhaseAcCoverage,
  deriveLiteralDeclaredTestFiles,
  auditHistoricalCoverage,
  buildFileDeclarationIndex,
  type FileDeclarationIndex,
  type AcCoverageBucket,
} from '../../src/verify/historical-coverage-audit.js';

// Phase 261 T1 — unit tests for the per-phase AC-coverage classifier
// (`classifyPhaseAcCoverage`). Every test here uses a fresh ephemeral
// `tempRepo()` fixture plus hand-constructed fixture DRAFT/SUMMARY objects
// and a hand-constructed fixture `FileDeclarationIndex` — never this repo's
// own `.cadence/phases/` corpus (AC-6: offline determinism). This repo's own
// `.cadence/config.json` runs `coverageScheme: 'phase-qualified'`, so every
// `it()` name below carries the `261-01/AC-N` qualifier prefix required by
// this phase's own coverage gate.

async function writeTestFile(root: string, relPath: string, body: string): Promise<void> {
  const abs = join(root, relPath);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

function makeDraft(phase: string, id: string, files: string[]): Draft {
  return {
    schemaVersion: 1,
    id,
    phase,
    tier: 'standard',
    title: `${id} fixture phase`,
    objective: 'fixture objective for historical-coverage-audit tests',
    acceptanceCriteria: [{ id: 'AC-1', name: '', given: 'a', when: 'b', then: 'c' }],
    tasks: [
      {
        id: 'T1',
        name: 'fixture task',
        files,
        action: 'fixture action',
        verify: 'fixture verify',
        done: 'AC-1',
      },
    ],
    boundaries: [],
    status: 'SETTLED',
  };
}

function makeSummary(id: string, acIds: string[]): Summary {
  return {
    schemaVersion: 1,
    draftId: id,
    completedAt: '2026-01-01T00:00:00.000Z',
    acResults: acIds.map((acId) => ({ id: acId, pass: true, evidence: 'executed' })),
    taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
    decisions: [],
    deferred: [],
    skillAudit: { required: [], invoked: [] },
    // `coverageScheme` intentionally absent — this is the pre-phase-239
    // record shape the whole audit exists to classify.
  };
}

describe('classifyPhaseAcCoverage (phase 261 T1)', () => {
  it(
    '261-01/AC-1: a literal declared test file only this phase declares, with an ' +
      'asserting AC match, classifies self-attested (also proves {a,b} brace-expansion ' +
      '+ existsSync filtering; a stray wildcard entry mixed in is inert but does not ' +
      'itself prove exclusion — see the dedicated wildcard-exclusion test below)',
    async () => {
      const repo = await tempRepo();
      try {
        await writeTestFile(
          repo.root,
          'packages/core/tests/fixtures/phase-a.test.ts',
          "it('covers thing (AC-1)', () => { expect(1).toBe(1); });\n",
        );
        const draft = makeDraft('261-fixture-a', '261-fixture-a-01', [
          // Wildcard glob — must be ignored entirely, never resolved. (Not
          // discriminating on its own: it would also be excluded by the
          // downstream `.test.ts` extension check even without wildcard
          // filtering. See the dedicated test below for a case that fails
          // if wildcard-exclusion is removed.)
          'packages/core/tests/fixtures/*.ignored.ts',
          // Brace group: one alternative exists on disk, the other doesn't —
          // only the existing one should survive into declaredTestFiles.
          'packages/core/tests/fixtures/{phase-a,does-not-exist}.test.ts',
        ]);
        const summary = makeSummary('261-fixture-a-01', ['AC-1']);
        const index: FileDeclarationIndex = new Map([
          ['packages/core/tests/fixtures/phase-a.test.ts', new Set(['261-fixture-a'])],
        ]);

        const result = await classifyPhaseAcCoverage(repo.root, draft, summary, index);

        expect(result.declaredTestFiles).toEqual(['packages/core/tests/fixtures/phase-a.test.ts']);
        expect(result.perAc).toEqual([{ id: 'AC-1', bucket: 'self-attested' }]);
      } finally {
        await repo.cleanup();
      }
    },
  );

  it(
    '261-01/AC-1: deriveLiteralDeclaredTestFiles rejects a files: entry containing a ' +
      'wildcard character (`[`) even when a file with that literal (wildcard-character-' +
      'containing) name genuinely exists on disk',
    async () => {
      const repo = await tempRepo();
      try {
        // A real on-disk file whose literal path contains a `[` character —
        // one of the three chars `WILDCARD_CHARS_RE` matches (`*`, `?`,
        // `[`), and the only one of the three that is also a legal filename
        // component on Windows/NTFS as well as ext4/APFS (`*` and `?` are
        // illegal on NTFS, and this repo's CI runs Windows). Chosen
        // deliberately so this test fails if wildcard-exclusion is removed:
        // without the `WILDCARD_CHARS_RE` guard, this entry would pass the
        // `.test.ts` extension check AND `existsSync` would return true for
        // it (because the file genuinely exists at this exact literal
        // path), so it WOULD be included. With the guard present, the entry
        // is rejected before ever reaching `existsSync` because it contains
        // `[`, so it must NOT appear in the result.
        await writeTestFile(
          repo.root,
          'packages/core/tests/fixtures/pattern-[abc].test.ts',
          "it('covers thing (AC-1)', () => { expect(1).toBe(1); });\n",
        );
        const draft = makeDraft('261-fixture-g', '261-fixture-g-01', [
          'packages/core/tests/fixtures/pattern-[abc].test.ts',
        ]);

        const result = deriveLiteralDeclaredTestFiles(draft, repo.root);

        expect(result).toEqual([]);
      } finally {
        await repo.cleanup();
      }
    },
  );

  it(
    '261-01/AC-2: an asserting AC match found only in a test file that 2+ phases\' ' +
      'DRAFTs also declare literally classifies self-attested-shared, not self-attested',
    async () => {
      const repo = await tempRepo();
      try {
        await writeTestFile(
          repo.root,
          'packages/core/tests/fixtures/shared.test.ts',
          "it('covers thing (AC-1)', () => { expect(1).toBe(1); });\n",
        );
        const draft = makeDraft('261-fixture-b', '261-fixture-b-01', [
          'packages/core/tests/fixtures/shared.test.ts',
        ]);
        const summary = makeSummary('261-fixture-b-01', ['AC-1']);
        // Declared literally by this phase AND another phase — shared.
        const index: FileDeclarationIndex = new Map([
          [
            'packages/core/tests/fixtures/shared.test.ts',
            new Set(['261-fixture-b', '99-other-phase']),
          ],
        ]);

        const result = await classifyPhaseAcCoverage(repo.root, draft, summary, index);

        expect(result.perAc).toEqual([{ id: 'AC-1', bucket: 'self-attested-shared' }]);
      } finally {
        await repo.cleanup();
      }
    },
  );

  it(
    '261-01/AC-1: a file-declaration index with no entry at all for the qualifying ' +
      'file (not even an empty set) treats that file as dedicated to this phase — ' +
      'self-attested, not self-attested-shared',
    async () => {
      const repo = await tempRepo();
      try {
        await writeTestFile(
          repo.root,
          'packages/core/tests/fixtures/phase-h.test.ts',
          "it('covers thing (AC-1)', () => { expect(1).toBe(1); });\n",
        );
        const draft = makeDraft('261-fixture-h', '261-fixture-h-01', [
          'packages/core/tests/fixtures/phase-h.test.ts',
        ]);
        const summary = makeSummary('261-fixture-h-01', ['AC-1']);
        // Deliberately empty: the index has NO key at all for
        // `phase-h.test.ts`, simulating an index that, for whatever reason,
        // doesn't know about this file. Per `isDedicatedTo`'s documented
        // behavior, a missing index entry is treated as "declared by nobody
        // but the phase being classified" — i.e. dedicated.
        const result = await classifyPhaseAcCoverage(repo.root, draft, summary, new Map());

        expect(result.perAc).toEqual([{ id: 'AC-1', bucket: 'self-attested' }]);
      } finally {
        await repo.cleanup();
      }
    },
  );

  it(
    '261-01/AC-3: a phase whose DRAFT declares no literal, existing test-file path ' +
      '(only a wildcard glob) classifies every AC unreachable',
    async () => {
      const repo = await tempRepo();
      try {
        const draft = makeDraft('261-fixture-c', '261-fixture-c-01', [
          'packages/core/tests/**/*.test.ts',
        ]);
        const summary = makeSummary('261-fixture-c-01', ['AC-1', 'AC-2']);

        const result = await classifyPhaseAcCoverage(repo.root, draft, summary, new Map());

        expect(result.declaredTestFiles).toEqual([]);
        expect(result.perAc).toEqual([
          { id: 'AC-1', bucket: 'unreachable' },
          { id: 'AC-2', bucket: 'unreachable' },
        ]);
      } finally {
        await repo.cleanup();
      }
    },
  );

  it(
    '261-01/AC-3: a phase whose task declares no files at all classifies every AC unreachable',
    async () => {
      const repo = await tempRepo();
      try {
        const draft = makeDraft('261-fixture-i', '261-fixture-i-01', []);
        const summary = makeSummary('261-fixture-i-01', ['AC-1']);

        const result = await classifyPhaseAcCoverage(repo.root, draft, summary, new Map());

        expect(result.declaredTestFiles).toEqual([]);
        expect(result.perAc).toEqual([{ id: 'AC-1', bucket: 'unreachable' }]);
      } finally {
        await repo.cleanup();
      }
    },
  );

  it(
    '261-01/AC-3: a phase whose task declares only non-test files (no .test.ts/.test.tsx ' +
      'among them) classifies every AC unreachable',
    async () => {
      const repo = await tempRepo();
      try {
        const draft = makeDraft('261-fixture-j', '261-fixture-j-01', [
          'packages/core/src/foo.ts',
        ]);
        const summary = makeSummary('261-fixture-j-01', ['AC-1']);

        const result = await classifyPhaseAcCoverage(repo.root, draft, summary, new Map());

        expect(result.declaredTestFiles).toEqual([]);
        expect(result.perAc).toEqual([{ id: 'AC-1', bucket: 'unreachable' }]);
      } finally {
        await repo.cleanup();
      }
    },
  );

  it(
    '261-01/AC-3: a phase whose task declares a literal .test.ts path that no longer ' +
      'exists on disk classifies every AC unreachable',
    async () => {
      const repo = await tempRepo();
      try {
        const draft = makeDraft('261-fixture-k', '261-fixture-k-01', [
          // No file is ever written for this path — literal, correctly
          // extensioned, but absent from disk.
          'packages/core/tests/fixtures/phase-k-does-not-exist.test.ts',
        ]);
        const summary = makeSummary('261-fixture-k-01', ['AC-1']);

        const result = await classifyPhaseAcCoverage(repo.root, draft, summary, new Map());

        expect(result.declaredTestFiles).toEqual([]);
        expect(result.perAc).toEqual([{ id: 'AC-1', bucket: 'unreachable' }]);
      } finally {
        await repo.cleanup();
      }
    },
  );

  it(
    '261-01/AC-3: within a phase that declares a literal, existing test file, an AC ' +
      "whose token isn't found there classifies not-found-in-declared-files, distinct " +
      'from (and never conflated with) an unreachable AC in another phase',
    async () => {
      const repo = await tempRepo();
      try {
        await writeTestFile(
          repo.root,
          'packages/core/tests/fixtures/phase-d.test.ts',
          "it('covers thing (AC-1)', () => { expect(1).toBe(1); });\n",
        );
        const draft = makeDraft('261-fixture-d', '261-fixture-d-01', [
          'packages/core/tests/fixtures/phase-d.test.ts',
        ]);
        // AC-1's token IS in the declared file; AC-2's token is not.
        const summary = makeSummary('261-fixture-d-01', ['AC-1', 'AC-2']);
        const index: FileDeclarationIndex = new Map([
          ['packages/core/tests/fixtures/phase-d.test.ts', new Set(['261-fixture-d'])],
        ]);

        const result = await classifyPhaseAcCoverage(repo.root, draft, summary, index);

        expect(result.declaredTestFiles).toEqual(['packages/core/tests/fixtures/phase-d.test.ts']);
        expect(result.perAc).toEqual([
          { id: 'AC-1', bucket: 'self-attested' },
          { id: 'AC-2', bucket: 'not-found-in-declared-files' },
        ]);
      } finally {
        await repo.cleanup();
      }
    },
  );

  it(
    '261-01/AC-6: the classifier is fully determined by a constructed fixture repo, ' +
      "DRAFT/SUMMARY, and file-declaration index — never this repo's own live " +
      '.cadence/phases/ corpus',
    async () => {
      const repo = await tempRepo();
      try {
        // Guard against ever accidentally resolving into this repo's own
        // checkout: the fixture root is a fresh ephemeral temp directory.
        expect(repo.root).not.toBe(process.cwd());
        expect(repo.root.includes('.cadence')).toBe(false);

        await writeTestFile(
          repo.root,
          'packages/core/tests/fixtures/phase-e.test.ts',
          "it('covers thing (AC-1)', () => { expect(1).toBe(1); });\n",
        );
        const draft = makeDraft('261-fixture-e', '261-fixture-e-01', [
          'packages/core/tests/fixtures/phase-e.test.ts',
        ]);
        const summary = makeSummary('261-fixture-e-01', ['AC-1']);
        const index: FileDeclarationIndex = new Map([
          [
            'packages/core/tests/fixtures/phase-e.test.ts',
            new Set(['261-fixture-e', '261-fixture-f']),
          ],
        ]);

        const result = await classifyPhaseAcCoverage(repo.root, draft, summary, index);

        // Entirely determined by the fixture inputs handed in above — proves
        // the function does no ambient/repo-wide lookup of its own.
        expect(result).toEqual({
          phase: '261-fixture-e',
          id: '261-fixture-e-01',
          declaredTestFiles: ['packages/core/tests/fixtures/phase-e.test.ts'],
          perAc: [{ id: 'AC-1', bucket: 'self-attested-shared' }],
        });
      } finally {
        await repo.cleanup();
      }
    },
  );
});

// -----------------------------------------------------------------------
// Phase 261 T2 — corpus-wide walker + aggregation
// (`buildFileDeclarationIndex`, `auditHistoricalCoverage`). Unlike T1's
// tests above (which construct `Draft`/`Summary` objects directly, in
// memory), these tests write REAL `.cadence/phases/<dir>/<id>-DRAFT.md` +
// `<id>-SUMMARY.json` files to a fresh `tempRepo()` and exercise the real
// `parseDraftMd` / `JSON.parse` / `SummaryZ.safeParse` path end to end —
// still a hand-constructed fixture corpus, never this repo's own live
// `.cadence/phases/` (AC-6).
// -----------------------------------------------------------------------

async function writeJsonFile(root: string, relPath: string, value: unknown): Promise<void> {
  await writeTestFile(root, relPath, JSON.stringify(value, null, 2));
}

/**
 * Build a real `<id>-DRAFT.md` body parseable by `parseDraftMd`. The
 * Acceptance Criteria section is deliberately a single fixed boilerplate
 * block regardless of `files`/`acIds` below it — `classifyPhaseAcCoverage`
 * takes its AC ids from `summary.acResults`, never from
 * `draft.acceptanceCriteria` (T1's own doc comment), so what this section
 * says is irrelevant to every assertion in this block; only `draft.tasks[].
 * files` (parsed from the Tasks section) matters here.
 */
function draftMdText(id: string, phase: string, files: string[]): string {
  const filesLine = files.map((f) => `\`${f}\``).join(', ');
  return `---
phase: ${phase}
id: ${id}
tier: standard
status: SETTLED
---

# ${id} — fixture phase

## Objective

Fixture objective for historical-coverage-audit T2 tests.

## Acceptance Criteria

### AC-1: fixture ac
Given a
When b
Then c

## Tasks

### T1: fixture task
- files: ${filesLine}
- action: fixture action
- verify: fixture verify
- done: AC-1

## Boundaries

- none
`;
}

/** `summary.acResults[].evidence` set to `'executed'`, matching T1's own `makeSummary` shape. */
function makeSummaryV2(id: string, acIds: string[]): Summary {
  return {
    schemaVersion: 1,
    draftId: id,
    completedAt: '2026-01-01T00:00:00.000Z',
    acResults: acIds.map((acId) => ({ id: acId, pass: true, evidence: 'executed' })),
    taskResults: [{ id: 'T1', status: 'DONE', notes: '' }],
    decisions: [],
    deferred: [],
    skillAudit: { required: [], invoked: [] },
  };
}

function acAssertionBody(acId: string): string {
  return `it('covers thing (${acId})', () => { expect(1).toBe(1); });\n`;
}

const PHASES_PREFIX = '.cadence/phases';

describe('auditHistoricalCoverage + buildFileDeclarationIndex (phase 261 T2)', () => {
  it(
    '261-01/AC-4: bucket totals sum exactly to the total acResults count across every ' +
      'successfully-parsed scheme-absent SUMMARY, a malformed-JSON and a schema-invalid ' +
      'SUMMARY both land in unreadable-records instead of crashing the walk or being ' +
      'silently dropped, a phase whose only declared test evidence is a wildcard glob ' +
      'classifies unreachable (not self-attested), and neither a coverageScheme-bearing ' +
      'SUMMARY nor a DRAFT-only phase (no SUMMARY.json at all) appears anywhere in the report',
    async () => {
      const repo = await tempRepo();
      try {
        // --- fixture-a: a literal test file only this phase's DRAFT declares
        // anywhere in the corpus -> self-attested.
        const aFile = 'packages/core/tests/fixtures/audit-a.test.ts';
        await writeTestFile(repo.root, aFile, acAssertionBody('AC-1'));
        await writeTestFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-a/900-01-DRAFT.md`,
          draftMdText('900-01', '261-fixture-a', [aFile]),
        );
        await writeJsonFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-a/900-01-SUMMARY.json`,
          makeSummaryV2('900-01', ['AC-1']),
        );

        // --- fixture-b + fixture-h: the SAME literal test file, declared by
        // TWO phases' DRAFTs corpus-wide -> self-attested-shared for b's
        // AC-1. fixture-h carries NO SUMMARY.json at all — it exists purely
        // to prove `buildFileDeclarationIndex` walks every DRAFT.md under
        // the corpus, not just the ones paired with a scheme-absent
        // SUMMARY: if the index only considered scheme-absent-paired
        // DRAFTs, h's declaration would never be seen and b's AC-1 would
        // wrongly come out self-attested instead of self-attested-shared.
        const sharedFile = 'packages/core/tests/fixtures/audit-shared.test.ts';
        await writeTestFile(repo.root, sharedFile, acAssertionBody('AC-1'));
        await writeTestFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-b/901-01-DRAFT.md`,
          draftMdText('901-01', '261-fixture-b', [sharedFile]),
        );
        await writeJsonFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-b/901-01-SUMMARY.json`,
          makeSummaryV2('901-01', ['AC-1']),
        );
        await writeTestFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-h/902-01-DRAFT.md`,
          draftMdText('902-01', '261-fixture-h', [sharedFile]),
        );
        // (no 902-01-SUMMARY.json written for fixture-h — deliberate)

        // --- fixture-c: DRAFT declares ONLY a wildcard glob, no literal
        // path -> declaredTestFiles is empty -> every AC unreachable. The
        // glob below (`packages/core/tests/**/*.test.ts`) deliberately DOES
        // overlap real fixture files written elsewhere in this test
        // (audit-a.test.ts, audit-shared.test.ts, audit-d.test.ts below)
        // that genuinely contain `AC-1`/`AC-2` tokens — so this assertion
        // is not vacuous: an implementation that mistakenly resolved
        // wildcard globs to concrete files would find those tokens and
        // misclassify fixture-c as self-attested/self-attested-shared
        // instead of unreachable, and this test would catch it.
        await writeTestFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-c/903-01-DRAFT.md`,
          draftMdText('903-01', '261-fixture-c', ['packages/core/tests/**/*.test.ts']),
        );
        await writeJsonFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-c/903-01-SUMMARY.json`,
          makeSummaryV2('903-01', ['AC-1', 'AC-2']),
        );

        // --- fixture-d: a dedicated literal file whose content asserts
        // AC-1 only -> AC-1 self-attested, AC-2 not-found-in-declared-files.
        const dFile = 'packages/core/tests/fixtures/audit-d.test.ts';
        await writeTestFile(repo.root, dFile, acAssertionBody('AC-1'));
        await writeTestFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-d/904-01-DRAFT.md`,
          draftMdText('904-01', '261-fixture-d', [dFile]),
        );
        await writeJsonFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-d/904-01-SUMMARY.json`,
          makeSummaryV2('904-01', ['AC-1', 'AC-2']),
        );

        // --- fixture-e: malformed JSON -> unreadable-records, no crash,
        // even with no matching DRAFT.md present at all.
        await writeTestFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-e/905-01-SUMMARY.json`,
          '{ this is not valid json',
        );

        // --- fixture-f: valid JSON, fails SummaryZ schema validation
        // (missing every required field but schemaVersion/draftId) ->
        // unreadable-records.
        await writeJsonFile(repo.root, `${PHASES_PREFIX}/261-fixture-f/906-01-SUMMARY.json`, {
          schemaVersion: 1,
          draftId: '906-01',
        });

        // --- fixture-g: valid, schema-valid, scheme-absent SUMMARY but NO
        // matching DRAFT.md on disk -> unreadable-records (missing-DRAFT
        // case), not a crash.
        await writeJsonFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-g/907-01-SUMMARY.json`,
          makeSummaryV2('907-01', ['AC-1']),
        );

        // --- fixture-i: a post-phase-239-style SUMMARY that DOES carry a
        // coverageScheme -> entirely out of scope, must not appear in
        // perPhase, bucketTotals, or unreadableRecords.
        const iFile = 'packages/core/tests/fixtures/audit-i.test.ts';
        await writeTestFile(repo.root, iFile, acAssertionBody('AC-1'));
        await writeTestFile(
          repo.root,
          `${PHASES_PREFIX}/261-fixture-i/908-01-DRAFT.md`,
          draftMdText('908-01', '261-fixture-i', [iFile]),
        );
        await writeJsonFile(repo.root, `${PHASES_PREFIX}/261-fixture-i/908-01-SUMMARY.json`, {
          ...makeSummaryV2('908-01', ['AC-1']),
          coverageScheme: 'bare',
        });

        // The fixture table driving every expectation below — the single
        // source of truth for both what was written above and what the
        // audit must report, so nothing here is a hardcoded literal count.
        const successFixtures: { dir: string; acIds: string[]; expected: AcCoverageBucket[] }[] = [
          { dir: '261-fixture-a', acIds: ['AC-1'], expected: ['self-attested'] },
          { dir: '261-fixture-b', acIds: ['AC-1'], expected: ['self-attested-shared'] },
          { dir: '261-fixture-c', acIds: ['AC-1', 'AC-2'], expected: ['unreachable', 'unreachable'] },
          {
            dir: '261-fixture-d',
            acIds: ['AC-1', 'AC-2'],
            expected: ['self-attested', 'not-found-in-declared-files'],
          },
        ];
        const unreadableDirs = ['261-fixture-e', '261-fixture-f', '261-fixture-g'];

        const report = await auditHistoricalCoverage(repo.root);

        // Identity: exactly the successfully-parsed scheme-absent phases,
        // no more, no fewer — proves fixture-h (no SUMMARY.json) and
        // fixture-i (coverageScheme present) are excluded, and the three
        // unreadable phases never leak into perPhase.
        expect(report.perPhase.map((p) => p.phase).sort()).toEqual(
          successFixtures.map((f) => f.dir).sort(),
        );

        // AC-4's invariant, computed entirely from the fixture table above
        // (never a literal count): the four bucket totals sum exactly to
        // the total number of acResults entries across every
        // successfully-parsed scheme-absent SUMMARY.
        const expectedTotal = successFixtures.reduce((sum, f) => sum + f.acIds.length, 0);
        const bucketSum = (Object.values(report.bucketTotals) as number[]).reduce((a, b) => a + b, 0);
        expect(bucketSum).toBe(expectedTotal);

        // Per-bucket totals, also tallied from the fixture table rather
        // than hardcoded — this is the assertion that actually pins each
        // AC to the RIGHT bucket, not just the right total.
        const expectedBucketTotals: Record<AcCoverageBucket, number> = {
          'self-attested': 0,
          'self-attested-shared': 0,
          'not-found-in-declared-files': 0,
          unreachable: 0,
        };
        for (const f of successFixtures) {
          for (const bucket of f.expected) expectedBucketTotals[bucket] += 1;
        }
        expect(report.bucketTotals).toEqual(expectedBucketTotals);

        // unreadable-records: phase-level (one entry per bad SUMMARY, not
        // per-AC), identity matches exactly the three deliberately-bad
        // fixtures — never the two clean-but-out-of-scope ones (h, i).
        expect(report.unreadableRecords.map((r) => r.phase).sort()).toEqual([...unreadableDirs].sort());
        expect(report.unreadableRecords.every((r) => typeof r.reason === 'string' && r.reason.length > 0)).toBe(
          true,
        );
      } finally {
        await repo.cleanup();
      }
    },
  );

  it(
    '261-01/AC-4: buildFileDeclarationIndex maps a literal declared test-file path to ' +
      'the SET of every phase directory name whose DRAFT declares it, corpus-wide, ' +
      'independent of whether that phase has a SUMMARY.json at all',
    async () => {
      const repo = await tempRepo();
      try {
        const sharedFile = 'packages/core/tests/fixtures/index-shared.test.ts';
        await writeTestFile(repo.root, sharedFile, acAssertionBody('AC-1'));
        await writeTestFile(
          repo.root,
          `${PHASES_PREFIX}/261-idx-x/950-01-DRAFT.md`,
          draftMdText('950-01', '261-idx-x', [sharedFile]),
        );
        await writeTestFile(
          repo.root,
          `${PHASES_PREFIX}/261-idx-y/951-01-DRAFT.md`,
          draftMdText('951-01', '261-idx-y', [sharedFile, 'packages/core/tests/**/*.ignored.ts']),
        );

        const index: FileDeclarationIndex = buildFileDeclarationIndex(repo.root);

        expect(index.get(sharedFile)).toEqual(new Set(['261-idx-x', '261-idx-y']));
      } finally {
        await repo.cleanup();
      }
    },
  );
});
