import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ZodError } from 'zod';
import { SummaryZ } from '@manehorizons/cadence-types';
import { assertSafePhaseSlug, derivePhaseTaskId } from '../../phases/id.js';
import { renderSummaryForReview } from '../../services/summary-render.js';

/** Narrow an unknown catch value to a Node.js filesystem error with a `code`. */
function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

/** Flatten a ZodError into a short, one-line-per-issue summary — never the raw multi-page dump. */
function summarizeZodError(err: ZodError): string {
  return err.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');
}

export function registerSummaryCommand(program: Command): void {
  const cmd = program
    .command('summary')
    .description('Render a settled phase SUMMARY.json for humans (read-only)');

  cmd
    .command('render <phase> <num>')
    .description(
      'Print a deterministic, human-readable rendering of gate outcomes and per-AC status, suitable for pasting into a PR',
    )
    .action(async (phase: string, num: string) => {
      try {
        const safePhase = assertSafePhaseSlug(phase);
        const id = derivePhaseTaskId(safePhase, num);
        const path = join(process.cwd(), '.cadence', 'phases', safePhase, `${id}-SUMMARY.json`);

        let raw: string;
        try {
          raw = await readFile(path, 'utf8');
        } catch (err) {
          if (isErrnoException(err) && err.code === 'ENOENT') {
            process.stderr.write(
              `summary render failed: no SUMMARY.json found for ${safePhase}/${id} at ${path} — has this phase been settled yet?\n`,
            );
            process.exitCode = 1;
            return;
          }
          throw err;
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(raw);
        } catch (err) {
          process.stderr.write(
            `summary render failed: ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
          return;
        }

        const result = SummaryZ.safeParse(parsedJson);
        if (!result.success) {
          process.stderr.write(
            `summary render failed: ${path} does not match the expected SUMMARY schema: ${summarizeZodError(result.error)}\n`,
          );
          process.exitCode = 1;
          return;
        }

        process.stdout.write(renderSummaryForReview(result.data));
      } catch (err) {
        process.stderr.write(
          `summary render failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
