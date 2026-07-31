import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SummaryZ } from '@manehorizons/cadence-types';
import { parseDraftMd } from '../parse/draft-parser.js';
import { scanTestCoverage, uncoveredAcs, weaklyLinkedAcs, skippedOnlyLinkedAcs } from './coverage.js';

export interface AcDrift {
  id: string;
  recordedPass: boolean;
  recordedEvidence?: string;
  currentlyCovered: boolean;
  drift: boolean;
  /**
   * Phase 239 T8 (AC-9): true when this AC's verdict was NOT computed because
   * the SUMMARY recorded no coverage scheme at all (a pre-239 phase — real
   * example: phase 233). `currentlyCovered` is meaningless in that case
   * (always `false`, never scanned for) and `drift` is always `false` — the
   * replay does not assert a verdict it cannot substantiate. Absent (not
   * `false`) for every AC whose verdict WAS computed, so existing consumers
   * that never read this field see no shape change.
   */
  indeterminate?: boolean;
}

export interface PhaseReplayResult {
  phase: string;
  id: string;
  perAc: AcDrift[];
  driftCount: number;
  /**
   * Phase 239 T8: true when every entry in `perAc` is indeterminate because
   * the SUMMARY recorded no coverage scheme. `driftCount` is always `0` in
   * that case. Absent for a phase whose coverage was actually replayed.
   */
  indeterminate?: boolean;
  /**
   * Human-readable explanation, present only when `indeterminate` is true —
   * surfaced by `services/verify.ts` so `cadence verify phase`'s output
   * states plainly that pre-scheme coverage is not phase-attributable.
   */
  note?: string;
}

export type PhaseReplayOutcome =
  | { ok: true; data: PhaseReplayResult }
  | {
      ok: false;
      kind:
        | 'draft-missing'
        | 'draft-unparseable'
        | 'summary-missing'
        | 'summary-malformed'
        | 'summary-invalid'
        | 'no-scoped-files';
      message: string;
    };

export interface PhaseReplayConfig {
  coverageMode?: 'mention' | 'assertion';
  /** Configured verification.testGlobs; defaults to the engine defaults when absent. */
  testGlobs?: string[];
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Re-derive whether a settled phase's recorded AC coverage still holds,
 * entirely from committed artifacts — the phase's `DRAFT.md` and
 * `SUMMARY.json` — and never `state.json`. This makes the replay valid long
 * after the loop has moved past the phase, or in a fresh checkout that never
 * ran it locally at all (the point of `cadence verify phase` / `init --ci`).
 *
 * The coverage scan takes one of three shapes depending on the scheme the
 * SUMMARY itself recorded (`summary.coverageScheme`, phase 239 T6):
 *
 * - **Indeterminate** (`coverageScheme` absent entirely, phase 239 T8,
 *   AC-9): the SUMMARY predates the scheme — real example: phase 233, on
 *   `feat/kernel-assurance-v2` (measured directly against that branch, not
 *   the fixture equivalent — reachable, not merely cited). No scan runs at
 *   all: its coverage evidence is not phase-attributable (nothing in a
 *   pre-239 artifact records which phase a test belongs to), so no verdict
 *   can be substantiated one way or the other. Every AC in `perAc` is
 *   returned with `indeterminate: true` and `drift: false` rather than the
 *   pre-T8 behavior of scanning file-scoped and asserting a verdict it
 *   couldn't support (phase 233's SUMMARY records all five ACs as
 *   pass/executed; the pre-T8 bare/file-scoped scan reports 5 false drifts
 *   against it under `assertion` mode — the mode `cadence verify phase`
 *   actually runs under by default, since `defaultConfig.verification.
 *   coverageMode` is `'assertion'`, not this function's own `'mention'`
 *   fallback — and 1 false drift under `mention` mode, because its DRAFT
 *   under-declared its test files; see T7's As built amendment in the DRAFT
 *   for the full account). This is the "instead of drifting" the task name
 *   refers to.
 * - **Bare** (`coverageScheme === 'bare'`, explicitly recorded — a
 *   post-239 phase that settled under the bare scheme): the scan is
 *   restricted to the file paths the DRAFT's own tasks declared
 *   (`draft.tasks[].files`) — it is NEVER a whole-repo scan. `AC-N` tokens
 *   are small integers that repeat across every phase this repo has ever
 *   run (phase 7's AC-1, phase 42's AC-1, phase 200's AC-1, ...); a
 *   whole-repo scan would let an unrelated phase's AC-1 test satisfy this
 *   phase's AC-1 recheck purely by coincidence of numbering, silently
 *   masking real drift in the phase actually being replayed. Scoping the
 *   scan to only the files this phase's DRAFT named is what keeps a replay
 *   result meaningful per-phase rather than a repo-wide token search that
 *   happens to share a name. When a DRAFT declares no task files at all,
 *   this refuses outright (`no-scoped-files`) rather than silently widening
 *   the scan to the whole repo.
 * - **Phase-qualified** (`coverageScheme === 'phase-qualified'`): the scan is
 *   never scoped to the DRAFT's declared `tasks[].files` (`no-scoped-files`
 *   never fires under this scheme); instead it is scoped to the configured
 *   `verification.testGlobs` (`config.testGlobs`), or the engine's own
 *   default globs when that config is absent (`scanTestCoverage`'s
 *   `DEFAULT_GLOBS`) — whichever set is in force, matched by
 *   `expectedQualifier: id`. That is a config-scoped scan, not a whole-repo
 *   scan: a project whose real tests live outside the configured/default
 *   globs is invisible to this branch just as it would be to the coverage
 *   gate itself. `config.testGlobs` itself is supplied by the caller —
 *   `services/verify.ts`'s `runVerifyPhase` reads it from
 *   `verification.testGlobs` and passes it through as of phase 239 T8.
 *   Under this scheme every AC reference within that scope must carry the
 *   `<id>/AC-N` prefix (`scanTestCoverage`'s `expectedQualifier`, phase 239
 *   T2) to count at all — a bare or foreign-phase token is dropped from the
 *   result before it ever reaches this function. That prefix makes the
 *   token itself globally unique, which is exactly the property
 *   file-scoping existed to fake: cross-phase collision becomes
 *   structurally impossible without needing the DRAFT's `files:` lines to
 *   be complete, and those lines chronically under-declare in practice.
 *   Scoping by the configured/default test globs under the qualifier is
 *   therefore safer than file-scoping by the DRAFT's `files:` lines **in
 *   the common case** — though a task file declared outside `testGlobs` is
 *   found by the bare path (which scans exactly the DRAFT's declared
 *   paths) and missed by this one, so for a phase whose DRAFT names a file
 *   outside the configured/default globs, this path is actually *less*
 *   complete, not strictly safer. It is only as complete as
 *   `testGlobs`/the defaults actually are.
 */
export async function replayPhaseCoverage(
  repoRoot: string,
  phase: string,
  id: string,
  config: PhaseReplayConfig = {},
): Promise<PhaseReplayOutcome> {
  const draftPath = join(repoRoot, '.cadence', 'phases', phase, `${id}-DRAFT.md`);
  const summaryPath = join(repoRoot, '.cadence', 'phases', phase, `${id}-SUMMARY.json`);

  let draftRaw: string;
  try {
    draftRaw = await readFile(draftPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      kind: 'draft-missing',
      message: `no DRAFT.md found for ${phase}/${id} at ${draftPath}: ${errMessage(err)}`,
    };
  }

  let draft: ReturnType<typeof parseDraftMd>;
  try {
    draft = parseDraftMd(draftRaw);
  } catch (err) {
    return {
      ok: false,
      kind: 'draft-unparseable',
      message: `${draftPath} could not be parsed as a DRAFT: ${errMessage(err)}`,
    };
  }

  let summaryRaw: string;
  try {
    summaryRaw = await readFile(summaryPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      kind: 'summary-missing',
      message: `no SUMMARY.json found for ${phase}/${id} at ${summaryPath}: ${errMessage(err)}`,
    };
  }

  let summaryJson: unknown;
  try {
    summaryJson = JSON.parse(summaryRaw);
  } catch (err) {
    return {
      ok: false,
      kind: 'summary-malformed',
      message: `${summaryPath} is not valid JSON: ${errMessage(err)}`,
    };
  }

  const parsedSummary = SummaryZ.safeParse(summaryJson);
  if (!parsedSummary.success) {
    return {
      ok: false,
      kind: 'summary-invalid',
      message: `${summaryPath} does not match the expected SUMMARY schema: ${parsedSummary.error.message}`,
    };
  }
  const summary = parsedSummary.data;

  // Phase 239 T8 (AC-9): a SUMMARY with no `coverageScheme` at all predates
  // the scheme entirely — no phase-qualified token could exist, and the
  // pre-239 file-scoped scan is exactly the false-drift bug this phase
  // exists to remove (real example: phase 233, on
  // `feat/kernel-assurance-v2`, measured directly — its SUMMARY records all
  // five ACs pass/executed while the bare file-scoped replay reports 5
  // false drifts under `assertion` mode, the mode `cadence verify phase`
  // actually runs under by default (`defaultConfig.verification.
  // coverageMode` is `'assertion'`), because its DRAFT under-declared its
  // test files). Its coverage evidence is not phase-attributable, so no
  // scan runs and no verdict is computed for it — Boundaries forbid
  // asserting one. Every AC is reported `indeterminate` with `drift: false`
  // instead.
  if (summary.coverageScheme === undefined) {
    const perAc: AcDrift[] = summary.acResults.map((r) => ({
      id: r.id,
      recordedPass: r.pass,
      ...(r.evidence !== undefined ? { recordedEvidence: r.evidence } : {}),
      currentlyCovered: false,
      drift: false,
      indeterminate: true,
    }));
    return {
      ok: true,
      data: {
        phase,
        id,
        perAc,
        driftCount: 0,
        indeterminate: true,
        note:
          `${phase}/${id}'s SUMMARY.json records no coverage scheme — it predates phase 239. ` +
          'Its coverage evidence is not phase-attributable and therefore unverifiable; every AC ' +
          'is reported indeterminate rather than asserting drift this replay cannot substantiate.',
      },
    };
  }

  const qualified = summary.coverageScheme === 'phase-qualified';
  const taskFiles = draft.tasks.flatMap((t) => t.files);
  if (!qualified && taskFiles.length === 0) {
    return {
      ok: false,
      kind: 'no-scoped-files',
      message:
        `${phase}/${id}'s DRAFT.md declares no task files to scope a coverage scan to. Refusing ` +
        'rather than falling back to a whole-repo scan, which would reintroduce cross-phase ' +
        'AC-token collisions (see the doc comment on replayPhaseCoverage).',
    };
  }

  const mode = config.coverageMode ?? 'mention';
  // Qualified: scoped to the configured `verification.testGlobs` (or the
  // engine defaults when unset) and matched by this phase's own token —
  // never scoped to the DRAFT's declared files (see the doc comment above).
  // Bare: scoped to `taskFiles`, unchanged from the pre-239 behavior.
  const coverage = await scanTestCoverage(
    repoRoot,
    qualified
      ? { mode, expectedQualifier: id, ...(config.testGlobs ? { globs: config.testGlobs } : {}) }
      : { globs: taskFiles, mode },
  );
  // Derive the id set to re-check from the SUMMARY's own recorded AC results,
  // not from the current DRAFT's `## Acceptance Criteria` list. The DRAFT can
  // drift from the SUMMARY over time (that drift is the whole reason this
  // replay exists); if a SUMMARY-recorded AC id were no longer present in the
  // DRAFT, it would never appear in any of the uncovered/weak/skipped-only
  // sets below and `currentlyCovered` would default to `true` by vacuous
  // omission — silently defeating the coverage recheck for exactly the ACs
  // most likely to need it. The DRAFT is only consulted above for its
  // `tasks[].files` (the scan's scoping boundary).
  const acIds = summary.acResults.map((r) => r.id);
  const uncovered = new Set(uncoveredAcs(acIds, coverage));
  const weak = mode === 'assertion' ? new Set(weaklyLinkedAcs(acIds, coverage)) : new Set<string>();
  const skippedOnly =
    mode === 'assertion' ? new Set(skippedOnlyLinkedAcs(acIds, coverage)) : new Set<string>();

  const perAc: AcDrift[] = summary.acResults.map((r) => {
    const currentlyCovered = !uncovered.has(r.id) && !weak.has(r.id) && !skippedOnly.has(r.id);
    const drift = r.pass === true && r.evidence === 'executed' && !currentlyCovered;
    return {
      id: r.id,
      recordedPass: r.pass,
      ...(r.evidence !== undefined ? { recordedEvidence: r.evidence } : {}),
      currentlyCovered,
      drift,
    };
  });

  return {
    ok: true,
    data: {
      phase,
      id,
      perAc,
      driftCount: perAc.filter((a) => a.drift).length,
    },
  };
}
