import type { Command } from 'commander';
import { ContextScopeZ } from '@thomas-powers-jr/cadence-types';
import { runContext } from '../../intelligence/context.js';
import { renderContextMd } from '../../intelligence/render-context.js';

export function registerContextCommand(program: Command): void {
  program
    .command('context <scope>')
    .description(
      'Emit a compact, read-only context packet (scope: phase | handoff | review | agent)',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .action(async (scope: string, opts: { json?: boolean }) => {
      const parsed = ContextScopeZ.safeParse(scope);
      if (!parsed.success) {
        process.stderr.write(
          `context: invalid scope "${scope}" (expected: phase | handoff | review | agent)\n`,
        );
        process.exitCode = 2;
        return;
      }
      try {
        const packet = await runContext(process.cwd(), parsed.data);
        if (opts.json) {
          process.stdout.write(JSON.stringify(packet) + '\n');
        } else {
          process.stdout.write(renderContextMd(packet));
        }
      } catch (err) {
        process.stderr.write(
          `context failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
