/**
 * Phase 279 (T8): corpus class-distribution measurement for
 * `heuristicTaskClass` (dispatch/policy.ts, T4). This is not a test of any
 * single behavior — it's a standing regression guard proving the SHIPPED
 * heuristic, run over every real DRAFT task in this repo's own
 * `.cadence/phases/` corpus, is non-degenerate (doesn't collapse almost
 * everything into one bucket). Supports AC-4's validity: the coherence
 * CLASS_MISMATCH warn (T7) only matters if the heuristic it's comparing
 * against actually discriminates.
 *
 * File-walking pattern (REPO_ROOT computation, recursive readdir) modeled
 * on tests/gates/boundary-regression.test.ts's findSummaryFiles/REPO_ROOT.
 */
import { describe, it, expect } from 'vitest';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseDraftMd } from '../../src/parse/draft-parser.js';
import { heuristicTaskClass } from '../../src/dispatch/policy.js';
import type { TaskClass } from '@thomas-powers-jr/cadence-types';

const HERE = dirname(fileURLToPath(import.meta.url));
// tests/dispatch -> tests -> core -> packages -> repo root.
const REPO_ROOT = join(HERE, '..', '..', '..', '..');

async function findDraftFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findDraftFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('-DRAFT.md')) {
      out.push(full);
    }
  }
  return out;
}

describe('AC-4: heuristicTaskClass corpus class-distribution measurement', () => {
  it('279-01/AC-4: tabulates class distribution over every real DRAFT task in .cadence/phases/** and stays non-degenerate', async () => {
    const phasesDir = join(REPO_ROOT, '.cadence', 'phases');
    const draftFiles = await findDraftFiles(phasesDir);
    // Sanity floor: by phase 279 this repo has scaffolded 100+ DRAFTs — if
    // this comes back small or empty, the path resolution above is wrong,
    // not the corpus itself.
    expect(draftFiles.length).toBeGreaterThan(100);

    const counts: Record<TaskClass, number> = { mechanical: 0, standard: 0, complex: 0 };
    let parsedFiles = 0;
    let failedFiles = 0;
    const failures: string[] = [];

    for (const file of draftFiles) {
      try {
        const raw = await readFile(file, 'utf8');
        const draft = parseDraftMd(raw);
        parsedFiles += 1;
        for (const task of draft.tasks) {
          const cls = heuristicTaskClass(task);
          counts[cls] += 1;
        }
      } catch (err) {
        // One malformed/unparseable historical DRAFT must not crash the
        // whole measurement — skip it and count the failure separately.
        failedFiles += 1;
        failures.push(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const total = counts.mechanical + counts.standard + counts.complex;
    expect(total).toBeGreaterThan(0);

    const pct = (n: number) => ((n / total) * 100).toFixed(1);
    const lines = [
      `Corpus class distribution (${total} tasks across ${parsedFiles} DRAFT files, ${failedFiles} unparseable skipped):`,
      `  mechanical: ${counts.mechanical} (${pct(counts.mechanical)}%)`,
      `  standard:   ${counts.standard} (${pct(counts.standard)}%)`,
      `  complex:    ${counts.complex} (${pct(counts.complex)}%)`,
    ];
    if (failedFiles > 0) {
      lines.push(`  skipped (unparseable):`);
      for (const f of failures) lines.push(`    - ${f}`);
    }
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));

    // Non-degenerate: a standing regression guard. If a future change to
    // heuristicTaskClass collapses the corpus into (near-)one bucket, this
    // fails loudly rather than silently shipping a broken heuristic.
    const maxShare = Math.max(counts.mechanical, counts.standard, counts.complex) / total;
    expect(maxShare).toBeLessThanOrEqual(0.9);
  });
});
