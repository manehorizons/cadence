import type { Command } from 'commander';
import { buildTaskService } from '../../services/build-task.js';
import { processIO } from '../../services/io.js';

// Phase 280 (280-01, T12) — dispatch-contract CLI surface. Kept as plain
// literal-array membership checks (mirroring the `activate.ts`/`mcp.ts`/
// `recommendation promote`'s `--readiness` precedent) rather than commander's
// `.choices()`, so the refusal message and exit code match this file's
// existing `Invalid task status: ...` convention. No shared Zod enum exists
// for `execution`/`isolation` (only `modelClass` overlaps `TaskClassZ` in
// `@thomas-powers-jr/cadence-types`) — all three stay local for symmetry.
const EXECUTION_VALUES = ['inline', 'dispatch'] as const;
type ExecutionValue = (typeof EXECUTION_VALUES)[number];

const ISOLATION_VALUES = ['worktree', 'none'] as const;
type IsolationValue = (typeof ISOLATION_VALUES)[number];

const MODEL_CLASS_VALUES = ['mechanical', 'standard', 'complex'] as const;
type ModelClassValue = (typeof MODEL_CLASS_VALUES)[number];

export function registerBuildCommand(program: Command): void {
  const cmd = program.command('build').description('BUILD phase task tracking');

  cmd
    .command('task <id>')
    .description('Record outcome for task <id>')
    .option('--status <s>', 'DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED', 'DONE')
    .option('--notes <n>', 'Notes', '')
    .option(
      '--allow-per-task-failure',
      'bypass the per-task verifier gate (Phase 24.2): record DONE even if the verifier refuses',
    )
    .option(
      '--allow-boundary-breach',
      'bypass a block-mode boundary refusal (Phase 280 dispatch contract): record the task past ' +
        "a files-outside-boundary finding anyway, emitting a bypassed error-severity anomaly -- " +
        'never bypasses the (warn-only) redundancy check',
    )
    .option(
      '--execution <execution>',
      'inline | dispatch — how this task was actually carried out; absent means untracked, ' +
        'conceptually equivalent to inline (Phase 280 dispatch contract)',
    )
    .option(
      '--isolation <isolation>',
      'worktree | none — whether the task ran under worktree isolation (Phase 280 dispatch contract)',
    )
    .option(
      '--model-class <modelClass>',
      'mechanical | standard | complex — the model-class tier the task was routed to (Phase 280 dispatch contract)',
    )
    .action(
      async (
        taskId: string,
        opts: {
          status: string;
          notes: string;
          allowPerTaskFailure?: boolean;
          allowBoundaryBreach?: boolean;
          execution?: string;
          isolation?: string;
          modelClass?: string;
        },
      ) => {
        const io = processIO();
        if (
          opts.execution !== undefined &&
          !EXECUTION_VALUES.includes(opts.execution as ExecutionValue)
        ) {
          io.err(
            `build task: invalid --execution "${opts.execution}". Allowed: ${EXECUTION_VALUES.join(' | ')}\n`,
          );
          process.exitCode = 2;
          return;
        }
        if (
          opts.isolation !== undefined &&
          !ISOLATION_VALUES.includes(opts.isolation as IsolationValue)
        ) {
          io.err(
            `build task: invalid --isolation "${opts.isolation}". Allowed: ${ISOLATION_VALUES.join(' | ')}\n`,
          );
          process.exitCode = 2;
          return;
        }
        if (
          opts.modelClass !== undefined &&
          !MODEL_CLASS_VALUES.includes(opts.modelClass as ModelClassValue)
        ) {
          io.err(
            `build task: invalid --model-class "${opts.modelClass}". Allowed: ${MODEL_CLASS_VALUES.join(' | ')}\n`,
          );
          process.exitCode = 2;
          return;
        }
        const { exitCode } = await buildTaskService(
          process.cwd(),
          {
            taskId,
            status: opts.status,
            notes: opts.notes,
            ...(opts.allowPerTaskFailure !== undefined ? { allowPerTaskFailure: opts.allowPerTaskFailure } : {}),
            ...(opts.allowBoundaryBreach !== undefined ? { allowBoundaryBreach: opts.allowBoundaryBreach } : {}),
            ...(opts.execution !== undefined ? { execution: opts.execution as ExecutionValue } : {}),
            ...(opts.isolation !== undefined ? { isolation: opts.isolation as IsolationValue } : {}),
            ...(opts.modelClass !== undefined ? { modelClass: opts.modelClass as ModelClassValue } : {}),
          },
          io,
        );
        if (exitCode) process.exitCode = exitCode;
      },
    );
}
