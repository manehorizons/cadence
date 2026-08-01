import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ZodError } from 'zod';
import type { Summary } from '@manehorizons/cadence-types';
import { SummaryZ } from '@manehorizons/cadence-types';
import { assertSafePhaseSlug, derivePhaseTaskId } from '../../phases/id.js';
import { renderSummaryForReview } from '../../services/summary-render.js';
import { verifySummaryContentHash } from '../../services/summary-verify.js';

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

/** Highest `schemaVersion` this build's `SummaryZ` recognizes — see
 *  `packages/types/src/summary.ts`'s `SummaryZ.schemaVersion` union. Kept in
 *  sync by hand when that union grows (Phase 232). */
const MAX_RECOGNIZED_SCHEMA_VERSION = 2;

/**
 * Read the raw `schemaVersion` off already-JSON.parse'd data, permissively
 * and before any Zod validation, so a SUMMARY written by a newer Cadence
 * (an unrecognized-but-higher `schemaVersion`) can be distinguished from a
 * genuine schema violation. Returns `undefined` for anything that isn't
 * `{ schemaVersion: <number> }` — missing, non-numeric, non-object, etc. —
 * so every other malformed shape still falls through to the normal
 * `safeParse` path and reads as corruption, not as "newer".
 */
function readRawSchemaVersion(json: unknown): number | undefined {
  if (typeof json !== 'object' || json === null || !('schemaVersion' in json)) {
    return undefined;
  }
  const value = (json as { schemaVersion: unknown }).schemaVersion;
  return typeof value === 'number' ? value : undefined;
}

/**
 * Reads, JSON-parses, and `SummaryZ`-validates a phase's `<id>-SUMMARY.json`
 * from disk, distinguishing each failure mode (missing file / invalid JSON /
 * schema mismatch) with a specific, human-readable message — the same
 * error-handling shape `summary render` and `summary verify` both need.
 * Returns a discriminated result rather than throwing, so each subcommand's
 * `.action()` stays a thin shell that only decides what to print and which
 * exit code to set.
 */
async function loadSummary(
  path: string,
  commandLabel: string,
  safePhase: string,
  id: string,
): Promise<{ ok: true; data: Summary } | { ok: false; message: string }> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (isErrnoException(err) && err.code === 'ENOENT') {
      return {
        ok: false,
        message: `${commandLabel} failed: no SUMMARY.json found for ${safePhase}/${id} at ${path} — has this phase been settled yet?`,
      };
    }
    throw err;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      message: `${commandLabel} failed: ${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const rawSchemaVersion = readRawSchemaVersion(parsedJson);
  if (rawSchemaVersion !== undefined && rawSchemaVersion > MAX_RECOGNIZED_SCHEMA_VERSION) {
    return {
      ok: false,
      message:
        `${commandLabel} failed: ${path} was written by a newer version of Cadence ` +
        `(schemaVersion ${rawSchemaVersion}) than this build recognizes ` +
        `(max ${MAX_RECOGNIZED_SCHEMA_VERSION}) — upgrade Cadence to read it.`,
    };
  }

  const result = SummaryZ.safeParse(parsedJson);
  if (!result.success) {
    return {
      ok: false,
      message: `${commandLabel} failed: ${path} does not match the expected SUMMARY schema: ${summarizeZodError(result.error)}`,
    };
  }

  return { ok: true, data: result.data };
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

        const loaded = await loadSummary(path, 'summary render', safePhase, id);
        if (!loaded.ok) {
          process.stderr.write(`${loaded.message}\n`);
          process.exitCode = 1;
          return;
        }

        process.stdout.write(renderSummaryForReview(loaded.data));
      } catch (err) {
        process.stderr.write(
          `summary render failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('verify <phase> <num>')
    .description(
      'Recompute the sha256 content hash over a settled SUMMARY.json and compare it against the stored contentHash, to detect a hand-edited artifact',
    )
    .action(async (phase: string, num: string) => {
      try {
        const safePhase = assertSafePhaseSlug(phase);
        const id = derivePhaseTaskId(safePhase, num);
        const path = join(process.cwd(), '.cadence', 'phases', safePhase, `${id}-SUMMARY.json`);

        const loaded = await loadSummary(path, 'summary verify', safePhase, id);
        if (!loaded.ok) {
          process.stderr.write(`${loaded.message}\n`);
          process.exitCode = 1;
          return;
        }

        const verdict = verifySummaryContentHash(loaded.data);
        switch (verdict) {
          case 'MATCH':
            process.stdout.write('MATCH: SUMMARY.json content hash verified (sha256)\n');
            break;
          case 'MISMATCH':
            process.stdout.write(
              'MISMATCH: stored hash does not match recomputed content — this SUMMARY.json may have been edited after settle\n',
            );
            process.exitCode = 1;
            break;
          case 'NO_HASH':
            process.stdout.write(
              'NO_HASH: no contentHash present — pre-phase-223 record or a refused settle; cannot verify\n',
            );
            break;
        }
      } catch (err) {
        process.stderr.write(
          `summary verify failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
