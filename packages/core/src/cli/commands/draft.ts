import type { Command } from 'commander';
import { draftCheckService } from '../../services/draft-check.js';
import { draftApproveService } from '../../services/draft-approve.js';
import {
  draftSetObjectiveService,
  draftAddAcService,
  draftAddTaskService,
} from '../../services/draft-mutate.js';
import { processIO } from '../../services/io.js';
import { registerDraftNew } from './draft-new.js';

/** `--files a.ts,b.ts` / `--done AC-1,AC-2` → trimmed non-empty tokens. */
function splitCsv(v: string): string[] {
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

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

  cmd
    .command('set-objective <phase> <num>')
    .description("Replace a PENDING draft's ## Objective body (Phase 151)")
    .requiredOption('--text <t>', 'New objective sentence')
    .action(async (phase: string, num: string, opts: { text: string }) => {
      const { exitCode } = await draftSetObjectiveService(
        process.cwd(),
        { phase, num, text: opts.text },
        processIO(),
      );
      if (exitCode) process.exitCode = exitCode;
    });

  cmd
    .command('add-ac <phase> <num>')
    .description('Append a sequential AC block to a PENDING draft (Phase 151)')
    .requiredOption('--given <g>', 'Given (precondition)')
    .requiredOption('--when <w>', 'When (action)')
    .requiredOption('--then <t>', 'Then (outcome)')
    .option('--name <n>', 'AC name (optional)')
    .action(
      async (
        phase: string,
        num: string,
        opts: { given: string; when: string; then: string; name?: string },
      ) => {
        const { exitCode } = await draftAddAcService(
          process.cwd(),
          {
            phase,
            num,
            given: opts.given,
            when: opts.when,
            then: opts.then,
            ...(opts.name !== undefined ? { name: opts.name } : {}),
          },
          processIO(),
        );
        if (exitCode) process.exitCode = exitCode;
      },
    );

  cmd
    .command('add-task <phase> <num>')
    .description('Append a sequential Task block to a PENDING draft (Phase 151)')
    .requiredOption('--files <f1,f2,...>', 'Comma-separated touched files')
    .requiredOption('--action <a>', 'What to do')
    .requiredOption('--verify <v>', 'How to verify')
    .requiredOption('--done <ids>', 'Comma-separated AC id(s) this task satisfies')
    .action(
      async (
        phase: string,
        num: string,
        opts: { files: string; action: string; verify: string; done: string },
      ) => {
        const { exitCode } = await draftAddTaskService(
          process.cwd(),
          {
            phase,
            num,
            files: splitCsv(opts.files),
            action: opts.action,
            verify: opts.verify,
            done: splitCsv(opts.done),
          },
          processIO(),
        );
        if (exitCode) process.exitCode = exitCode;
      },
    );
}
