import type { Command } from 'commander';
import { loadConfig } from '../../config/loader.js';
import { explainAcCoverage, type CoverageExplainResult } from '../../verify/coverage.js';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';

/**
 * `cadence verify coverage --explain AC-N` (phase 167, T8, AC-8) — a
 * read-only diagnostic that surfaces the same facts the real coverage gate
 * (`../../gates/coverage.ts`) computes internally but never prints: which
 * test files matched the configured globs, which profile (if any) scanned
 * each one, every occurrence of the target AC token, which span (if any)
 * contains each occurrence, and a plain-language reason the occurrence does
 * or doesn't satisfy the configured coverage mode. Never mutates
 * `.cadence/state.json` or any other project state — it doesn't require an
 * active BUILD/phase and works standalone against any repo with (or
 * without) a `.cadence/config.json`.
 *
 * Pure core / impure shell (CLAUDE.md house pattern): `explainAcCoverage`
 * (`../../verify/coverage.js`) is the core — it takes repoRoot + acId +
 * explicit globs/mode and does only read-only fs access. This module is the
 * thin shell: it gathers the facts (cwd, config-derived globs/mode,
 * argv), calls the core, and renders — human report or `--json`, both on
 * stdout per CLAUDE.md's stdout contract; errors/diagnostics go to stderr.
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
 * Thin service wrapper: gathers facts (config-derived globs/mode) and calls
 * the pure `explainAcCoverage` core, then renders. No state is read from or
 * written to `.cadence/state.json` — only `.cadence/config.json` (read-only)
 * and the glob-matched test files (read-only) are ever touched.
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
  try {
    const config = await loadConfig(args.cwd);
    globs = config.verification?.testGlobs;
    mode = config.verification?.coverageMode ?? 'mention';
  } catch (err) {
    io.err(
      `verify coverage failed: could not load config: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return { exitCode: 1 };
  }

  const result = await explainAcCoverage(args.cwd, acId, { globs, mode });

  if (args.json) {
    io.out(JSON.stringify(result, null, 2) + '\n');
  } else {
    io.out(renderExplainHuman(result));
  }

  return { exitCode: 0, data: result };
}

export function registerVerifyCommand(program: Command): void {
  const cmd = program
    .command('verify')
    .description('Read-only verification diagnostics');

  cmd
    .command('coverage')
    .description('Explain why an AC does or does not satisfy coverage (read-only, no state mutation)')
    .requiredOption('--explain <acId>', 'AC id to explain, e.g. AC-8')
    .option('--json', 'emit machine-readable JSON instead of a human-readable report')
    .action(async (opts: { explain: string; json?: boolean }) => {
      const res = await runVerifyCoverage(
        { cwd: process.cwd(), explain: opts.explain, json: opts.json },
        processIO(),
      );
      process.exitCode = res.exitCode;
    });
}
