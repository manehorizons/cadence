import { existsSync, readFileSync, readdirSync, type Dirent } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { SummaryZ, type Draft, type Summary } from '@thomas-powers-jr/cadence-types';
import { parseDraftMd } from '../parse/draft-parser.js';
import { scanTestCoverage, uncoveredAcs, weaklyLinkedAcs, skippedOnlyLinkedAcs } from './coverage.js';

/**
 * Phase 261 (T1): read-only audit of pre-phase-239 `SUMMARY.json` records —
 * ones with no `coverageScheme` recorded — that answers `rec-20260729-006`:
 * how much of a settled phase's recorded AC PASS is backed by genuine,
 * attributable per-phase test coverage, given that pre-239 records carry no
 * qualifier that would make a token search phase-attributable on its own.
 *
 * Two dead ends this design was deliberately corrected against (see the
 * phase 261 DRAFT's Objective for the full account, and `Boundaries`):
 *
 * 1. A repo-wide bare-`AC-N` token scan is not usable signal — most hits in
 *    this repo are fixture data inside other phases' own meta-tests, not
 *    real coverage evidence. This module never performs that scan; every
 *    scan below is scoped to a single phase's own literal declared files.
 * 2. Same-file self-attestation is not automatically trustworthy either — a
 *    file declared by many phases' DRAFTs (e.g.
 *    `packages/core/tests/cli/init.test.ts`, declared by 11) can't tell
 *    whose `AC-1` a match belongs to. A match only counts as high-confidence
 *    self-attestation when it lands in a file this phase's DRAFT is the
 *    *only* DRAFT in the whole corpus to declare (as a literal path) — see
 *    `FileDeclarationIndex` below, built corpus-wide by T2.
 *
 * Wildcard-glob `files:` entries (containing `*`, `?`, or `[`) are
 * deliberately never resolved to concrete files here — see the DRAFT's
 * Boundaries. Resolving them would require `coverage.ts`'s module-private
 * glob-matching internals, and a repo-wide glob declaration would collapse
 * the dedicated/shared distinction to noise. A phase whose only declared
 * test evidence is a wildcard glob is `unreachable`, not a bug.
 */

/** The four mutually exclusive classification buckets (phase 261 DRAFT, AC-1–AC-3). */
export type AcCoverageBucket =
  | 'self-attested'
  | 'self-attested-shared'
  | 'not-found-in-declared-files'
  | 'unreachable';

export interface AcCoverageClassification {
  /** The AC id as recorded in the SUMMARY's `acResults` (e.g. `'AC-3'`). */
  id: string;
  bucket: AcCoverageBucket;
}

export interface PhaseCoverageClassification {
  /** Phase directory name, from `draft.phase` (e.g. `'26-init-ux'`). */
  phase: string;
  /** Draft id, from `draft.id` (e.g. `'26-01'`). */
  id: string;
  /**
   * This phase's own literal, existing `.test.ts`/`.test.tsx` declared test
   * files — the exact scan scope used to classify every AC below. Empty iff
   * every AC in `perAc` is `unreachable`.
   */
  declaredTestFiles: string[];
  perAc: AcCoverageClassification[];
}

/**
 * Corpus-wide map from a literal declared test-file path (forward-slashed,
 * relative to repo root) to the set of phase *directory names* whose DRAFTs
 * declare that exact path literally. T2 builds the real index by parsing
 * every `*-DRAFT.md` under `.cadence/phases/**` with
 * `deriveLiteralDeclaredTestFiles`; T1's tests construct one directly as a
 * fixture. A file absent from the index (or present with an empty set) is
 * treated as declared by nobody but the phase being classified — i.e.
 * dedicated, not shared (see `classifyPhaseAcCoverage`'s "no OTHER phase"
 * check below).
 */
export type FileDeclarationIndex = Map<string, Set<string>>;

/** Any of `*`, `?`, `[` marks a `files:` entry as a wildcard glob — never resolved here. */
const WILDCARD_CHARS_RE = /[*?[]/;

/** Only `.test.ts` / `.test.tsx` paths count as test-file evidence. */
const TEST_FILE_RE = /\.test\.tsx?$/;

/**
 * Expand a single `{a,b,c}` brace group in `pattern` into one literal
 * alternative per comma-separated option, recursing so multiple non-nested
 * brace groups in one pattern (e.g. `packages/{a,b}/x/{y,z}.test.ts`) each
 * get expanded. A pattern with no brace group returns itself unchanged.
 * Deliberately "simple": no nested-brace support, matching the DRAFT's
 * "expand simple `{a,b,c}` brace groups" scope.
 */
function expandBraceGroup(pattern: string): string[] {
  const match = /\{([^{}]*)\}/.exec(pattern);
  if (!match) return [pattern];
  const group = match[1]!;
  const prefix = pattern.slice(0, match.index);
  const suffix = pattern.slice(match.index + match[0].length);
  return group.split(',').flatMap((alt) => expandBraceGroup(`${prefix}${alt}${suffix}`));
}

/**
 * Derive a DRAFT's own literal, existing `.test.ts`/`.test.tsx` declared
 * test-file set (phase 261 T1's first step, reused by T2 to build the
 * corpus-wide `FileDeclarationIndex`). From `draft.tasks[].files`: drop any
 * entry containing a wildcard char (`*`, `?`, `[`), brace-expand what's
 * left, keep only `.test.ts`/`.test.tsx` results, and keep only the ones
 * `existsSync` confirms exist under `repoRoot`. Returned paths are the exact
 * literal strings the DRAFT declared (post brace-expansion) — forward-
 * slashed, relative to `repoRoot` — sorted for determinism.
 */
export function deriveLiteralDeclaredTestFiles(draft: Draft, repoRoot: string): string[] {
  const out = new Set<string>();
  for (const task of draft.tasks) {
    for (const rawPath of task.files) {
      if (WILDCARD_CHARS_RE.test(rawPath)) continue;
      for (const expanded of expandBraceGroup(rawPath)) {
        if (!TEST_FILE_RE.test(expanded)) continue;
        if (!existsSync(join(repoRoot, expanded))) continue;
        out.add(expanded);
      }
    }
  }
  return [...out].sort();
}

/**
 * True iff no phase OTHER than `phase` appears in `declarers` — i.e. the
 * file is dedicated to `phase` (self-attestation is trustworthy), not
 * shared with any other phase's DRAFT. Vacuously true for an empty/absent
 * declarer set: a fixture index that only bothers to list "other" phases
 * (or a real index entry that, by construction, always contains the
 * classified phase itself) both read as dedicated here.
 */
function isDedicatedTo(declarers: Set<string> | undefined, phase: string): boolean {
  if (!declarers) return true;
  for (const declarer of declarers) {
    if (declarer !== phase) return false;
  }
  return true;
}

/**
 * Classify every AC in `summary.acResults` for one phase into one of the
 * four buckets (phase 261 DRAFT AC-1–AC-3), using ONLY that phase's own
 * literal declared test files — never a repo-wide scan (Boundaries).
 *
 * AC ids are taken from `summary.acResults`, not `draft.acceptanceCriteria`
 * — mirroring `phase-replay.ts`'s `replayPhaseCoverage`, which re-checks
 * exactly the ACs the SUMMARY actually recorded a verdict for, so a
 * DRAFT/SUMMARY drift can't silently vanish an AC from the audit.
 *
 * 1. Derive `declaredTestFiles` via `deriveLiteralDeclaredTestFiles`. Empty
 *    → every AC is `unreachable` (no scan is even attempted).
 * 2. Otherwise scan those files in `assertion` mode
 *    (`scanTestCoverage(repoRoot, { mode: 'assertion', globs:
 *    declaredTestFiles })`) and combine `uncoveredAcs` / `weaklyLinkedAcs` /
 *    `skippedOnlyLinkedAcs` exactly the way `phase-replay.ts`'s `bare`
 *    branch derives `currentlyCovered` — "found" iff the AC is in none of
 *    the three sets.
 * 3. Not found → `not-found-in-declared-files` (no repo-wide fallback).
 * 4. Found → look at the qualifying (`TestRef.qualifying === true`) refs'
 *    files. If at least one of those files is dedicated to this phase in
 *    `fileDeclarationIndex` (no other phase's DRAFT declares it literally,
 *    per `isDedicatedTo`), the AC is `self-attested` — real, attributable
 *    evidence exists regardless of any other, shared file also matching.
 *    Otherwise every qualifying file is shared with at least one other
 *    phase, and the AC is `self-attested-shared` — evidence exists, but
 *    cannot rule out belonging to another phase's identically-numbered AC.
 */
export async function classifyPhaseAcCoverage(
  repoRoot: string,
  draft: Draft,
  summary: Summary,
  fileDeclarationIndex: FileDeclarationIndex,
): Promise<PhaseCoverageClassification> {
  const declaredTestFiles = deriveLiteralDeclaredTestFiles(draft, repoRoot);
  const acIds = summary.acResults.map((r) => r.id);

  if (declaredTestFiles.length === 0) {
    return {
      phase: draft.phase,
      id: draft.id,
      declaredTestFiles,
      perAc: acIds.map((id) => ({ id, bucket: 'unreachable' as const })),
    };
  }

  const coverage = await scanTestCoverage(repoRoot, {
    mode: 'assertion',
    globs: declaredTestFiles,
  });
  const uncovered = new Set(uncoveredAcs(acIds, coverage));
  const weak = new Set(weaklyLinkedAcs(acIds, coverage));
  const skippedOnly = new Set(skippedOnlyLinkedAcs(acIds, coverage));

  const perAc: AcCoverageClassification[] = acIds.map((id) => {
    const found = !uncovered.has(id) && !weak.has(id) && !skippedOnly.has(id);
    if (!found) {
      return { id, bucket: 'not-found-in-declared-files' as const };
    }
    const refs = coverage.get(id) ?? [];
    const qualifyingFiles = new Set(refs.filter((r) => r.qualifying === true).map((r) => r.file));
    const hasDedicatedFile = [...qualifyingFiles].some((file) =>
      isDedicatedTo(fileDeclarationIndex.get(file), draft.phase),
    );
    const bucket: AcCoverageBucket = hasDedicatedFile ? 'self-attested' : 'self-attested-shared';
    return { id, bucket };
  });

  return { phase: draft.phase, id: draft.id, declaredTestFiles, perAc };
}

// ---------------------------------------------------------------------------
// Phase 261 T2: corpus-wide walk + aggregation, built on top of T1's
// per-phase classifier above.
// ---------------------------------------------------------------------------

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Recursively collect every file under `dir` whose name ends with `suffix`
 * (e.g. `-DRAFT.md` or `-SUMMARY.json`), mirroring the `walkSummaries(dir)`
 * helper in `packages/core/tests/parse/summary-verify-sweep.test.ts` — same
 * plain recursive `readdirSync(dir, { withFileTypes: true })` shape, kept
 * here (not there) because T3's CLI needs to call the audit built on top of
 * it. Best-effort per "Best-effort introspection never throws"
 * (`CLAUDE.md`): a directory that can't be listed (missing, permission
 * error) contributes nothing rather than throwing, so one bad subtree never
 * takes down the whole corpus walk. Sorted for determinism — `readdirSync`
 * order is not guaranteed to be identical across platforms (this repo's CI
 * matrix includes Windows), and this audit is meant to be reproducible.
 */
function walkFilesWithSuffix(dir: string, suffix: string): string[] {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFilesWithSuffix(full, suffix));
    } else if (entry.isFile() && entry.name.endsWith(suffix)) {
      out.push(full);
    }
  }
  return out.sort();
}

/**
 * The phase *directory name* a file found under `phasesDir` belongs to —
 * i.e. the first path segment after `.cadence/phases/`, NOT
 * `basename(dirname(path))`. The two coincide today (no phase directory
 * nests a file more than one level deep — verified against this repo's own
 * corpus), but `walkFilesWithSuffix` recurses arbitrarily deep, and keying
 * by the immediate parent would silently misattribute anything nested
 * further down. Two distinct phase directories can share a leading number
 * (e.g. `26-init-ux` vs `26-claude-md`), so this is always the full
 * directory name, never the bare numeric prefix.
 */
function phaseDirNameOf(phasesDir: string, filePath: string): string {
  const rel = relative(phasesDir, filePath);
  return rel.split(sep)[0]!;
}

/**
 * Build the corpus-wide `FileDeclarationIndex` (phase 261 T2 step (a)) by
 * parsing every `*-DRAFT.md` under `.cadence/phases/**` — deliberately the
 * WHOLE corpus, not just the phases with a scheme-absent `SUMMARY.json`,
 * because whether a file is dedicated-to or shared-with depends on every
 * DRAFT that ever declared it literally, including post-phase-239 ones that
 * already carry a `coverageScheme`. Reuses T1's
 * `deriveLiteralDeclaredTestFiles` — wildcard-glob `files:` entries
 * contribute nothing (already filtered out inside it).
 *
 * A DRAFT that can't be read or parsed is skipped for index-building
 * purposes ("Best-effort introspection never throws" — a bad DRAFT here
 * just contributes no declarations, it does not abort the index build). This
 * is intentionally NOT the same thing as `unreadable-records` below: that
 * bucket is specific to `auditHistoricalCoverage`'s own SUMMARY/DRAFT pair
 * walk in step (b), which is the walk AC-4 actually asks to be counted.
 */
export function buildFileDeclarationIndex(repoRoot: string): FileDeclarationIndex {
  const phasesDir = join(repoRoot, '.cadence', 'phases');
  const draftPaths = walkFilesWithSuffix(phasesDir, '-DRAFT.md');
  const index: FileDeclarationIndex = new Map();

  for (const draftPath of draftPaths) {
    const dirName = phaseDirNameOf(phasesDir, draftPath);

    let raw: string;
    try {
      raw = readFileSync(draftPath, 'utf8');
    } catch {
      continue;
    }

    let draft: Draft;
    try {
      draft = parseDraftMd(raw);
    } catch {
      continue;
    }

    // Phase-identity-consistency fix: normalize the in-memory `phase` to the
    // actual containing directory name rather than trusting the DRAFT's own
    // frontmatter `phase:` field, which is not guaranteed to match its
    // directory. This particular normalization is inert today —
    // `deriveLiteralDeclaredTestFiles` never reads `draft.phase`, and the
    // index below is keyed from `dirName` directly, not from
    // `normalizedDraft.phase` — but it is kept for symmetry with the
    // load-bearing normalization of the same shape in
    // `auditHistoricalCoverage` below, whose whole point is to make sure
    // `isDedicatedTo`'s comparison and this index's keys always agree on
    // what "this phase" means. Do not "clean this up" back to using `draft`
    // directly — see `auditHistoricalCoverage`'s comment for why the pair
    // must stay consistent.
    const normalizedDraft: Draft = { ...draft, phase: dirName };
    const literalFiles = deriveLiteralDeclaredTestFiles(normalizedDraft, repoRoot);

    for (const file of literalFiles) {
      const declarers = index.get(file);
      if (declarers) {
        declarers.add(dirName);
      } else {
        index.set(file, new Set([dirName]));
      }
    }
  }

  return index;
}

/** A `SUMMARY.json`/`DRAFT.md` pair that could not be read or parsed at all — phase-level, per AC-4. */
export interface UnreadableRecord {
  /** Phase directory name under `.cadence/phases/`. */
  phase: string;
  /** The `<id>` prefix shared by the SUMMARY/DRAFT pair (e.g. `'26-01'`). */
  id: string;
  /** Repo-root-relative, forward-slashed path to the `SUMMARY.json` that triggered this. */
  summaryPath: string;
  /** Human-readable reason, in the style of `phase-replay.ts`'s outcome messages. */
  reason: string;
}

/** Aggregate report produced by `auditHistoricalCoverage` (phase 261 T2, AC-4). */
export interface HistoricalCoverageAuditReport {
  /** One entry per successfully-parsed, scheme-absent SUMMARY/DRAFT pair, sorted by phase then id. */
  perPhase: PhaseCoverageClassification[];
  /**
   * `self-attested + self-attested-shared + not-found-in-declared-files +
   * unreachable` sums exactly to the total `acResults` entries across every
   * successfully-parsed scheme-absent SUMMARY (AC-4's invariant) — never
   * computed by hardcoding a count, always by tallying `perPhase`.
   */
  bucketTotals: Record<AcCoverageBucket, number>;
  /** Phase-level (not per-AC) — any SUMMARY/DRAFT pair that failed to parse. */
  unreadableRecords: UnreadableRecord[];
}

/** Repo-root-relative, forward-slashed path — matches `deriveLiteralDeclaredTestFiles`'s convention. */
function toRepoRelative(repoRoot: string, absPath: string): string {
  return relative(repoRoot, absPath).split(sep).join('/');
}

/**
 * The full phase 261 audit (T2, AC-4): walk every `SUMMARY.json` under
 * `.cadence/phases/**`, filter to `coverageScheme` absent (the pre-239
 * records `rec-20260729-006` asks about), classify each one's recorded ACs
 * with T1's `classifyPhaseAcCoverage` against the whole-corpus
 * `FileDeclarationIndex` from `buildFileDeclarationIndex`, and aggregate.
 *
 * Per SUMMARY found: the matching DRAFT's path is derived from the
 * SUMMARY's OWN filename (`<id>-SUMMARY.json` → `<id>-DRAFT.md` in the same
 * directory) — never the other way around — since this walks SUMMARY files.
 * Mirrors `phase-replay.ts`'s `replayPhaseCoverage` read/parse/validate
 * order (JSON.parse in a try/catch, then `SummaryZ.safeParse`) without
 * touching that file. Unlike `replayPhaseCoverage`, a SUMMARY written by a
 * newer, unrecognized `schemaVersion` is not special-cased here — it simply
 * fails `SummaryZ.safeParse` like any other schema violation and lands in
 * `unreadableRecords`, which is exactly what AC-4 asks for; the
 * `summary-newer-version` distinction only matters to `cadence verify
 * phase`'s live UX, not to this reproducible audit.
 *
 * Every DRAFT parsed here is normalized the same way as in
 * `buildFileDeclarationIndex`: `draft.phase` is overwritten in-memory (never
 * on disk) with the actual containing directory name before being handed to
 * `classifyPhaseAcCoverage`. This one IS load-bearing: `classifyPhaseAcCoverage`
 * calls `isDedicatedTo(fileDeclarationIndex.get(file), draft.phase)`
 * internally, comparing `draft.phase` against the directory-name declarer
 * set the index was built from. If a historical DRAFT's frontmatter
 * `phase:` field ever diverged from its own containing directory name, an
 * un-normalized `draft.phase` would compare against the WRONG identity and
 * could spuriously flip a dedicated file to "shared" (or vice versa). Doing
 * this consistently in both places keeps the index's keys and this
 * comparison always talking about the same phase identity.
 */
export async function auditHistoricalCoverage(repoRoot: string): Promise<HistoricalCoverageAuditReport> {
  const phasesDir = join(repoRoot, '.cadence', 'phases');
  const fileDeclarationIndex = buildFileDeclarationIndex(repoRoot);
  const summaryPaths = walkFilesWithSuffix(phasesDir, '-SUMMARY.json');

  const perPhase: PhaseCoverageClassification[] = [];
  const unreadableRecords: UnreadableRecord[] = [];
  const bucketTotals: Record<AcCoverageBucket, number> = {
    'self-attested': 0,
    'self-attested-shared': 0,
    'not-found-in-declared-files': 0,
    unreachable: 0,
  };

  for (const summaryPath of summaryPaths) {
    const dirName = phaseDirNameOf(phasesDir, summaryPath);
    const summaryRelPath = toRepoRelative(repoRoot, summaryPath);
    const id = basename(summaryPath).replace(/-SUMMARY\.json$/, '');
    const draftPath = join(dirname(summaryPath), `${id}-DRAFT.md`);

    let summaryRaw: string;
    try {
      summaryRaw = readFileSync(summaryPath, 'utf8');
    } catch (err) {
      unreadableRecords.push({
        phase: dirName,
        id,
        summaryPath: summaryRelPath,
        reason: `could not read SUMMARY.json: ${errMessage(err)}`,
      });
      continue;
    }

    let summaryJson: unknown;
    try {
      summaryJson = JSON.parse(summaryRaw);
    } catch (err) {
      unreadableRecords.push({
        phase: dirName,
        id,
        summaryPath: summaryRelPath,
        reason: `SUMMARY.json is not valid JSON: ${errMessage(err)}`,
      });
      continue;
    }

    const parsedSummary = SummaryZ.safeParse(summaryJson);
    if (!parsedSummary.success) {
      unreadableRecords.push({
        phase: dirName,
        id,
        summaryPath: summaryRelPath,
        reason: `SUMMARY.json does not match the expected SUMMARY schema: ${parsedSummary.error.message}`,
      });
      continue;
    }
    const summary = parsedSummary.data;

    // Out of scope, not unreadable: this SUMMARY already carries a coverage
    // scheme (a post-phase-239 record), so it isn't one of the pre-239
    // records `rec-20260729-006` asks about. Silently excluded from every
    // bucket, per-phase list, and the unreadable-records list alike.
    if (summary.coverageScheme !== undefined) {
      continue;
    }

    let draftRaw: string;
    try {
      draftRaw = readFileSync(draftPath, 'utf8');
    } catch (err) {
      unreadableRecords.push({
        phase: dirName,
        id,
        summaryPath: summaryRelPath,
        reason: `no matching DRAFT.md found at ${toRepoRelative(repoRoot, draftPath)}: ${errMessage(err)}`,
      });
      continue;
    }

    let draft: Draft;
    try {
      draft = parseDraftMd(draftRaw);
    } catch (err) {
      unreadableRecords.push({
        phase: dirName,
        id,
        summaryPath: summaryRelPath,
        reason: `${toRepoRelative(repoRoot, draftPath)} could not be parsed as a DRAFT: ${errMessage(err)}`,
      });
      continue;
    }

    // See the load-bearing-normalization comment on this function's doc
    // comment above, and the symmetric one in `buildFileDeclarationIndex`.
    const normalizedDraft: Draft = { ...draft, phase: dirName };

    const classification = await classifyPhaseAcCoverage(
      repoRoot,
      normalizedDraft,
      summary,
      fileDeclarationIndex,
    );
    perPhase.push(classification);
    for (const ac of classification.perAc) {
      bucketTotals[ac.bucket] += 1;
    }
  }

  perPhase.sort((a, b) => (a.phase === b.phase ? a.id.localeCompare(b.id) : a.phase.localeCompare(b.phase)));
  unreadableRecords.sort((a, b) =>
    a.phase === b.phase ? a.id.localeCompare(b.id) : a.phase.localeCompare(b.phase),
  );

  return { perPhase, bucketTotals, unreadableRecords };
}
