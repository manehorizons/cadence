import { loadConfig } from '../config/loader.js';
import { explainAcCoverage, type CoverageExplainResult } from '../verify/coverage.js';
import { replayPhaseCoverage, type PhaseReplayResult } from '../verify/phase-replay.js';
import { discoverChangedPhases, GitDiffError } from '../git/diff-strict.js';
import { runTestCommand } from '../verify/test-runner.js';
import { assertSafePhaseSlug, derivePhaseTaskId } from '../phases/id.js';
import { SimpleStateBackend } from '../state/simple.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence verify coverage --explain AC-N` (phase 167, T8, AC-8) — a
 * read-only diagnostic that surfaces the same facts the real coverage gate
 * (`../gates/coverage.ts`) computes internally but never prints: which
 * test files matched the configured globs, which profile (if any) scanned
 * each one, every occurrence of the target AC token, which span (if any)
 * contains each occurrence, and a plain-language reason the occurrence does
 * or doesn't satisfy the configured coverage mode. Never mutates
 * `.cadence/state.json` or any other project state — it doesn't require an
 * active BUILD/phase and works standalone against any repo with (or
 * without) a `.cadence/config.json`.
 *
 * Pure core / impure shell (CLAUDE.md house pattern): `explainAcCoverage`
 * (`../verify/coverage.js`) is the core — it takes repoRoot + acId +
 * explicit globs/mode and does only read-only fs access. This module is the
 * thin shell: it gathers the facts (cwd, config-derived globs/mode,
 * argv), calls the core, and renders — human report or `--json`, both on
 * stdout per CLAUDE.md's stdout contract; errors/diagnostics go to stderr.
 *
 * Relocated from `cli/commands/verify.ts` into `services/verify.ts` (phase
 * 221 T3) so `mcp/tools.ts` can import it directly. Pure relocation — CLI
 * behavior, output text, flags, and exit codes are unchanged.
 */

export interface VerifyCoverageArgs {
  cwd: string;
  explain: string;
  json?: boolean | undefined;
}

function renderSpan(span: CoverageExplainResult['files'][number]['occurrences'][number]['span']): string {
  if (span === null) return '(no containing span)';
  return `lines ${span.startLine}-${span.endLine}, hasAssertion: ${span.hasAssertion}`;
}

/** Pure rendering of a `CoverageExplainResult` into the human-readable report. */
export function renderExplainHuman(result: CoverageExplainResult): string {
  const lines: string[] = [];
  lines.push(`cadence verify coverage --explain ${result.acId}`);
  lines.push('');
  lines.push(`mode: ${result.mode}`);
  // Phase 239 (T4, AC-6): only rendered under the qualified scheme, so the
  // bare report stays byte-for-byte what it has always been.
  if (result.expectedQualifier !== undefined) {
    lines.push(
      `scheme: phase-qualified (expected token: ${result.expectedQualifier}/${result.acId})`,
    );
  }
  lines.push(`globs: ${result.globs.join(', ')}`);
  lines.push(`any files matched globs: ${result.anyFilesMatched}`);
  lines.push('');

  if (!result.anyFilesMatched) {
    lines.push('No test files matched the configured globs — check verification.testGlobs.');
    lines.push('');
    lines.push(`Overall: NOT SATISFIED (no files to scan)`);
    return lines.join('\n') + '\n';
  }

  for (const f of result.files) {
    const profileLabel = f.profileId === null ? 'none' : f.profileId;
    lines.push(`${f.file}  profile: ${profileLabel}  spans found: ${f.spansFound}`);
    lines.push(`  ${f.profileReason}`);
    if (f.maskDiagnostics !== undefined && f.maskDiagnostics.length > 0) {
      for (const d of f.maskDiagnostics) {
        lines.push(`  [mask diagnostic] ${d}`);
      }
    }
    if (f.occurrences.length === 0) {
      lines.push(`  (no occurrence of ${result.acId} in this file)`);
    }
    for (const occ of f.occurrences) {
      lines.push(`  line ${occ.line}: ${occ.snippet}`);
      lines.push(`    span: ${renderSpan(occ.span)}`);
      lines.push(`    satisfies: ${occ.satisfies} — ${occ.reason}`);
    }
    lines.push('');
  }

  lines.push(`Overall: ${result.satisfied ? 'SATISFIED' : 'NOT SATISFIED'}`);
  return lines.join('\n') + '\n';
}

/**
 * Thin service wrapper: gathers facts (config-derived globs/mode/scheme) and
 * calls the pure `explainAcCoverage` core, then renders. Nothing is ever
 * written: `.cadence/config.json` and the glob-matched test files are read
 * only.
 *
 * Phase 239 (T4, AC-6): under `verification.coverageScheme: 'phase-qualified'`
 * this additionally performs a best-effort read of `.cadence/state.json` to
 * recover the active draft id, which is the qualifier the gate itself uses.
 * That read is the one state access here, it is read-only, and it degrades
 * per the house rule for observation code — a missing, unreadable, or
 * loop-less state contributes no qualifier rather than throwing. Because
 * silently falling back to an unqualified explain would make this diagnostic
 * disagree with the gate it exists to explain, the degraded path prints a
 * loud stderr notice (CLAUDE.md: The Quiet Fallback) and says plainly that
 * the report is unqualified.
 */
export async function runVerifyCoverage(
  args: VerifyCoverageArgs,
  io: CommandIO,
): Promise<CommandResult> {
  const acId = args.explain.trim();
  if (acId === '') {
    io.err('verify coverage failed: --explain requires a non-empty AC id\n');
    return { exitCode: 1 };
  }

  let globs: string[] | undefined;
  let mode: 'mention' | 'assertion' = 'mention';
  let scheme: 'bare' | 'phase-qualified' = 'bare';
  try {
    const config = await loadConfig(args.cwd);
    globs = config.verification?.testGlobs;
    mode = config.verification?.coverageMode ?? 'mention';
    scheme = config.verification?.coverageScheme ?? 'bare';
  } catch (err) {
    io.err(
      `verify coverage failed: could not load config: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return { exitCode: 1 };
  }

  // Phase 239 (T4): resolve the qualifier the gate would use. Best-effort by
  // design — this diagnostic must stay usable outside an active loop.
  let expectedQualifier: string | undefined;
  if (scheme === 'phase-qualified') {
    let activeDraft: string | null = null;
    try {
      activeDraft = (await new SimpleStateBackend(args.cwd).readState()).activeDraft;
    } catch {
      activeDraft = null;
    }
    if (typeof activeDraft === 'string' && /^[A-Za-z0-9._-]+$/.test(activeDraft)) {
      expectedQualifier = activeDraft;
    } else {
      io.err(
        `verify coverage: verification.coverageScheme is 'phase-qualified', but no usable ` +
          `active draft id was found, so the expected token prefix cannot be built. The ` +
          `report below is UNQUALIFIED and will not match what the settle gate enforces. ` +
          `Run this from a repo with an active draft to see scheme-aware results.\n`,
      );
    }
  }

  const result = await explainAcCoverage(args.cwd, acId, {
    globs,
    mode,
    ...(expectedQualifier !== undefined ? { expectedQualifier } : {}),
  });

  if (args.json) {
    io.out(JSON.stringify(result, null, 2) + '\n');
  } else {
    io.out(renderExplainHuman(result));
  }

  return { exitCode: 0, data: result };
}

/**
 * `cadence verify phase [phase] [num]` (phase 204, T5) — a state-independent,
 * phase-scoped re-derivation of whether a settled phase's recorded AC
 * coverage still holds, closing rec-20260709-003. Unlike `verify coverage
 * --explain`, this never requires an active BUILD/loop and works against a
 * fresh checkout that never ran the phase locally — it reads only the
 * phase's committed `DRAFT.md` + `SUMMARY.json` (via `replayPhaseCoverage`)
 * plus, optionally, the current working tree's test files and the
 * configured `verification.testCommand`.
 *
 * Two modes:
 * - single-phase: explicit `phase` + `num` args, re-derives that one phase.
 * - `--changed --base <ref>`: discovers every phase whose `SUMMARY.json`
 *   changed between `base` and `HEAD` (`discoverChangedPhases`) and
 *   re-derives all of them — the shape `cadence init --ci`'s generated
 *   workflow calls in CI.
 *
 * Exit codes are pinned: 0 clean (no drift, test command passed or wasn't
 * run), 1 drift found or the test command failed, 2 usage error (neither
 * mode selected, `--changed` without `--base`) or an input error (git diff
 * failure, missing/malformed DRAFT or SUMMARY, config load failure).
 */
export interface VerifyPhaseArgs {
  cwd: string;
  phase?: string;
  num?: string;
  changed?: boolean;
  base?: string;
  json?: boolean;
  /** Commander's --no-test-run negates this to false; default (undefined) means "run it". */
  testRun?: boolean;
}

interface VerifyPhaseTestRun {
  ran: boolean;
  passed?: boolean;
}

interface VerifyPhaseJson {
  mode: 'single' | 'changed';
  results: PhaseReplayResult[];
  testRun: VerifyPhaseTestRun | null;
}

export async function runVerifyPhase(args: VerifyPhaseArgs, io: CommandIO): Promise<CommandResult> {
  let config;
  try {
    config = await loadConfig(args.cwd);
  } catch (err) {
    io.err(
      `verify phase failed: could not load config: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return { exitCode: 2 };
  }
  const coverageMode = config.verification?.coverageMode ?? 'mention';
  const mode: 'single' | 'changed' = args.changed ? 'changed' : 'single';

  let targets: { phase: string; id: string }[];
  if (args.changed) {
    if (!args.base) {
      io.err('verify phase failed: --changed requires --base <ref>\n');
      return { exitCode: 2 };
    }
    try {
      targets = discoverChangedPhases(args.cwd, args.base).map((c) => ({ phase: c.phase, id: c.id }));
    } catch (err) {
      const message = err instanceof GitDiffError ? err.message : String(err);
      io.err(`verify phase failed: ${message}\n`);
      return { exitCode: 2 };
    }
  } else if (args.phase && args.num) {
    let safePhase: string;
    try {
      safePhase = assertSafePhaseSlug(args.phase);
    } catch (err) {
      io.err(`verify phase failed: ${err instanceof Error ? err.message : String(err)}\n`);
      return { exitCode: 2 };
    }
    targets = [{ phase: safePhase, id: derivePhaseTaskId(safePhase, args.num) }];
  } else {
    io.err('verify phase failed: pass [phase] [num], or --changed --base <ref>\n');
    return { exitCode: 2 };
  }

  if (targets.length === 0) {
    io.out('verify phase: nothing to verify — no changed SUMMARY.json files against the given base\n');
    const empty: VerifyPhaseJson = { mode, results: [], testRun: null };
    if (args.json) io.out(JSON.stringify(empty, null, 2) + '\n');
    return { exitCode: 0, data: empty };
  }

  const results: PhaseReplayResult[] = [];
  for (const t of targets) {
    const outcome = await replayPhaseCoverage(args.cwd, t.phase, t.id, {
      coverageMode,
      ...(config.verification?.testGlobs ? { testGlobs: config.verification.testGlobs } : {}),
    });
    if (!outcome.ok) {
      io.err(`verify phase failed: ${outcome.message}\n`);
      return { exitCode: 2 };
    }
    results.push(outcome.data);
  }

  let testRun: VerifyPhaseTestRun | null = null;
  if (args.testRun !== false) {
    const testResult = await runTestCommand(args.cwd, config.verification?.testCommand);
    testRun = testResult.ran ? { ran: true, passed: testResult.ok } : { ran: false };
    if (testResult.ran && !testResult.ok) {
      io.err(`verify phase: test command failed: ${testResult.command} exited ${testResult.exitCode}\n`);
    }
  }

  const driftFound = results.some((r) => r.driftCount > 0);
  const testFailed = testRun?.ran === true && testRun.passed === false;

  // Phase 239 T8 (AC-9, degradation-notice fix): an indeterminate result is
  // a degraded verdict — no drift could be substantiated either way — and
  // CLAUDE.md's "The Quiet Fallback" requires every degradation to print a
  // loud stderr notice regardless of output mode. Emitted BEFORE the
  // --json/human branch below so it reaches stderr in both: --json owns
  // stdout as a contract, so a consumer piping/parsing stdout (or a CI
  // workflow gating on exit code alone, e.g. `init/ci-workflow.ts`) would
  // otherwise never see that the "no drift" it's trusting is unsubstantiated.
  for (const r of results) {
    if (r.indeterminate) {
      io.err(
        `verify phase: ${r.phase}/${r.id}: ${
          r.note ?? 'pre-scheme coverage is not phase-attributable and therefore unverifiable'
        }\n`,
      );
    }
  }

  const payload: VerifyPhaseJson = { mode, results, testRun };
  if (args.json) {
    io.out(JSON.stringify(payload, null, 2) + '\n');
  } else {
    for (const r of results) {
      // Phase 239 T8 (AC-9, headline fix): "no drift" asserts a
      // substantiated clean bill of health — an indeterminate phase has NO
      // substantiated verdict either way, so the headline must say so
      // explicitly rather than reuse the "no drift" wording that a
      // `grep drifted` or `head -1` consumer would read as a real pass.
      const headline = r.indeterminate
        ? 'coverage NOT VERIFIED (SUMMARY records no coverage scheme)'
        : r.driftCount === 0
          ? 'no drift'
          : `${r.driftCount} AC(s) drifted`;
      io.out(`${r.phase}/${r.id}: ${headline}\n`);
      if (r.indeterminate) {
        io.out(
          `  ${r.note ?? 'pre-scheme coverage is not phase-attributable and therefore unverifiable'}\n`,
        );
      }
      for (const ac of r.perAc.filter((a) => a.drift)) {
        io.out(`  ${ac.id}: recorded PASS (executed), no longer covered by its linked test\n`);
      }
    }
    if (testRun?.ran) {
      io.out(
        `test command: ${testRun.passed ? 'passed' : 'FAILED'} ` +
          `(suite-wide result, not attributed to a specific AC)\n`,
      );
    }
  }

  return { exitCode: driftFound || testFailed ? 1 : 0, data: payload };
}
