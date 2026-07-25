import type { Command } from 'commander';
import { runVerifyCoverage, runVerifyPhase } from '../../services/verify.js';
import { processIO } from '../../services/io.js';

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

  cmd
    .command('phase [phase] [num]')
    .description(
      "Re-derive whether a settled phase's AC coverage still holds against the current working tree (read-only, no active loop state required)",
    )
    .option('--changed', 'discover phases via git diff against --base instead of an explicit phase/num')
    .option('--base <ref>', 'base ref to diff against when --changed is set')
    .option('--json', 'emit machine-readable JSON instead of a human-readable report')
    .option('--no-test-run', 'skip the optional verification.testCommand re-run')
    .action(
      async (
        phase: string | undefined,
        num: string | undefined,
        opts: { changed?: boolean; base?: string; json?: boolean; testRun?: boolean },
      ) => {
        const res = await runVerifyPhase(
          {
            cwd: process.cwd(),
            ...(phase !== undefined ? { phase } : {}),
            ...(num !== undefined ? { num } : {}),
            ...(opts.changed !== undefined ? { changed: opts.changed } : {}),
            ...(opts.base !== undefined ? { base: opts.base } : {}),
            ...(opts.json !== undefined ? { json: opts.json } : {}),
            ...(opts.testRun !== undefined ? { testRun: opts.testRun } : {}),
          },
          processIO(),
        );
        process.exitCode = res.exitCode;
      },
    );
}
