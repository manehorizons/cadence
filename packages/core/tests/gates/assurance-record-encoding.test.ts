import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root from this test file's location:
// packages/core/tests/gates → ../../../../ (repo root)
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

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

const PACKAGES = ['core', 'types', 'host-claude-code', 'host-codex', 'host-toolkit', 'testkit'];

/**
 * 272-01 (T1) — corpus-wide regression guard against rec-20260811-002: a raw
 * NUL byte in a TypeScript source file makes it grep-classify as binary
 * (`grep` silently suppresses every match in that file), which is how the
 * NUL at assurance-record.ts:87 went unnoticed. Provider/model identity
 * strings are the only place this codebase intentionally needs a byte value
 * that can't collide with real content — an escaped Unicode NUL codepoint in
 * a template literal expresses that safely without making the source file
 * itself binary.
 */
describe('no raw NUL byte in any package src file', () => {
  it('272-01/AC-1: assurance-record.ts and every other packages/*/src/**/*.ts file is free of raw 0x00 bytes', () => {
    const offenders: Array<{ file: string; offset: number }> = [];
    for (const pkg of PACKAGES) {
      const srcDir = join(REPO_ROOT, 'packages', pkg, 'src');
      for (const file of walk(srcDir)) {
        if (!file.endsWith('.ts')) continue;
        const bytes = readFileSync(file);
        const offset = bytes.indexOf(0);
        if (offset !== -1) {
          offenders.push({ file, offset });
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
