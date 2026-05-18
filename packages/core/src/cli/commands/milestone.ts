import type { Command } from 'commander';
import {
  runMilestoneExport,
  runMilestoneTransition,
  runProposeMilestones,
} from '../../intelligence/milestone.js';
import { readMilestoneLedger } from '../../intelligence/store.js';
import { renderMilestonesMd } from '../../intelligence/render-milestone.js';

export function registerMilestoneCommand(program: Command): void {
  const cmd = program
    .command('milestone')
    .description(
      'Shape recommendations into milestone candidates (read-narrow; never transitions the loop)',
    );

  cmd
    .command('propose')
    .description(
      'Cluster eligible recommendations into proposed milestone candidates',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const ledger = await runProposeMilestones(process.cwd());
        if (opts.json) {
          process.stdout.write(JSON.stringify(ledger) + '\n');
        } else {
          process.stdout.write(renderMilestonesMd(ledger));
        }
      } catch (err) {
        process.stderr.write(
          `milestone propose failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  for (const action of ['accept', 'defer'] as const) {
    cmd
      .command(`${action} <id>`)
      .description(
        action === 'accept'
          ? 'Mark a proposed milestone accepted'
          : 'Defer a proposed or accepted milestone',
      )
      .action(async (id: string) => {
        try {
          const res = await runMilestoneTransition(process.cwd(), id, action);
          if (!res.ok) {
            process.stderr.write(`milestone ${action} refused: ${res.error}\n`);
            process.exitCode = 1;
            return;
          }
          process.stdout.write(
            `milestone ${id} → ${action === 'accept' ? 'accepted' : 'deferred'}\n`,
          );
        } catch (err) {
          process.stderr.write(
            `milestone ${action} failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      });
  }

  cmd
    .command('export <id>')
    .description('Export an accepted milestone to a staged CADENCE SPEC draft')
    .requiredOption('--to <backend>', 'target backend (only "cadence")')
    .action(async (id: string, opts: { to: string }) => {
      try {
        if (opts.to !== 'cadence') {
          process.stderr.write(
            `milestone export refused: unknown backend "${opts.to}" (only "cadence")\n`,
          );
          process.exitCode = 1;
          return;
        }
        const res = await runMilestoneExport(process.cwd(), id);
        if (!res.ok) {
          process.stderr.write(`milestone export refused: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        process.stdout.write(
          `milestone ${id} → exported\n` +
            `staged SPEC: ${res.artifactPath}\n` +
            `promote with: cadence spec new <phase> <num>  (then paste + re-id)\n`,
        );
      } catch (err) {
        process.stderr.write(
          `milestone export failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('list')
    .description('Show the current milestone ledger')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (opts: { json?: boolean }) => {
      try {
        const ledger = await readMilestoneLedger(process.cwd());
        if (opts.json) {
          process.stdout.write(JSON.stringify(ledger) + '\n');
        } else {
          process.stdout.write(renderMilestonesMd(ledger));
        }
      } catch (err) {
        process.stderr.write(
          `milestone list failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
