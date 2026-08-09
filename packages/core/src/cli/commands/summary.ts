import type { Command } from 'commander';
import { readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { ZodError } from 'zod';
import type { Summary } from '@thomas-powers-jr/cadence-types';
import { SummaryZ } from '@thomas-powers-jr/cadence-types';
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

/**
 * Recursively collect every `*-SUMMARY.json` file under `dir`, mirroring the
 * `walkSummaries(dir)` helper in
 * `packages/core/tests/parse/summary-verify-sweep.test.ts` (Phase 266 T2
 * rewrites that test to call this subcommand once, instead of walking the
 * corpus itself and spawning one CLI process per file). Duplicated here
 * rather than shared from a common module because this task's file scope is
 * limited to `summary.ts` + its own test file (Phase 266 DRAFT Boundaries).
 * Best-effort per CLAUDE.md's "Best-effort introspection never throws": a
 * subtree that can't be listed (missing, permission error) contributes
 * nothing rather than aborting the whole sweep. Sorted for determinism —
 * `readdirSync` order isn't guaranteed identical across platforms (this
 * repo's CI matrix includes Windows).
 */
function walkSummaryFiles(dir: string): string[] {
  const out: string[] = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSummaryFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('-SUMMARY.json')) {
      out.push(full);
    }
  }
  return out.sort();
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
              'NO_HASH: no contentHash present — pre-phase-223 record, or a refused settle that recorded no findings; cannot verify\n',
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

  // Phase 266 T1 (rec-20260806-010): a sibling subcommand, not a `--all`
  // flag bolted onto `verify <phase> <num>` above — that command has
  // required positionals, and Commander refuses to register a second
  // subcommand also named `verify` (confirmed empirically; see the phase
  // 266 T1 report), so a distinct name is the only option that doesn't
  // touch — and risk weakening — the existing single-target command.
  cmd
    .command('verify-all')
    .description(
      'Walk every *-SUMMARY.json under .cadence/phases in-process (no per-file subprocess spawn) and verify each one the same way `verify <phase> <num>` does; MISMATCH and load/parse/schema failures fail the sweep, NO_HASH is informational only',
    )
    .action(async () => {
      try {
        const phasesDir = join(process.cwd(), '.cadence', 'phases');
        const files = walkSummaryFiles(phasesDir);

        if (files.length === 0) {
          // Loud, not a silent vacuous pass (CLAUDE.md "The Quiet
          // Fallback") — exit 0 is still correct: AC-1 fails the sweep
          // only when a file actually failed, and zero files means zero
          // failures.
          process.stderr.write(
            `summary verify-all: no *-SUMMARY.json files found under ${phasesDir} — nothing to verify\n`,
          );
          return;
        }

        let matchCount = 0;
        let noHashCount = 0;
        let failureCount = 0;

        for (const path of files) {
          const phaseDir = relative(phasesDir, dirname(path)).split(sep)[0] ?? dirname(path);
          const id = path.slice(path.lastIndexOf(sep) + 1).replace(/-SUMMARY\.json$/, '');

          let loaded: Awaited<ReturnType<typeof loadSummary>>;
          try {
            loaded = await loadSummary(path, 'summary verify-all', phaseDir, id);
          } catch (err) {
            // loadSummary only returns `ok: false` for ENOENT/parse/schema
            // problems — it *throws* on other fs errors (e.g. EACCES). One
            // unreadable file must not abort the sweep for the other
            // 274+, so it is classified as this file's failure instead.
            loaded = {
              ok: false,
              message: `summary verify-all failed: unexpected error reading ${path}: ${err instanceof Error ? err.message : String(err)}`,
            };
          }

          if (!loaded.ok) {
            failureCount++;
            process.stderr.write(`${phaseDir}/${id}: FAILURE — ${loaded.message}\n`);
            continue;
          }

          const verdict = verifySummaryContentHash(loaded.data);
          switch (verdict) {
            case 'MATCH':
              // Not printed per-file — with 275+ files, a MATCH line per
              // file is noise; the aggregate count below is the report.
              matchCount++;
              break;
            case 'NO_HASH':
              noHashCount++;
              process.stdout.write(`${phaseDir}/${id}: NO_HASH\n`);
              break;
            case 'MISMATCH':
              failureCount++;
              process.stdout.write(`${phaseDir}/${id}: MISMATCH\n`);
              break;
          }
        }

        process.stdout.write(
          `${files.length} checked: ${matchCount} MATCH, ${noHashCount} NO_HASH, ${failureCount} failed\n`,
        );

        if (failureCount > 0) {
          process.exitCode = 1;
        }
      } catch (err) {
        process.stderr.write(
          `summary verify-all failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });
}
