import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

// AC-3 (phase 257) requires that `cadence summary verify <phase> <num>`
// still validates every existing summary's contentHash after T1's Findings
// rendering change — proving rendering never participated in
// `computeSummaryContentHash`'s input. `.cadence/phases/**` is git-tracked
// (see CLAUDE.md's single-commit settle convention: phase artifacts land
// with source+tests+docs in the same commit), so a normal checkout of this
// branch — worktree or primary — carries the full historical corpus, not
// just phase 257's own in-flight DRAFT. This test walks that real corpus
// rather than a synthetic fixture, because AC-3's claim is specifically
// about every *existing* summary, not a representative sample.
//
// Phase 266 T2 (rec-20260806-010): this test originally spawned one
// `cadence summary verify <phase> <num>` CLI process PER historical
// SUMMARY.json (275+ and growing) at concurrency 12 — subprocess-spawn
// overhead × corpus size hit CI's 120s timeout on Windows. `cadence summary
// verify-all` (phase 266 T1) walks the same corpus in-process with a single
// invocation, reusing the exact same load+verify logic per file, so this
// suite now spawns the CLI exactly once (in `beforeAll`, shared by both
// `it()` blocks below) instead of N times. The original 257-01/AC-3,
// 264-01/AC-2 test title is kept byte-for-byte (its assertions were
// rewritten to use the single verify-all invocation); this phase's own AC
// claim gets its own new test block below per the phase 266 DRAFT
// Boundaries ("Do NOT add a third AC token to ... the existing ... test
// title").
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CADENCE_CLI = join(REPO_ROOT, 'packages', 'core', 'dist', 'cli', 'index.js');
const PHASES_DIR = join(REPO_ROOT, '.cadence', 'phases');

function walkSummaries(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSummaries(full));
    } else if (entry.isFile() && entry.name.endsWith('-SUMMARY.json')) {
      out.push(full);
    }
  }
  return out;
}

function runVerifyAll(cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [CADENCE_CLI, 'summary', 'verify-all'], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('error', reject);
    p.on('exit', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

describe('cadence summary verify-all - repo-wide sweep over every existing summary (phase 257 T3, phase 266 T2)', () => {
  // Spawned once for the whole suite (not per-it, not per-file) — that
  // single spawn is the entire point of phase 266 T2.
  let files: string[];
  let result: { code: number; stdout: string; stderr: string };
  let checked: number;
  let failed: number;

  beforeAll(async () => {
    files = walkSummaries(PHASES_DIR);
    result = await runVerifyAll(REPO_ROOT);

    // `cadence summary verify-all` prints one trailing summary line:
    // "<N> checked: <M> MATCH, <K> NO_HASH, <F> failed". Parse it to
    // extract the failure count independent of exit code (belt-and-braces:
    // exit code is also asserted in each `it()` below).
    const summaryLineMatch = /^(\d+) checked: \d+ MATCH, \d+ NO_HASH, (\d+) failed$/m.exec(
      result.stdout,
    );
    if (!summaryLineMatch) {
      throw new Error(
        `expected a "<N> checked: ... failed" summary line in verify-all stdout, got:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
      );
    }
    checked = Number(summaryLineMatch[1]);
    failed = Number(summaryLineMatch[2]);
  });

  it(
    '257-01/AC-3, 264-01/AC-2: every existing <id>-SUMMARY.json under .cadence/phases verifies with zero failures',
    () => {
      // Sanity floor: fail loudly if the walk found suspiciously few files
      // (e.g. pointed at the wrong directory) rather than passing vacuously.
      expect(files.length).toBeGreaterThan(100);

      // `cadence summary verify-all` exits non-zero only when at least one
      // file was a MISMATCH (a hand-edited artifact) or failed to
      // load/parse/validate — never on the informational NO_HASH case
      // (pre-phase-223 records, or refused settles that recorded no
      // findings) — so any reported failure here is always genuine, not a
      // false positive from old records.
      if (failed > 0 || result.code !== 0) {
        throw new Error(
          `verify-all reported ${failed}/${checked} failure(s) (exit ${result.code}):\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }

      expect(result.code).toBe(0);
      expect(failed).toBe(0);
    },
  );

  it('266-01/AC-2: a single `cadence summary verify-all` invocation — not one CLI process per file — covers the whole historical corpus with zero failures', () => {
    // The CLI's own in-process walk should account for at least every file
    // this test found independently (>= rather than strict equality: a
    // concurrently-running settle elsewhere in this live repo could add a
    // new SUMMARY.json between the two walks without that being a bug).
    expect(checked).toBeGreaterThanOrEqual(files.length);
    expect(checked).toBeGreaterThan(100);
    expect(failed).toBe(0);
    expect(result.code).toBe(0);
  });
});
