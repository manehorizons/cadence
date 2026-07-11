import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { findTestSpans } from './test-spans.js';

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
}

const DEFAULT_GLOBS = ['packages/**/*.test.ts', 'packages/**/*.test.tsx'];

const AC_TOKEN_RE = /\bAC-\d+\b/g;

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
      const spans = findTestSpans(raw).filter((s) => s.hasAssertion);
      AC_TOKEN_RE.lastIndex = 0;
      const seen = new Set<string>();
      for (const m of raw.matchAll(AC_TOKEN_RE)) {
        const id = m[0]!;
        const key = `${id}@${relPath}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const offset = m.index ?? 0;
        const before = raw.slice(0, offset);
        const lineNo = before.split('\n').length;
        const lineText = (raw.split('\n')[lineNo - 1] ?? '').trim().slice(0, 120);
        const arr = out.get(id) ?? [];
        arr.push({
          file: relPath,
          line: lineNo,
          snippet: lineText,
          qualifying: spans.some((s) => offset >= s.start && offset <= s.end),
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

/**
 * Assertion mode: AC ids that have ≥1 recorded ref but none that qualifies
 * (i.e. mentioned somewhere, but never inside an asserting it()/test() block).
 * Empty in mention mode (refs there carry no `qualifying` flag → treated as
 * not-weak as long as they exist).
 */
export function weaklyLinkedAcs(
  acIds: string[],
  coverage: Map<AcId, TestRef[]>,
): string[] {
  return acIds.filter((id) => {
    const refs = coverage.get(id) ?? [];
    return refs.length > 0 && refs.every((r) => r.qualifying === false);
  });
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

