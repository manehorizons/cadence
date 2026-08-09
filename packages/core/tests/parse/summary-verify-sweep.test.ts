import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, relative, sep } from 'node:path';

// AC-3 (phase 257) requires that `cadence summary verify <phase> <num>`
// still validates every existing summary's contentHash after T1's Findings
// rendering change — proving rendering never participated in
// `computeSummaryContentHash`'s input. `.cadence/phases/**` is git-tracked
// (see CLAUDE.md's single-commit settle convention: phase artifacts land
// with source+tests+docs in the same commit), so a normal checkout of this
// branch — worktree or primary — carries the full historical corpus, not
// just phase 257's own in-flight DRAFT. This test walks that real corpus
// rather than a synthetic fixture, because AC-3's claim is specifically
// about every *existing* summary, not a representative sample.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const CADENCE_CLI = join(REPO_ROOT, 'packages', 'core', 'dist', 'cli', 'index.js');
const PHASES_DIR = join(REPO_ROOT, '.cadence', 'phases');

function walkSummaries(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkSummaries(full));
    } else if (entry.isFile() && entry.name.endsWith('-SUMMARY.json')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Recover the `<num>` CLI arg that reproduces a given `<phase>-<num>` id,
 * mirroring `derivePhaseTaskId` (packages/core/src/phases/id.ts) in reverse:
 * the phase half of an id is the phase directory's leading digit run,
 * zero-padded to a minimum of 2; whatever follows that prefix + '-' is the
 * original `num` CLI arg (already zero-padded by whoever created the file,
 * so passing it straight through round-trips through `derivePhaseTaskId`
 * unchanged). Verified against all 269 real fixtures in this repo before
 * this test was written — see the phase 257 T3 report for the validation
 * script's output.
 */
function deriveNumArg(phaseDir: string, id: string): string {
  const m = /^(\d+)/.exec(phaseDir);
  if (!m) throw new Error(`phase directory has no leading number: ${phaseDir}`);
  const paddedPhase = m[1]!.padStart(2, '0');
  const prefix = `${paddedPhase}-`;
  if (!id.startsWith(prefix)) {
    throw new Error(
      `id "${id}" does not start with expected phase prefix "${prefix}" (dir: ${phaseDir})`,
    );
  }
  return id.slice(prefix.length);
}

function runVerify(
  phaseDir: string,
  num: string,
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [CADENCE_CLI, 'summary', 'verify', phaseDir, num], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('error', reject);
    p.on('exit', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

/** Bounded-concurrency map so ~270 real fixtures don't spawn 270 processes at once. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

describe('cadence summary verify - repo-wide sweep over every existing summary (phase 257, T3)', () => {
  it(
    '257-01/AC-3, 264-01/AC-2: every existing <id>-SUMMARY.json under .cadence/phases verifies with zero failures',
    async () => {
      const files = walkSummaries(PHASES_DIR);
      // Sanity floor: fail loudly if the walk found suspiciously few files
      // (e.g. pointed at the wrong directory) rather than passing vacuously.
      expect(files.length).toBeGreaterThan(100);

      const targets = files.map((f) => {
        const rel = relative(PHASES_DIR, f);
        const phaseDir = rel.split(sep)[0]!;
        const filename = f.slice(f.lastIndexOf(sep) + 1);
        const id = filename.replace(/-SUMMARY\.json$/, '');
        const num = deriveNumArg(phaseDir, id);
        return { file: f, phaseDir, id, num };
      });

      const results = await mapWithConcurrency(targets, 12, async (t) => {
        const r = await runVerify(t.phaseDir, t.num, REPO_ROOT);
        return { ...t, ...r };
      });

      // `cadence summary verify` exits non-zero only on MISMATCH (a
      // hand-edited artifact) or a load/parse/schema failure — never on the
      // informational NO_HASH case (pre-phase-223 records, or refused
      // settles that recorded no findings), so a nonzero exit here is
      // always a genuine failure, not a false positive from old records.
      const failures = results.filter((r) => r.code !== 0);
      if (failures.length > 0) {
        const detail = failures
          .map(
            (f) =>
              `${f.phaseDir}/${f.id} (exit ${f.code}):\n  stdout: ${f.stdout.trim()}\n  stderr: ${f.stderr.trim()}`,
          )
          .join('\n');
        throw new Error(
          `${failures.length}/${results.length} existing summaries failed 'cadence summary verify':\n${detail}`,
        );
      }

      expect(failures).toHaveLength(0);
    },
    120_000,
  );
});
