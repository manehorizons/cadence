import type { Command } from 'commander';
import type { PreMortemAdditions } from '../../intelligence/milestone.js';
import {
  runMilestoneExport,
  runMilestonePreMortem,
  runMilestoneStatus,
  runMilestoneTransition,
  runProposeMilestones,
} from '../../intelligence/milestone.js';
import { readMilestoneLedger } from '../../intelligence/store/milestones.js';
import {
  renderMilestoneStatusMd,
  renderMilestonesMd,
} from '../../intelligence/render-milestone.js';
import { buildEmptyResultMessage } from '../../services/milestone-propose.js';

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
          // AC-2 (phase 207 T2, CLI-wiring fix): the markdown render always
          // reflects the *whole* ledger — an already-accepted/deferred/
          // exported/closed milestone from a past run still prints under its
          // own section even when this run proposed nothing new. So the
          // empty-eligibility signal is NOT `ledger.milestones.length === 0`
          // (that would wrongly suppress the enrichment whenever any old
          // milestone survives in the ledger) — it's specifically "zero
          // `status === 'proposed'` milestones", i.e. the `## Proposed`
          // section `renderMilestonesMd` just printed as empty. Reuses the
          // same `buildEmptyResultMessage` enrichment already wired into the
          // MCP-facing `milestoneProposeService` so the two surfaces never
          // diverge in wording.
          const hasNewlyProposed = ledger.milestones.some((m) => m.status === 'proposed');
          if (!hasNewlyProposed) {
            process.stdout.write(await buildEmptyResultMessage(process.cwd()));
          }
        }
      } catch (err) {
        process.stderr.write(
          `milestone propose failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  for (const action of ['accept', 'defer', 'reopen'] as const) {
    cmd
      .command(`${action} <id>`)
      .description(
        action === 'accept'
          ? 'Mark a proposed milestone accepted'
          : action === 'defer'
            ? 'Defer a proposed or accepted milestone'
            : 'Reopen a deferred milestone back to proposed',
      )
      .action(async (id: string) => {
        try {
          const res = await runMilestoneTransition(process.cwd(), id, action);
          if (!res.ok) {
            process.stderr.write(`milestone ${action} refused: ${res.error}\n`);
            process.exitCode = 1;
            return;
          }
          const statusLabel =
            action === 'accept' ? 'accepted' : action === 'defer' ? 'deferred' : 'proposed';
          process.stdout.write(`milestone ${id} → ${statusLabel}\n`);
        } catch (err) {
          process.stderr.write(
            `milestone ${action} failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      });
  }

  cmd
    .command('close <id>')
    .description(
      'Close an exported milestone whose work has landed (issue #135)',
    )
    .option(
      '--ref <text>',
      'Freeform provenance for the closed milestone (e.g. "PR #131")',
    )
    .action(async (id: string, opts: { ref?: string }) => {
      try {
        if (opts.ref !== undefined && opts.ref.trim().length === 0) {
          process.stderr.write('milestone close: --ref must not be empty\n');
          process.exitCode = 1;
          return;
        }
        const res = await runMilestoneTransition(process.cwd(), id, 'close', opts.ref);
        if (!res.ok) {
          process.stderr.write(`milestone close refused: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        process.stdout.write(`milestone ${id} → closed\n`);
        if (res.warning !== undefined) {
          process.stdout.write(`${res.warning}\n`);
        }
      } catch (err) {
        process.stderr.write(
          `milestone close failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

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
    .command('premortem <id>')
    .description(
      'Refresh the deterministic pre-mortem for a proposed/accepted milestone',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .option(
      '--add-out-of-scope <text...>',
      'Append operator-authored out-of-scope entries (repeatable)',
    )
    .option(
      '--add-likely-failure-mode <text...>',
      'Append operator-authored likely-failure-mode entries; survives future refreshes (repeatable)',
    )
    .option(
      '--add-hidden-dependency <text...>',
      'Append operator-authored hidden-dependency entries; survives future refreshes (repeatable)',
    )
    .action(
      async (
        id: string,
        opts: {
          json?: boolean;
          addOutOfScope?: string[];
          addLikelyFailureMode?: string[];
          addHiddenDependency?: string[];
        },
      ) => {
        try {
          const flagChecks: Array<[string, string[] | undefined]> = [
            ['--add-out-of-scope', opts.addOutOfScope],
            ['--add-likely-failure-mode', opts.addLikelyFailureMode],
            ['--add-hidden-dependency', opts.addHiddenDependency],
          ];
          for (const [flag, values] of flagChecks) {
            if (values !== undefined && values.some((v) => v.trim().length === 0)) {
              process.stderr.write(`milestone premortem: ${flag} must not be empty\n`);
              process.exitCode = 1;
              return;
            }
          }

          const additions: PreMortemAdditions = {
            ...(opts.addOutOfScope !== undefined
              ? { outOfScope: opts.addOutOfScope }
              : {}),
            ...(opts.addLikelyFailureMode !== undefined
              ? { likelyFailureModes: opts.addLikelyFailureMode }
              : {}),
            ...(opts.addHiddenDependency !== undefined
              ? { hiddenDependencies: opts.addHiddenDependency }
              : {}),
          };
          const hasAdditions = Object.keys(additions).length > 0;

          const res = await runMilestonePreMortem(
            process.cwd(),
            id,
            new Date(),
            hasAdditions ? additions : undefined,
          );
          if (!res.ok) {
            process.stderr.write(`milestone premortem refused: ${res.error}\n`);
            process.exitCode = 1;
            return;
          }
          if (opts.json) {
            process.stdout.write(JSON.stringify(res.ledger) + '\n');
          } else {
            process.stdout.write(`milestone ${id} → pre-mortem refreshed\n`);
          }
        } catch (err) {
          process.stderr.write(
            `milestone premortem failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      },
    );

  cmd
    .command('status <id>')
    .description(
      "Report each milestone phase's owning worktree and live loop position (read-only)",
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (id: string, opts: { json?: boolean }) => {
      try {
        const res = await runMilestoneStatus(process.cwd(), id);
        if (!res.ok) {
          process.stderr.write(`milestone status refused: ${res.error}\n`);
          process.exitCode = 1;
          return;
        }
        if (opts.json) {
          process.stdout.write(JSON.stringify(res) + '\n');
        } else {
          process.stdout.write(renderMilestoneStatusMd(res));
        }
      } catch (err) {
        process.stderr.write(
          `milestone status failed: ${err instanceof Error ? err.message : String(err)}\n`,
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
