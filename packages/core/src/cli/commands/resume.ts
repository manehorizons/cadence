// packages/core/src/cli/commands/resume.ts
import type { Command } from 'commander';
import { runResume } from '../../handoff/run-resume.js';

export function registerResumeCommand(program: Command): void {
  program
    .command('resume')
    .description('Replay the freshest .cadence/handoff/ SESSION doc + live context (read-only)')
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .option('--full', 'force full output (whole doc + live context replay)')
    .option('--brief', 'force brief output (key sections only, no context replay)')
    .action(async (opts: { json?: boolean; full?: boolean; brief?: boolean }) => {
      if (opts.full && opts.brief) {
        process.stderr.write('resume: --full and --brief are mutually exclusive\n');
        process.exitCode = 1;
        return;
      }
      try {
        const mode = opts.full ? 'full' : opts.brief ? 'brief' : undefined;
        const res = await runResume(process.cwd(), mode ? { mode } : {});
        if (opts.json) {
          process.stdout.write(JSON.stringify(res) + '\n');
          return;
        }
        if (!res.found) {
          process.stdout.write('resume: no handoff found — run `cadence handoff` to create one.\n');
          return;
        }
        if (res.drift) {
          process.stdout.write(
            `⚠ handoff written at ${res.drift.docLoopPosition}; live state now ${res.drift.liveLoopPosition}\n\n`,
          );
        }
        process.stdout.write(`--- narrative from ${res.handoffPath} ---\n\n`);
        process.stdout.write(res.doc.endsWith('\n') ? res.doc : res.doc + '\n');
        if (res.mode === 'brief') {
          process.stdout.write(
            '\nbrief mode; run `cadence resume --full` (or `cadence context handoff`) for the full doc + live context\n',
          );
        }
      } catch (err) {
        process.stderr.write(`resume failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
