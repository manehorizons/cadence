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

  it('267-01/AC-4: mock-abstention (T1-T3) touched no historical SUMMARY.json — the same repo-wide sweep still reports zero failures post-267', () => {
    // Phase 267's DRAFT boundary forbids adding a third AC token to the
    // pre-existing test titles above (phase 266's own precedent) — this is
    // a new it() reusing the same beforeAll-computed sweep, not a token
    // grafted onto an existing assertion.
    expect(checked).toBeGreaterThan(100);
    expect(failed).toBe(0);
    expect(result.code).toBe(0);
  });

  it("274-01/AC-4: DeepVerdictZ's additive `unobservable` field (phase 274 T3) touched no historical SUMMARY.json — the same repo-wide sweep still exits 0 corpus-wide, run against the local built CLI after the schema change", () => {
    // Same shared beforeAll sweep, run against `packages/core/dist/cli/
    // index.js` (the local build, never the global `cadence` on PATH — see
    // this file's own CADENCE_CLI constant) built AFTER Phase 274 T3's
    // additive `unobservable: z.boolean().optional()` change to
    // `DeepVerdictZ` in packages/types/src/summary.ts. A stale pre-T3 dist
    // would also report zero failures here (an absent optional field parses
    // fine under either schema), which would make this assertion vacuous —
    // this is why the dispatch report for this task independently confirms
    // (outside this test, via `grep -c unobservable packages/types/dist/*.js`
    // and packages/core/dist) that the built artifacts actually carry the
    // new field before this test is trusted as meaningful.
    expect(checked).toBeGreaterThan(100);
    expect(failed).toBe(0);
    expect(result.code).toBe(0);
  });

  it("280-01/AC-5: SummaryZ.taskResults[]'s additive `execution`/`isolation`/`modelClass` fields (phase 280 T13) touched no historical SUMMARY.json — the same repo-wide sweep still exits 0 corpus-wide, run against the local built CLI after the schema change", () => {
    // Same shared beforeAll sweep, run against `packages/core/dist/cli/
    // index.js` (the local build, never the global `cadence` on PATH — see
    // this file's own CADENCE_CLI constant) built AFTER Phase 280 T13's
    // additive `execution`/`isolation`/`modelClass: z.enum([...]).optional()`
    // fields were added to `SummaryZ.taskResults[]` in
    // packages/types/src/summary.ts. Mirrors the 274-01/AC-4 block above.
    expect(checked).toBeGreaterThan(100);
    expect(failed).toBe(0);
    expect(result.code).toBe(0);
  });

  it("284-01/AC-4: phase 284's own edits — the prose amendment to phase 282's second AC, the filed recommendation, and this phase's new test files — did not push the corpus-wide sweep above 0 MISMATCH / 0 failed", () => {
    // Same shared beforeAll sweep, reused rather than re-run (one spawn for
    // the whole file remains phase 266 T2's fix). Phase 284 is a
    // documentation/ledger/test-coverage reconciliation: it amends a prose
    // heading in a historical DRAFT, files a recommendation, and adds test
    // files. None of those is a SUMMARY.json, so the sweep must come back
    // exactly as clean after this phase as it was before it.
    expect(checked).toBeGreaterThan(100);
    expect(failed).toBe(0);
    expect(result.code).toBe(0);

    // This phase's AC-4 names "0 MISMATCH" separately from "0 failed", and
    // no block above asserts anything about MISMATCH at all. `verify-all`
    // prints a literal `<phase>/<id>: MISMATCH` line per tampered file, so
    // that substring's absence from stdout is the direct check.
    // Deliberately NOT `not.toContain('MATCH')`: the trailing summary line
    // always carries a "<N> MATCH" count, which would make that vacuously
    // impossible to satisfy.
    expect(result.stdout).not.toContain('MISMATCH');
  });

  it("282-01/AC-4, 284-01/AC-5: `cadence summary verify-all` — the command phase 282's AC-4 names — passes against the live corpus, executed for real by this suite's own subprocess rather than string-matched out of a hand-written transcript", () => {
    // Why this block exists, and why it carries two phase-qualified tokens.
    // Phase 282's real (host-cli) deep-verify returned pass:false on its
    // AC-4, reasoning that the linked test "only string-matches a report; it
    // neither runs summary verify-all nor verifies phase-id enumeration in
    // the settle summary, so the operational AC is untested". Phase 284
    // judged that objection in two independently-resolved halves
    // (dec-20260820-002): the phase-id-enumeration half is already covered
    // by existing asserting blocks in packages/core/tests/docs/
    // phase282-coverage-drift-report.test.ts, which enumerate the 3 drifted
    // and the 12 could-not-verify phase ids by id; the runs-summary-verify-
    // all half was genuinely open, and this block is what closes it —
    // retroactively granting real coverage to phase 282's own AC-4 (the
    // `282-01/AC-4` token), which is also, one-for-one, what phase 284's own
    // AC-5 ("282-01/AC-4's deep-verify objection resolved on its
    // 'runs summary verify-all' clause") requires as its evidence (the
    // `284-01/AC-5` token). One assertion body genuinely proves both claims;
    // this mirrors the `257-01/AC-3, 264-01/AC-2` combined-token precedent
    // already established elsewhere in this same file.
    //
    // What makes this operationally real rather than another string-match:
    // `checked` / `failed` / `result.code` all come from a live
    // `node <dist>/cli/index.js summary verify-all` subprocess spawned in
    // this file's `beforeAll`, and that `beforeAll` *throws* when no
    // "<N> checked: ... failed" line parses out of its stdout — so a command
    // that failed to run, or that stopped emitting its report, fails this
    // suite loudly instead of passing vacuously against stale prose.
    expect(result.stdout).toMatch(/^\d+ checked: \d+ MATCH, \d+ NO_HASH, \d+ failed$/m);

    // A monotone floor, not an equality. 294 is the corpus size pinned by
    // the point-in-time verify-all transcript asserted in
    // phase282-coverage-drift-report.test.ts — left untouched by this phase,
    // since those numbers are legitimately point-in-time per that file's own
    // doc comment. `.cadence/phases/**` is append-only, so the live count can
    // only grow past it; a live count that had *fallen* below the attested
    // one would mean historical records went missing. Do not "fix" this into
    // an equality as the corpus grows.
    expect(checked).toBeGreaterThanOrEqual(294);

    expect(failed).toBe(0);
    expect(result.code).toBe(0);
  });
});
