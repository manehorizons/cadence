import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  TaskStatusZ,
  type AnomalyEvent,
} from '@cadence/types';
import {
  recordTaskOutcome,
  type PerTaskVerifyRecord,
  type RecordableStatus,
} from '../../build/record.js';
import { LoopViolationError } from '../../errors.js';
import { emitLoopViolation } from '../../notify/loop-violation.js';
import { loadConfig } from '../../config/loader.js';
import { effectiveGateSet } from '../../gates/engine.js';
import { selectNotifier } from '../../notify/factory.js';
import { selectPerTaskVerifier } from '../../verify/per-task-factory.js';
import { parseDraftMd } from '../../parse/draft-parser.js';
import { SimpleStateBackend } from '../../state/simple.js';

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
    .action(
      async (
        taskId: string,
        opts: {
          status: string;
          notes: string;
          allowPerTaskFailure?: boolean;
        },
      ) => {
        try {
          const statusParse = TaskStatusZ.safeParse(opts.status);
          if (
            !statusParse.success ||
            statusParse.data === 'PENDING' ||
            statusParse.data === 'IN_PROGRESS'
          ) {
            process.stderr.write(
              `Invalid task status: ${opts.status}. Allowed: DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED\n`,
            );
            process.exitCode = 2;
            return;
          }
          const status = statusParse.data as RecordableStatus;

          // Phase 29.8 T3 — validate the task id against the active DRAFT's
          // declared tasks so a typo'd / unknown id (e.g. `T1--status=DONE`
          // from a missing space) errors instead of silently recording a
          // ghost task. Only validates when a DRAFT is resolvable; the
          // no-active-draft / loop-violation paths are handled downstream.
          {
            const vBackend = new SimpleStateBackend(process.cwd());
            const vState = await vBackend.readState();
            if (vState.activePhase && vState.activeDraft) {
              const vDraftPath = join(
                process.cwd(),
                '.cadence',
                'phases',
                vState.activePhase,
                `${vState.activeDraft}-DRAFT.md`,
              );
              if (existsSync(vDraftPath)) {
                const vDraft = parseDraftMd(await readFile(vDraftPath, 'utf8'));
                const validIds = vDraft.tasks.map((t) => t.id);
                if (!validIds.includes(taskId)) {
                  process.stderr.write(
                    `build task: unknown task id "${taskId}". ` +
                      `Valid ids in ${vState.activeDraft}-DRAFT.md: ${validIds.join(', ') || '(none)'}. ` +
                      `Nothing recorded.\n`,
                  );
                  process.exitCode = 2;
                  return;
                }
              }
            }
          }

          // Phase 24.2 — per-task verifier gate. Fires only on DONE outcomes
          // (other statuses are explicit human escalations); fires only when
          // 'per-task-verify' is in the effective gate set
          // (strict×standard, strict×complex by default per DESIGN §4.2).
          const cwd = process.cwd();
          let perTaskRecord: PerTaskVerifyRecord | undefined;
          if (status === 'DONE') {
            const gateInfo = await tryPerTaskGate(cwd, taskId);
            if (gateInfo) {
              const { verdict, draftFiles, cfg, notifier } = gateInfo;
              const refused = verdict.verdict === 'refuse';
              const bypassed = refused && opts.allowPerTaskFailure === true;
              perTaskRecord = {
                verdict: verdict.verdict,
                reason: verdict.reason,
                provider: verdict.provider,
                ...(verdict.model ? { model: verdict.model } : {}),
                ...(bypassed ? { bypassed: true } : {}),
              };

              if (refused && !opts.allowPerTaskFailure) {
                process.stderr.write(
                  `per-task-verify refused: ${verdict.reason}\n` +
                    'Pass --allow-per-task-failure to record DONE anyway.\n',
                );
                await emitPerTaskFailIfGated(cfg, notifier, {
                  taskId,
                  provider: verdict.provider,
                  reason: verdict.reason,
                  bypassed: false,
                });
                process.exitCode = 1;
                return;
              }
              if (refused && opts.allowPerTaskFailure) {
                process.stderr.write(
                  'per-task-verify: --allow-per-task-failure set; proceeding past refuse verdict.\n',
                );
                await emitPerTaskFailIfGated(cfg, notifier, {
                  taskId,
                  provider: verdict.provider,
                  reason: verdict.reason,
                  bypassed: true,
                });
              }
              // Silence the unused-binding warning for draftFiles — it
              // exists to make the gate decision auditable at this site.
              void draftFiles;
            }
          }

          await recordTaskOutcome(cwd, taskId, status, opts.notes, perTaskRecord);
          console.log(`Recorded ${taskId}: ${status}`);
        } catch (err) {
          process.stderr.write(
            `build task failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          if (err instanceof LoopViolationError) {
            await emitLoopViolation(process.cwd(), err, 'build.task');
          }
          process.exitCode = 1;
        }
      },
    );
}

interface PerTaskGateInfo {
  verdict: {
    verdict: 'pass' | 'concerns' | 'refuse';
    reason: string;
    provider: string;
    model?: string;
  };
  draftFiles: string[];
  cfg: Awaited<ReturnType<typeof loadConfig>> | null;
  notifier: ReturnType<typeof selectNotifier>;
}

/**
 * Returns gate state when the per-task verifier should run, or `undefined`
 * when the gate is not in the effective set (skip silently).
 */
async function tryPerTaskGate(
  cwd: string,
  taskId: string,
): Promise<PerTaskGateInfo | undefined> {
  const backend = new SimpleStateBackend(cwd);
  const state = await backend.readState();
  if (!state.activePhase || !state.activeDraft) return undefined;

  const cfg = await loadConfig(cwd).catch(() => null);

  // Parse the DRAFT to get the task's declared files.
  const draftPath = join(
    cwd,
    '.cadence',
    'phases',
    state.activePhase,
    `${state.activeDraft}-DRAFT.md`,
  );
  if (!existsSync(draftPath)) return undefined;
  const raw = await readFile(draftPath, 'utf8');
  const draft = parseDraftMd(raw);
  const gateSet = effectiveGateSet(state, cfg, draft);
  if (!gateSet.gates.includes('per-task-verify')) return undefined;

  const task = draft.tasks.find((t) => t.id === taskId);
  const files = task?.files ?? [];
  const diff = collectDiff(cwd, files);

  const verifier = selectPerTaskVerifier(cfg);
  const result = await verifier.verify({ taskId, files, diff });

  return {
    verdict: result,
    draftFiles: files,
    cfg,
    notifier: selectNotifier(cfg),
  };
}

/**
 * `git diff HEAD -- <files>` via execSync. Returns empty string when the
 * repo isn't a git workdir, when there's no diff, or on error — the mock
 * verifier interprets empty diff as `'concerns'`, which is the right
 * conservative default for a non-git workspace.
 */
function collectDiff(cwd: string, files: string[]): string {
  if (files.length === 0) return '';
  try {
    const args = ['diff', '--no-color', 'HEAD', '--', ...files];
    const out = execSync(`git ${args.map(shellQuote).join(' ')}`, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
    return out;
  } catch {
    return '';
  }
}

function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9._/=:@+-]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["\\$`])/g, '\\$1')}"`;
}

async function emitPerTaskFailIfGated(
  cfg: Awaited<ReturnType<typeof loadConfig>> | null,
  notifier: ReturnType<typeof selectNotifier>,
  ctx: { taskId: string; provider: string; reason: string; bypassed: boolean },
): Promise<void> {
  // Anomaly dispatch is bounded by the 'anomaly-notify' gate. The caller
  // already established the per-task-verify gate fired (which lives in a
  // different cell), so re-check the anomaly gate here.
  if (!cfg) return;
  // Re-derive the gate set is overkill — anomaly-notify lives in auto +
  // standard×{standard,complex}; per-task-verify lives in strict×*. They
  // don't overlap in any current cell. But to stay robust under future
  // matrix edits, dispatch unconditionally and let the notifier transport
  // (none) drop on profiles that opted out.
  const event: AnomalyEvent = {
    type: 'per-task-fail',
    severity: 'error',
    message: `per-task-verify ${ctx.bypassed ? 'bypassed' : 'refused'} for ${ctx.taskId}: ${ctx.reason}`,
    context: {
      taskId: ctx.taskId,
      provider: ctx.provider,
      reason: ctx.reason,
      bypassed: ctx.bypassed,
    },
    ts: new Date().toISOString(),
  };
  try {
    await notifier.notify([event]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `cadence-notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
    );
  }
}
