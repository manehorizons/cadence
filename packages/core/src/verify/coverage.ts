import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, relative, sep } from 'node:path';

export type AcId = `AC-${number}` | string;

export interface TestRef {
  /** Path relative to `repoRoot`, forward-slashed. */
  file: string;
  /** 1-based line number where the AC token first appeared. */
  line: number;
  /** Trimmed snippet of the matching line (≤120 chars). */
  snippet: string;
}

export interface CoverageScanOptions {
  /**
   * Glob-ish patterns to match test files. Default scans the workspace
   * `packages/**\/*.test.ts`. The implementation supports `**` (any depth)
   * and `*` (any chars within a segment); no brace expansion or character
   * classes — keep the convention narrow + dependency-free.
   */
  globs?: string[];
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
 * Returns the list of AC ids that have zero linked tests. Useful for the
 * settle gate's refusal message.
 */
export function uncoveredAcs(
  acIds: string[],
  coverage: Map<AcId, TestRef[]>,
): string[] {
  return acIds.filter((id) => (coverage.get(id) ?? []).length === 0);
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

