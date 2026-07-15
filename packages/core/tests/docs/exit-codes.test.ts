import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root paths from this test file's location:
// packages/core/tests/docs → ../../../../docs/reference/exit-codes.md
// packages/core/tests/docs → ../../src (packages/core/src)
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const EXIT_CODES_MD = join(REPO_ROOT, 'docs', 'reference', 'exit-codes.md');
const CORE_SRC = join(REPO_ROOT, 'packages', 'core', 'src');

const SKIP_DIRS = new Set(['node_modules', 'dist']);

/** Recursively collect every file path under `dir` (no glob dependency — plain readdirSync walk). */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Every distinct integer literal used as a process exit-code value in `packages/core/src`. */
function collectExitCodesInUse(): Set<number> {
  const codes = new Set<number>();
  const patterns = [
    /exitCode:\s*(\d+)/g,
    /process\.exitCode\s*=\s*(\d+)/g,
    /process\.exit\(\s*(\d+)\s*\)/g,
    // Ternary assignments (e.g. `process.exitCode = report.ok ? 0 : 1;` or
    // `exitCode: report.ok ? 0 : 1`) don't have a literal directly adjacent
    // to `exitCode:`/`exitCode =`, so the three patterns above miss both
    // branch values. `.` doesn't match newlines, so this stays confined to
    // the same line as the ternary (deliberately not `[\s\S]*?`, which could
    // otherwise skip past this statement to an unrelated later ternary).
    /exitCode\s*[:=]\s*.*?\?\s*(\d+)\s*:\s*(\d+)/g,
  ];
  for (const file of walk(CORE_SRC)) {
    if (!/\.(ts|tsx|js|cjs|mjs)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        for (const value of match.slice(1)) {
          if (value !== undefined) codes.add(Number(value));
        }
      }
    }
  }
  return codes;
}

/** Every integer documented as an exit code in the markdown table's first column. */
function collectExitCodesDocumented(md: string): Set<number> {
  const codes = new Set<number>();
  // Table rows look like: | `0` | Success. ... |
  for (const match of md.matchAll(/^\|\s*`(\d+)`\s*\|/gm)) {
    const value = match[1];
    if (value !== undefined) codes.add(Number(value));
  }
  return codes;
}

describe('exit-code taxonomy doc matches real exit-code usage', () => {
  const md = readFileSync(EXIT_CODES_MD, 'utf8');
  const used = collectExitCodesInUse();
  const documented = collectExitCodesDocumented(md);

  it('finds a non-empty set of exit codes actually used in packages/core/src (AC-3)', () => {
    expect(used.size).toBeGreaterThan(0);
  });

  it('finds a non-empty set of exit codes documented in exit-codes.md (AC-3)', () => {
    expect(documented.size).toBeGreaterThan(0);
  });

  it('documents every exit code actually used in source (AC-3)', () => {
    const undocumented = [...used].filter((code) => !documented.has(code));
    expect(undocumented, `codes used in source but missing from exit-codes.md: ${undocumented.join(', ')}`).toEqual(
      [],
    );
  });

  it('does not document a code no longer used in source (AC-3)', () => {
    const dead = [...documented].filter((code) => !used.has(code));
    expect(dead, `codes documented in exit-codes.md but not used anywhere in source: ${dead.join(', ')}`).toEqual([]);
  });

  it('matches the confirmed closed set {0, 1, 2, 3} (AC-3)', () => {
    expect(used).toEqual(new Set([0, 1, 2, 3]));
    expect(documented).toEqual(new Set([0, 1, 2, 3]));
  });
});
