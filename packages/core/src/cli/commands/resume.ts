// packages/core/src/cli/commands/resume.ts
import type { Command } from 'commander';
import { runResume } from '../../handoff/run-resume.js';
import { renderCandidateMenu } from '../../handoff/pick.js';

export function registerResumeCommand(program: Command): void {
  program
    .command('resume')
    .description('Replay the freshest .cadence/handoff/ SESSION doc + live context (read-only)')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .option('--full', 'force full output (whole doc + live context replay)')
    .option('--brief', 'force brief output (key sections only, no context replay)')
    .option('--list', 'list every discoverable handoff candidate (local + sibling worktrees) and resume nothing')
    .option(
      '--pick <n>',
      'resolve directly to the Nth candidate from `cadence resume --list` (1-based), skipping the menu',
      (v) => Number.parseInt(v, 10),
    )
    .option('--path <p>', 'resolve directly to the handoff doc at this exact path, skipping the menu')
    .option('--local', 'force the local-only fast path, ignoring sibling worktrees entirely')
    .option('--offline', 'skip the origin-freshness probe (no network)')
    .action(
      async (opts: {
        json?: boolean;
        full?: boolean;
        brief?: boolean;
        list?: boolean;
        pick?: number;
        path?: string;
        local?: boolean;
        offline?: boolean;
      }) => {
        if (opts.full && opts.brief) {
          process.stderr.write('resume: --full and --brief are mutually exclusive\n');
          process.exitCode = 1;
          return;
        }

        if (opts.pick !== undefined && Number.isNaN(opts.pick)) {
          process.stderr.write('resume: --pick must be a number\n');
          process.exitCode = 1;
          return;
        }

        const selectors: string[] = [];
        if (opts.list) selectors.push('--list');
        if (opts.pick !== undefined) selectors.push('--pick');
        if (opts.path !== undefined) selectors.push('--path');
        if (selectors.length > 1) {
          process.stderr.write(`resume: ${selectors.join(', ')} are mutually exclusive\n`);
          process.exitCode = 1;
          return;
        }

        if (opts.local && selectors.length > 0) {
          process.stderr.write(`resume: --local and ${selectors[0]} are mutually exclusive\n`);
          process.exitCode = 1;
          return;
        }

        try {
          const mode = opts.full ? 'full' : opts.brief ? 'brief' : undefined;
          const res = await runResume(process.cwd(), {
            ...(mode ? { mode } : {}),
            ...(opts.list !== undefined ? { list: opts.list } : {}),
            ...(opts.pick !== undefined ? { pick: opts.pick } : {}),
            ...(opts.path !== undefined ? { path: opts.path } : {}),
            ...(opts.local !== undefined ? { local: opts.local } : {}),
            ...(opts.offline !== undefined ? { offline: opts.offline } : {}),
          });
          if (opts.json) {
            process.stdout.write(JSON.stringify(res) + '\n');
            return;
          }
          if (!res.found) {
            if (res.candidates) {
              process.stdout.write(renderCandidateMenu(res.candidates));
              return;
            }
            process.stdout.write('resume: no handoff found — run `cadence handoff` to create one.\n');
            return;
          }
          if (res.drift) {
            process.stdout.write(
              `⚠ handoff written at ${res.drift.docLoopPosition}; live state now ${res.drift.liveLoopPosition}\n\n`,
            );
          }
          if (res.remote) {
            if (res.remote.checked && (res.remote.behind ?? 0) > 0) {
              process.stdout.write(
                `⚠ origin/${res.remote.branch} is ${res.remote.behind} commit(s) ahead of local HEAD — this handoff may be superseded by work pushed from another machine.\n` +
                `  Inspect: git log --oneline HEAD..@{u} | head -25 · then sync (your call) before acting on the next action.\n\n`,
              );
            } else if (!res.remote.checked) {
              process.stdout.write(`note: could not verify freshness against origin (${res.remote.reason})\n\n`);
            }
          }
          if (res.pickedSource === 'sibling') {
            process.stdout.write(`--- from sibling worktree: ${res.pickedWorktree} ---\n\n`);
          }
          process.stdout.write(`--- narrative from ${res.handoffPath} ---\n\n`);
          process.stdout.write(res.doc.endsWith('\n') ? res.doc : res.doc + '\n');
          if (res.pickedSource === 'sibling' && res.mode === 'full') {
            process.stdout.write(
              `\nlive context recompute skipped: ${res.pickedWorktree} is a different worktree — cd there and run \`cadence resume --full\` to get its live context\n`,
            );
          } else if (res.pickedSource === 'sibling' && res.mode === 'brief') {
            process.stdout.write(
              `\nbrief mode: ${res.pickedWorktree} is a different worktree — cd there and run \`cadence resume --full\` (or re-supply the same --pick/--path from there) to get its full doc + live context\n`,
            );
          } else if (res.mode === 'brief') {
            process.stdout.write(
              '\nbrief mode; run `cadence resume --full` (or `cadence context handoff`) for the full doc + live context\n',
            );
          }
        } catch (err) {
          process.stderr.write(`resume failed: ${err instanceof Error ? err.message : String(err)}\n`);
          process.exitCode = 1;
        }
      },
    );
}
