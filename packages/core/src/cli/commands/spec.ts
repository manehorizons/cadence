import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { parseSpecMd } from '../../parse/spec-parser.js';
import { specNewService } from '../../services/spec-new.js';
import { specApproveService } from '../../services/spec-approve.js';
import { processIO } from '../../services/io.js';

/**
 * Phase 36.1 — the pre-DRAFT SPEC stage. `spec new` (IDLE→SPEC) scaffolds a
 * `<id>-SPEC.md`; the host agent/human authors it; `spec check` is a
 * read-only structural sanity; `spec approve` runs a convergent spec-review
 * gate (reusing the Phase 35.1 `nextConvergence` primitive verbatim) and on
 * pass returns to IDLE so the existing IDLE-gated `draft new` proceeds.
 */
export function registerSpecCommand(program: Command): void {
  const cmd = program.command('spec').description('Spec phase workflow (pre-DRAFT)');

  cmd
    .command('new <phase> <num>')
    .description('Scaffold a new SPEC.md under .cadence/phases/<phase>/ (IDLE→SPEC)')
    .option('--title <t>', 'Spec title', 'Untitled')
    .option('--from-rec <recId>', 'Praxis recommendation id; on success the rec is auto-converted to this phase (Slice 34.3)')
    .option('--allow-phase-collision', 'bypass the worktree phase-collision guard (Phase 83); the local same-dir existsSync refusal still applies')
    .option('--ui', 'also scaffold a sibling <id>-UI-SPEC.md; cadence spec approve will run ui-spec-review against it (rec-20260711-004)')
    .action(async (phase: string, num: string, opts: { title: string; fromRec?: string; allowPhaseCollision?: boolean; ui?: boolean }) => {
      const { exitCode } = await specNewService(
        process.cwd(),
        {
          phase,
          num,
          title: opts.title,
          ...(opts.fromRec !== undefined ? { fromRec: opts.fromRec } : {}),
          ...(opts.allowPhaseCollision !== undefined ? { allowPhaseCollision: opts.allowPhaseCollision } : {}),
          ...(opts.ui !== undefined ? { ui: opts.ui } : {}),
        },
        processIO(),
      );
      if (exitCode) process.exitCode = exitCode;
    });

  cmd
    .command('check <path>')
    .description('Structural sanity-check a SPEC.md (objective + ≥1 AC)')
    .action(async (path: string) => {
      try {
        const raw = await readFile(path, 'utf8');
        const spec = parseSpecMd(raw);
        const issues: string[] = [];
        if (spec.objective.trim().length === 0) issues.push('objective is empty');
        if (spec.acceptanceCriteria.length === 0) issues.push('no acceptance criteria');
        if (issues.length === 0) {
          console.log('spec: OK');
          return;
        }
        for (const i of issues) process.stderr.write(`spec: ${i}\n`);
        process.exitCode = 2;
      } catch (err) {
        process.stderr.write(
          `spec check failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('approve <phase> <num>')
    .description(
      'Run the convergent spec-review gate (and ui-spec-review, if a UI-SPEC.md is present); on pass leave the spec stage (SPEC→IDLE)',
    )
    .option(
      '--allow-spec-review-failure',
      'proceed past a failing/unconverged spec-review instead of refusing; findings still printed',
    )
    .option(
      '--allow-ui-spec-review-failure',
      'proceed past a failing/unconverged ui-spec-review instead of refusing; findings still printed (rec-20260711-004)',
    )
    .action(
      async (
        phase: string,
        num: string,
        opts: { allowSpecReviewFailure?: boolean; allowUiSpecReviewFailure?: boolean },
      ) => {
        const { exitCode } = await specApproveService(
          process.cwd(),
          {
            phase,
            num,
            ...(opts.allowSpecReviewFailure !== undefined ? { allowSpecReviewFailure: opts.allowSpecReviewFailure } : {}),
            ...(opts.allowUiSpecReviewFailure !== undefined ? { allowUiSpecReviewFailure: opts.allowUiSpecReviewFailure } : {}),
          },
          processIO(),
        );
        if (exitCode) process.exitCode = exitCode;
      },
    );
}
