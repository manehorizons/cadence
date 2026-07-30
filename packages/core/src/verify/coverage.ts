import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { getProfileForExtension } from './coverage-profiles/registry.js';
import { findSpansForProfile } from './coverage-profiles/engine.js';
import type { TestSpan } from './coverage-profiles/types.js';

export type AcId = `AC-${number}` | string;

export interface TestRef {
  /** Path relative to `repoRoot`, forward-slashed. */
  file: string;
  /** 1-based line number where the AC token first appeared. */
  line: number;
  /** Trimmed snippet of the matching line (≤120 chars). */
  snippet: string;
  /** Assertion mode only: true when the ref is inside a qualifying span. */
  qualifying?: boolean;
  /** Assertion mode only: true when the ref falls inside a skip/todo/failing span (the "skip dodge"). */
  skipped?: boolean;
}

export interface CoverageScanOptions {
  /**
   * Glob-ish patterns to match test files. Default scans the workspace
   * `packages/**\/*.test.ts`. The implementation supports `**` (any depth)
   * and `*` (any chars within a segment); no brace expansion or character
   * classes — keep the convention narrow + dependency-free.
   */
  globs?: string[];
  /**
   * Coverage strictness (phase 108). `mention` (default) = whole-file token
   * search. `assertion` = an AC ref counts only inside an `it()`/`test()` block
   * that asserts; mention-only refs are still recorded but tagged
   * `qualifying: false`.
   */
  mode?: 'mention' | 'assertion';
  /**
   * Phase 239 (phase-qualified coverage scheme): when set (a draft id, e.g.
   * `'239-01'`), an AC token counts only if it is immediately preceded by
   * `<expectedQualifier>/` — the prefix form `239-01/AC-3`. Bare and
   * foreign-phase occurrences are dropped from the result entirely; map
   * keys stay the bare `AC-N` id. Absent, the scan is byte-for-byte the
   * historical bare behavior.
   */
  expectedQualifier?: string;
}

const DEFAULT_GLOBS = ['packages/**/*.test.ts', 'packages/**/*.test.tsx'];

const AC_TOKEN_RE = /\bAC-\d+\b/g;

/**
 * Pure qualifier check (phase 239, T2). True iff the AC token starting at
 * `tokenOffset` in `text` is immediately preceded by `` `${qualifier}/` ``,
 * and that prefix is not itself the tail of a longer id (`1239-01/AC-3`
 * must not satisfy qualifier `239-01`). Works on whatever string the caller
 * matched the token in (whole file or a single line) — the prefix form
 * never spans a newline, so a line-scoped check is equivalent.
 */
export function tokenHasExpectedQualifier(
  text: string,
  tokenOffset: number,
  qualifier: string,
): boolean {
  const prefix = `${qualifier}/`;
  const start = tokenOffset - prefix.length;
  if (start < 0) return false;
  if (text.slice(start, tokenOffset) !== prefix) return false;
  // Boundary guard: the char before the prefix must not extend the id
  // (non-global regex — no lastIndex statefulness to reset).
  if (start > 0 && /[A-Za-z0-9_-]/.test(text.charAt(start - 1))) return false;
  return true;
}

/**
 * Walk the repo and collect a map of AC ids → tests that reference them.
 * The convention is whole-file text search: any occurrence of `AC-N` inside
 * a file matched by `globs` counts as one linked test. Comment refs count
 * too, by design — the gate is binary per AC, not coverage-percentage.
 */
export async function scanTestCoverage(
  repoRoot: string,
  opts: CoverageScanOptions = {},
): Promise<Map<AcId, TestRef[]>> {
  const out = new Map<AcId, TestRef[]>();
  const globs = (opts.globs ?? DEFAULT_GLOBS).map(toMatcher);
  const files = await listAllFiles(repoRoot);
  for (const abs of files) {
    const relPath = relative(repoRoot, abs).split(sep).join('/');
    if (!globs.some((m) => m(relPath))) continue;
    let raw: string;
    try {
      raw = await readFile(abs, 'utf8');
    } catch {
      continue;
    }
    const mode = opts.mode ?? 'mention';

    if (mode === 'assertion') {
      // Phase 167 (T6): dispatch by the file's own extension to the profile
      // registered for it (`./coverage-profiles/registry.js`) rather than
      // always scanning with the js/ts scanner regardless of language. An
      // extension no built-in (or custom, T7) profile claims yields zero
      // spans outright — never a fallback scan with an unrelated profile —
      // matching the phase's false-negative-over-false-positive invariant
      // (AC-6): an unrecognized language must never produce a partial or
      // wrong match. The same zero-spans outcome also falls out naturally
      // when a profile IS found but its `findSpansForProfile` scan simply
      // doesn't recognize any block in this particular file — both cases
      // collapse to the same "zero qualifying spans" result here, and stay
      // distinguishable downstream (glob-miss vs span-miss, phase 166 T3)
      // because that distinction is keyed off whether ANY file matched the
      // globs at all (`anyTestFilesMatched`), not off which of these two
      // reasons produced zero spans for a given file.
      //
      // Phase 169 (ported at merge time): spans are NOT pre-filtered to
      // `hasAssertion` here — the qualifying/skipped computation below needs
      // the full span list (including skipped ones) to tell "qualifies" and
      // "only linked test is skipped" apart; filtering here would collapse
      // that distinction before it can be made.
      const profile = getProfileForExtension(extensionOf(relPath));
      const spans = profile ? findSpansForProfile(raw, profile) : [];
      AC_TOKEN_RE.lastIndex = 0;
      const seen = new Set<string>();
      for (const m of raw.matchAll(AC_TOKEN_RE)) {
        const id = m[0]!;
        const offset = m.index ?? 0;
        // Phase 239: under the qualified scheme an unprefixed (or foreign-
        // prefixed) occurrence is not evidence at all — filter it BEFORE the
        // per-file dedup add, so a bare occurrence earlier in the file can't
        // consume the dedup slot of a later qualified one.
        if (
          opts.expectedQualifier !== undefined &&
          !tokenHasExpectedQualifier(raw, offset, opts.expectedQualifier)
        ) {
          continue;
        }
        const key = `${id}@${relPath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const before = raw.slice(0, offset);
        const lineNo = before.split('\n').length;
        const lineText = (raw.split('\n')[lineNo - 1] ?? '').trim().slice(0, 120);
        const arr = out.get(id) ?? [];
        arr.push({
          file: relPath,
          line: lineNo,
          snippet: lineText,
          qualifying: spans.some(
            (s) => s.hasAssertion && !s.skipped && offset >= s.start && offset <= s.end,
          ),
          skipped: spans.some((s) => s.skipped && offset >= s.start && offset <= s.end),
        });
        out.set(id, arr);
      }
      continue; // next file; do not run the mention loop
    }

    const lines = raw.split(/\r?\n/);
    const seenInFile = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const matches = line.matchAll(AC_TOKEN_RE);
      for (const m of matches) {
        const id = m[0]!;
        // Phase 239: same pre-dedup qualifier filter as the assertion
        // branch; `m.index` is line-local, and the prefix form never spans
        // a newline, so checking against `line` is equivalent.
        if (
          opts.expectedQualifier !== undefined &&
          !tokenHasExpectedQualifier(line, m.index ?? 0, opts.expectedQualifier)
        ) {
          continue;
        }
        const key = `${id}@${relPath}`;
        if (seenInFile.has(key)) continue;
        seenInFile.add(key);
        const arr = out.get(id) ?? [];
        arr.push({ file: relPath, line: i + 1, snippet: line.trim().slice(0, 120) });
        out.set(id, arr);
      }
    }
  }
  return out;
}

/**
 * Whether any file in the repo matches `globs` at all (Phase 166, T3 fix
 * round). `uncoveredAcs` alone can't distinguish "no test files matched the
 * globs" from "files matched fine but this particular AC-N is never
 * mentioned in any of them" — both produce zero refs. The gate needs this
 * signal to avoid telling the operator to check their globs when the globs
 * were never the problem.
 */
export async function anyTestFilesMatched(
  repoRoot: string,
  globs?: string[],
): Promise<boolean> {
  const matchers = (globs ?? DEFAULT_GLOBS).map(toMatcher);
  const files = await listAllFiles(repoRoot);
  return files.some((abs) => {
    const relPath = relative(repoRoot, abs).split(sep).join('/');
    return matchers.some((m) => m(relPath));
  });
}

/**
 * Returns the list of AC ids that have zero linked tests. Useful for the
 * settle gate's refusal message.
 */
export function uncoveredAcs(
  acIds: string[],
  coverage: Map<AcId, TestRef[]>,
): string[] {
  return acIds.filter((id) => (coverage.get(id) ?? []).length === 0);
}

/** True iff `refs` is non-empty and none of them qualify (assertion mode). */
function isFullyNonQualifying(refs: TestRef[]): boolean {
  return refs.length > 0 && refs.every((r) => r.qualifying === false);
}

/**
 * Assertion mode: AC ids that have ≥1 recorded ref but none that qualifies
 * (i.e. mentioned somewhere, but never inside an asserting it()/test() block),
 * where at least one of those non-qualifying refs is NOT skip-caused (e.g. a
 * bare comment mention with no containing span at all). Mutually exclusive
 * with `skippedOnlyLinkedAcs` (phase 169): every AC with ≥1 ref and 0
 * qualifying refs lands in exactly one of the two buckets.
 * Empty in mention mode (refs there carry no `qualifying` flag → treated as
 * not-weak as long as they exist).
 */
export function weaklyLinkedAcs(
  acIds: string[],
  coverage: Map<AcId, TestRef[]>,
): string[] {
  return acIds.filter((id) => {
    const refs = coverage.get(id) ?? [];
    if (!isFullyNonQualifying(refs)) return false;
    return !refs.every((r) => r.skipped === true);
  });
}

/**
 * Assertion mode (phase 169): AC ids that have ≥1 recorded ref, none of
 * which qualify, where EVERY non-qualifying ref is skip-caused — i.e. every
 * ref sits inside a `test.skip`/`.todo`/`.failing` span (the "skip dodge").
 * Distinct from `weaklyLinkedAcs`, which requires at least one non-qualifying
 * ref to NOT be skip-caused; the two are mutually exclusive.
 */
export function skippedOnlyLinkedAcs(
  acIds: string[],
  coverage: Map<AcId, TestRef[]>,
): string[] {
  return acIds.filter((id) => {
    const refs = coverage.get(id) ?? [];
    if (!isFullyNonQualifying(refs)) return false;
    return refs.every((r) => r.skipped === true);
  });
}

/**
 * Phase 167 (T8) — per-file, per-span diagnostic detail for
 * `cadence verify coverage --explain AC-N`.
 *
 * `scanTestCoverage` deliberately collapses per-file profile/span detail
 * into a flat `qualifying: boolean` — enough for the gate's binary
 * pass/fail, but not enough to diagnose a refusal without reading engine
 * source. This is a NEW, separate read path (not a modification of
 * `scanTestCoverage`) that walks the same glob-matched file set and
 * preserves that detail: which profile (if any) scanned each file, why
 * (unclaimed extension vs. a claimed extension with zero recognized
 * blocks), every span found, and — per occurrence of the target AC token —
 * which span contains it and a plain-language satisfy/not-satisfy reason.
 * Read-only: only ever calls `readFile`/`readdir`, never writes anything,
 * and shares no mutable state with `scanTestCoverage` or the real gate
 * (`../gates/coverage.ts`), so this addition cannot regress either.
 */
export interface ExplainSpan {
  /** Absolute char offset of the span's opener match start. */
  start: number;
  /** Absolute char offset of the span's closing boundary (inclusive). */
  end: number;
  /** 1-based line number of `start`. */
  startLine: number;
  /** 1-based line number of `end`. */
  endLine: number;
  /** True iff a code-mode assertion token was found inside this span. */
  hasAssertion: boolean;
  /** True iff this span's opener marks a test that doesn't run its body
   * normally (phase 169's "skip dodge", e.g. js/ts's `it.skip`/`test.todo`;
   * ported onto this diagnostic at merge time so it stays accurate — an
   * intact assertion inside a skipped test must NOT read as satisfying,
   * matching `runCoverageGate`'s own real refusal behavior). */
  skipped: boolean;
}

export interface ExplainOccurrence {
  /** 1-based line number where the AC token occurrence starts. */
  line: number;
  /** Trimmed snippet of the matching line (≤120 chars). */
  snippet: string;
  /** Absolute char offset of the occurrence. */
  offset: number;
  /** The span containing this occurrence, or null if none does. */
  span: ExplainSpan | null;
  /** True iff this occurrence satisfies the configured coverage mode. */
  satisfies: boolean;
  /** Human-readable reason for the satisfy/not-satisfy verdict. */
  reason: string;
}

export interface ExplainFileResult {
  /** Path relative to `repoRoot`, forward-slashed. */
  file: string;
  /** Lowercase file extension (with leading dot), `''` if none. */
  extension: string;
  /** Id of the profile that scanned this file, or null if unclaimed
   * (mention mode always reports null — no profile scan is performed). */
  profileId: string | null;
  /** Human-readable reason naming which case applies: no profile for the
   * extension, a profile that found no test block, or a normal scan. */
  profileReason: string;
  /** Total spans `findSpansForProfile` found in this file (0 in mention
   * mode, for an unclaimed extension, or for a claimed extension whose
   * profile recognized no block shape in this file's actual content). */
  spansFound: number;
  /** Occurrences of the target AC token found in this file. */
  occurrences: ExplainOccurrence[];
}

export interface CoverageExplainResult {
  /** The AC id being explained, e.g. `'AC-8'`. */
  acId: string;
  /** Coverage mode in effect. */
  mode: 'mention' | 'assertion';
  /**
   * Phase 239 (T4, AC-6): the qualifier in effect under
   * `verification.coverageScheme: 'phase-qualified'`, e.g. `'239-01'`.
   * Absent under the bare scheme, which keeps the historical result shape
   * (and the historical rendered report) unchanged.
   */
  expectedQualifier?: string;
  /** Glob patterns searched (resolved defaults if none configured). */
  globs: string[];
  /** Whether any file in the repo matched `globs` at all — distinguishes a
   * glob-configuration problem from "globs matched, this AC just isn't
   * mentioned anywhere". */
  anyFilesMatched: boolean;
  /** Per-file detail for every glob-matched file, sorted by path. */
  files: ExplainFileResult[];
  /** True iff at least one occurrence, in any file, satisfies the mode. */
  satisfied: boolean;
}

function offsetToLine(raw: string, offset: number): number {
  return raw.slice(0, offset).split('\n').length;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Walk glob-matched files and, for a single target `acId`, surface every
 * occurrence together with its containing span (if any) and a plain-
 * language satisfy/not-satisfy reason. Powers `cadence verify coverage
 * --explain` (T8, AC-8). Read-only.
 */
export async function explainAcCoverage(
  repoRoot: string,
  acId: string,
  opts: CoverageScanOptions = {},
): Promise<CoverageExplainResult> {
  const mode = opts.mode ?? 'mention';
  const globs = opts.globs ?? DEFAULT_GLOBS;
  const matchers = globs.map(toMatcher);
  const files = await listAllFiles(repoRoot);
  const tokenRe = new RegExp(`\\b${escapeRegExp(acId)}\\b`, 'g');

  const matchedRel = files
    .map((abs) => relative(repoRoot, abs).split(sep).join('/'))
    .filter((relPath) => matchers.some((m) => m(relPath)))
    .sort();

  const results: ExplainFileResult[] = [];
  for (const relPath of matchedRel) {
    const abs = join(repoRoot, relPath);
    let raw: string;
    try {
      raw = await readFile(abs, 'utf8');
    } catch {
      continue;
    }
    const ext = extensionOf(relPath);
    let profileId: string | null = null;
    let profileReason: string;
    let spans: TestSpan[] = [];

    if (mode === 'assertion') {
      const profile = getProfileForExtension(ext);
      if (!profile) {
        profileReason =
          `no coverage profile registered for extension "${ext || '(none)'}" ` +
          '— file contributes zero spans';
      } else {
        profileId = profile.id;
        spans = findSpansForProfile(raw, profile);
        profileReason =
          spans.length > 0
            ? `scanned with profile "${profile.id}"`
            : `scanned with profile "${profile.id}", but no test block was recognized in this file`;
      }
    } else {
      profileReason = 'mention mode: no profile scan performed (whole-file token search only)';
    }

    tokenRe.lastIndex = 0;
    const occurrences: ExplainOccurrence[] = [];
    for (const m of raw.matchAll(tokenRe)) {
      const offset = m.index ?? 0;
      const line = offsetToLine(raw, offset);
      const snippet = (raw.split('\n')[line - 1] ?? '').trim().slice(0, 120);

      // Phase 239 (T4, AC-6): the qualifier rule is checked FIRST, and
      // independently of the mode rule, because the two are different
      // failures with different fixes — a bare or foreign-phase token is not
      // evidence for this phase at all (rewrite the token), whereas a
      // correctly-qualified token outside an asserting block is a span
      // problem (write an assertion). Reporting the qualifier failure as a
      // span failure would send the operator to fix the wrong thing, and
      // would contradict the gate, which refuses these for different stated
      // reasons (`../gates/coverage.ts`, T3).
      if (
        opts.expectedQualifier !== undefined &&
        !tokenHasExpectedQualifier(raw, offset, opts.expectedQualifier)
      ) {
        const containing =
          mode === 'assertion'
            ? (spans.find((s) => offset >= s.start && offset <= s.end) ?? null)
            : null;
        occurrences.push({
          line,
          snippet,
          offset,
          span:
            containing === null
              ? null
              : {
                  start: containing.start,
                  end: containing.end,
                  startLine: offsetToLine(raw, containing.start),
                  endLine: offsetToLine(raw, containing.end),
                  hasAssertion: containing.hasAssertion,
                  skipped: containing.skipped,
                },
          satisfies: false,
          reason:
            `token is not qualified for this phase — expected ` +
            `\`${opts.expectedQualifier}/${acId}\` (verification.coverageScheme is ` +
            `'phase-qualified'). A bare or foreign-phase token is not evidence for this ` +
            `phase, because AC ids restart at AC-1 every phase`,
        });
        continue;
      }

      if (mode !== 'assertion') {
        occurrences.push({
          line,
          snippet,
          offset,
          span: null,
          satisfies: true,
          reason: 'mention mode: token found (no assertion requirement)',
        });
        continue;
      }

      const containing = spans.find((s) => offset >= s.start && offset <= s.end) ?? null;
      const span: ExplainSpan | null =
        containing === null
          ? null
          : {
              start: containing.start,
              end: containing.end,
              startLine: offsetToLine(raw, containing.start),
              endLine: offsetToLine(raw, containing.end),
              hasAssertion: containing.hasAssertion,
              skipped: containing.skipped,
            };

      let satisfies: boolean;
      let reason: string;
      if (profileId === null) {
        satisfies = false;
        reason =
          `no coverage profile claims this file's extension ("${ext || '(none)'}") ` +
          '— token cannot satisfy assertion mode here';
      } else if (span === null) {
        satisfies = false;
        reason = `token found but not inside any test block recognized by profile "${profileId}"`;
      } else if (span.skipped) {
        satisfies = false;
        reason =
          `token is inside a test marked skipped (profile "${profileId}") — an intact ` +
          'assertion in a skipped test does not run and cannot satisfy assertion mode';
      } else if (!span.hasAssertion) {
        satisfies = false;
        reason = `token present but block not asserting (profile "${profileId}")`;
      } else {
        satisfies = true;
        reason = `token inside an asserting test block (profile "${profileId}") — satisfies assertion mode`;
      }
      occurrences.push({ line, snippet, offset, span, satisfies, reason });
    }

    results.push({
      file: relPath,
      extension: ext,
      profileId,
      profileReason,
      spansFound: spans.length,
      occurrences,
    });
  }

  return {
    acId,
    mode,
    ...(opts.expectedQualifier !== undefined
      ? { expectedQualifier: opts.expectedQualifier }
      : {}),
    globs,
    anyFilesMatched: matchedRel.length > 0,
    files: results,
    satisfied: results.some((f) => f.occurrences.some((o) => o.satisfies)),
  };
}

/** Best-effort recursive listing, skipping node_modules / dist / .git. */
async function listAllFiles(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (
        e.name === 'node_modules' ||
        e.name === 'dist' ||
        e.name === '.git' ||
        e.name === '.turbo'
      ) {
        continue;
      }
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(abs);
      } else if (e.isFile()) {
        out.push(abs);
      }
    }
  }
  return out;
}

/**
 * Lowercase file extension (with leading dot) of a forward-slashed relative
 * path, e.g. `packages/x/a.test.ts` → `.ts`, `_test.go` → `.go`. Returns
 * `''` for an extensionless file, which no registered profile claims (Phase
 * 167, T6).
 */
function extensionOf(relPath: string): string {
  const base = relPath.slice(relPath.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot === -1 ? '' : base.slice(dot).toLowerCase();
}

/**
 * Compile a glob pattern (subset: `**`, `*`, literal segments) into a
 * predicate over forward-slashed relative paths. Examples:
 *   `packages/**\/*.test.ts` → matches `packages/core/tests/foo.test.ts`
 *   `**\/*.test.ts` → matches `apps/api/__tests__/bar.test.ts`
 */
function toMatcher(pattern: string): (relPath: string) => boolean {
  const re = globToRegExp(pattern);
  return (p) => re.test(p);
}

function globToRegExp(pattern: string): RegExp {
  // Tokenize: split on '/', then handle '**' specially.
  const parts = pattern.split('/');
  const reParts: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    if (part === '**') {
      // Match zero-or-more path segments.
      // If there is a following part, allow `**/x` to match `x` too (zero segments).
      const next = parts[i + 1];
      if (next !== undefined) {
        reParts.push('(?:[^/]+/)*');
        // Consume the trailing slash semantics; let the next iteration add `next` literally.
      } else {
        reParts.push('.*');
      }
      continue;
    }
    // Escape regex specials except `*`.
    const seg = part
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '[^/]*');
    reParts.push(seg);
    if (i < parts.length - 1) reParts.push('/');
  }
  return new RegExp('^' + reParts.join('') + '$');
}

