import type { Command } from 'commander';
import { draftCheckService } from '../../services/draft-check.js';
import { draftApproveService } from '../../services/draft-approve.js';
import { processIO } from '../../services/io.js';
import { registerDraftNew } from './draft-new.js';

// Re-exported for the `ask-approve-verdict` suite (moved to gates/approve.ts).
export { askApproveVerdict } from '../../gates/approve.js';

export function registerDraftCommand(program: Command): void {
  const cmd = program.command('draft').description('Draft phase workflow');

  registerDraftNew(cmd);

  cmd
    .command('check <path>')
    .description('Coherence-check a DRAFT.md against state.json + PROJECT.md')
    .action(async (path: string) => {
      const { exitCode } = await draftCheckService(process.cwd(), { path }, processIO());
      if (exitCode) process.exitCode = exitCode;
    });

  cmd
    .command('approve <phase> <num>')
    .description('Approve a draft and enter BUILD phase')
    .option('--allow-auto-complex', 'override DESIGN.md §4 M2 soft cap: approve an auto × complex draft anyway')
    .option('--no-approve', "bypass the manual approve gate (Phase 24.1) per invocation; required for non-TTY runs when the 'approve' gate is in the effective set")
    .option('--allow-plan-review-failure', 'proceed past a failing plan-review gate (Phase 25.1) instead of refusing approve; findings are still printed')
    .action(
      async (
        phase: string,
        num: string,
        opts: { allowAutoComplex?: boolean; approve?: boolean; allowPlanReviewFailure?: boolean },
      ) => {
        const { exitCode } = await draftApproveService(
          process.cwd(),
          {
            phase,
            num,
            ...(opts.allowAutoComplex !== undefined ? { allowAutoComplex: opts.allowAutoComplex } : {}),
            ...(opts.approve !== undefined ? { approve: opts.approve } : {}),
            ...(opts.allowPlanReviewFailure !== undefined ? { allowPlanReviewFailure: opts.allowPlanReviewFailure } : {}),
          },
          processIO(),
        );
        if (exitCode) process.exitCode = exitCode;
      },
    );
}
