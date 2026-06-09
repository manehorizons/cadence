// packages/core/src/cli/commands/handoff.ts
import type { Command } from 'commander';
import { runHandoff, type HandoffOptions } from '../../handoff/run-handoff.js';

export function registerHandoffCommand(program: Command): void {
  program
    .command('handoff [label]')
    .description('Scaffold a SESSION handoff doc in .cadence/handoff/ with machine facts pre-filled')
    .option('--label <s>', 'context label (alternative to the positional arg)')
    .option('--force', 'overwrite an existing same-day SESSION doc')
    .option('--no-stamp', 'do not write state.session.lastHandoff (no state.json change)')
    .option('--no-git', 'skip read-only git facts')
    .option('--json', 'emit machine-readable JSON instead of a summary')
    .action(
      async (
        labelArg: string | undefined,
        opts: { label?: string; force?: boolean; stamp?: boolean; git?: boolean; json?: boolean },
      ) => {
        // commander negates --no-stamp/--no-git to stamp:false / git:false.
        const handoffOpts: HandoffOptions = {
          force: opts.force ?? false,
          noStamp: opts.stamp === false,
          noGit: opts.git === false,
        };
        const label = opts.label ?? labelArg;
        if (label !== undefined) handoffOpts.label = label;
        try {
          const res = await runHandoff(process.cwd(), handoffOpts);
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
