import type { Command } from 'commander';
import { processIO } from '../../services/io.js';
import { computeRetroRollup, scanRetroArtifacts } from '../../services/retro-rollup.js';
import { renderRetroRollup } from '../../parse/render-retro-rollup.js';

export function registerRetroCommand(program: Command): void {
  program
    .command('retro')
    .description('Cross-phase rollup of recurring retro friction (gate bypasses, rough tasks, findings)')
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .action(async (opts: { format?: string }) => {
      try {
        const format = opts.format ?? 'terminal';
        if (format !== 'terminal' && format !== 'json') {
          process.stderr.write(`retro failed: unsupported format: ${format}\n`);
          process.exitCode = 1;
          return;
        }
        const io = processIO();
        const entries = await scanRetroArtifacts(process.cwd(), io);
        if (entries.length === 0) {
          if (format === 'json') {
            process.stdout.write('null\n');
          } else {
            process.stdout.write('No retro artifacts found.\n');
          }
          return;
        }
        const rollup = computeRetroRollup(entries);
        if (format === 'json') {
          process.stdout.write(JSON.stringify(rollup, null, 2) + '\n');
          return;
        }
        const md = renderRetroRollup(rollup);
        process.stdout.write(md);
        if (!md.endsWith('\n')) process.stdout.write('\n');
      } catch (err) {
        process.stderr.write(`retro failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
