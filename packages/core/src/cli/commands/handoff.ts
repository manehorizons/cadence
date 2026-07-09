// packages/core/src/cli/commands/handoff.ts
import type { Command } from 'commander';
import { runHandoff, resolveNow, type HandoffOptions } from '../../handoff/run-handoff.js';

export function registerHandoffCommand(program: Command): void {
  program
    .command('handoff [label]')
    .description('Scaffold a SESSION handoff doc in .cadence/handoff/ with machine facts pre-filled')
    .option('--label <s>', 'context label (alternative to the positional arg)')
    .option('--force', 'overwrite an existing same-day SESSION doc')
    .option('--no-stamp', 'do not write state.session.lastHandoff (no state.json change)')
    .option('--no-git', 'skip read-only git facts')
    .option('--no-fetch', 'skip the pre-facts git fetch (offline)')
    .option('--check', 'verify the freshest SESSION doc has no unfilled FILL-IN sections (exit 3 if it does)')
    .option('--json', 'emit machine-readable JSON instead of a summary')
    .action(
      async (
        labelArg: string | undefined,
        opts: {
          label?: string;
          force?: boolean;
          stamp?: boolean;
          git?: boolean;
          fetch?: boolean;
          check?: boolean;
          json?: boolean;
        },
      ) => {
        if (opts.check) {
          const { runHandoffCheck } = await import('../../handoff/run-handoff.js');
          const check = await runHandoffCheck(process.cwd());
          if (check.path === null) {
            process.stderr.write('handoff check: no SESSION doc found\n');
            process.exitCode = 1;
          } else if (check.unfilled.length > 0) {
            process.stderr.write(`handoff check: ${check.path} has unfilled sections: ${check.unfilled.join(', ')}\n`);
            process.exitCode = 3;
          } else {
            process.stdout.write(`handoff check: ${check.path} complete\n`);
          }
          return;
        }

        // commander negates --no-stamp/--no-git/--no-fetch to stamp:false / git:false / fetch:false.
        const handoffOpts: HandoffOptions = {
          force: opts.force ?? false,
          noStamp: opts.stamp === false,
          noGit: opts.git === false,
          noFetch: opts.fetch === false,
        };
        const label = opts.label ?? labelArg;
        if (label !== undefined) handoffOpts.label = label;
        try {
          const res = await runHandoff(process.cwd(), handoffOpts, resolveNow(process.env));
          if (opts.json) {
            process.stdout.write(JSON.stringify(res) + '\n');
          } else {
            const stamp = res.stamped ? ' · stamped lastHandoff' : '';
            const git = res.gitAvailable ? '' : ' · git unavailable';
            process.stdout.write(`handoff: wrote ${res.path}${stamp}${git}\n`);
            if (res.pruned.length > 0) {
              process.stdout.write(
                `handoff: pruned ${res.pruned.length} stale doc(s): ${res.pruned.join(', ')}\n`,
              );
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          process.stderr.write(`${msg}\n`);
          process.exitCode = /already exists/.test(msg) ? 2 : 1;
        }
      },
    );
}
