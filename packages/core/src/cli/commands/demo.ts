import type { Command } from 'commander';
import { runDemo } from '../../demo/run.js';
import { processIO } from '../../services/io.js';

/**
 * `cadence demo` — the non-interactive, npx-reachable refuse-then-succeed
 * walkthrough (phase 278). Mirrors `registerTutorialCommand`'s shape; see
 * `demo/run.ts` for the actual DRAFT→BUILD→SETTLE sandbox logic.
 *
 * Flag defaults are deliberately inverted from `cadence tutorial`: `cadence
 * demo` never pauses unless `--interactive`/`-i` is passed, so it is safe to
 * run unattended (bare `npx`, CI, an agent shell).
 */
export function registerDemoCommand(program: Command): void {
  program
    .command('demo')
    .description(
      'Run one real DRAFT→BUILD→SETTLE loop — including the moment settle refuses (non-interactive by default)',
    )
    .option('-i, --interactive', 'pause between beats when running in a TTY (default: fully non-interactive)')
    .option('--keep', 'leave the sandbox on disk instead of deleting it when the run finishes')
    .option('--in-place', 'run inside the current working directory instead of a fresh temp dir')
    .action(async (opts: { interactive?: boolean; keep?: boolean; inPlace?: boolean }) => {
      const res = await runDemo(
        {
          interactive: opts.interactive === true,
          keep: opts.keep === true,
          inPlace: opts.inPlace === true,
        },
        processIO(),
      );
      process.exitCode = res.exitCode;
    });
}
