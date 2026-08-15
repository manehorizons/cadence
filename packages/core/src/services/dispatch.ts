import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import type { TaskClass } from '@thomas-powers-jr/cadence-types';
import { SimpleStateBackend } from '../state/simple.js';
import { assertSafePhaseSlug } from '../phases/id.js';
import { parseDraftMd } from '../parse/draft-parser.js';
import { computeWaves } from '../dispatch/wave-planner.js';
import { renderPacket, renderPacketBase, recommendIsolation } from '../dispatch/packet.js';
import { resolveTaskClass, classifyTaskExecution, FILE_BYTES_CAP } from '../dispatch/policy.js';
import type { WaveExecutionContext, DispatchSignals, ExecutionVerdict } from '../dispatch/policy.js';
import { loadConfig } from '../config/loader.js';
import type { ProgressJson } from '../gates/types.js';
import { formatCommandError } from './format-command-error.js';
import type { CommandIO, CommandResult } from './io.js';

interface DispatchTaskPlan {
  id: string;
  name: string;
  packet: string;
  recommendedIsolation: 'worktree' | 'none';
  execution: 'inline' | 'dispatch';
  modelClass: TaskClass;
  model: string;
  reasons: string[];
}
interface DispatchWavePlan {
  wave: number;
  tasks: DispatchTaskPlan[];
}

function reportNothing(io: CommandIO, args: { json?: boolean }, message: string): CommandResult {
  if (args.json) {
    io.out(JSON.stringify({ waves: [], message }) + '\n');
  } else {
    io.out(`${message}\n`);
  }
  return { exitCode: 0, data: { waves: [], message } };
}

/**
 * Missing or unparseable PROGRESS.json both degrade to "no tasks started
 * yet" — never throws, matching the design's fail-open posture (Spec 1's
 * checks follow the same rule).
 */
async function readProgressOrEmpty(progPath: string, draftId: string): Promise<ProgressJson> {
  if (!existsSync(progPath)) return { draftId, tasks: {} };
  try {
    return JSON.parse(await readFile(progPath, 'utf8')) as ProgressJson;
  } catch {
    return { draftId, tasks: {} };
  }
}

/**
 * A declared file's on-disk byte size, or 0 on any failure (missing file,
 * stat error) — mirrors `readProgressOrEmpty`'s fail-open posture: a
 * declared file the size estimator can't read degrades to "contributes
 * nothing", never a thrown error or a silent guess. Synchronous so the
 * existing per-task `.map()` structure doesn't need to become async.
 */
function fileBytesOrZero(absPath: string): number {
  if (!existsSync(absPath)) return 0;
  try {
    return statSync(absPath).size;
  } catch {
    return 0;
  }
}

/**
 * `cadence dispatch plan` — read-only. Computes the next wave-based subagent
 * dispatch plan from the active BUILD draft + PROGRESS.json. Never mutates
 * state; the host-side `/cadence-dispatch` command consumes this as the
 * single source of truth (Spec 2).
 */
export async function dispatchPlanService(
  repoRoot: string,
  io: CommandIO,
  args: { json?: boolean } = {},
): Promise<CommandResult> {
  try {
    const backend = new SimpleStateBackend(repoRoot);
    const state = await backend.readState();
    if (state.loopPosition !== 'BUILD' || !state.activeDraft || !state.activePhase) {
      return reportNothing(io, args, 'nothing to plan — no active BUILD draft');
    }

    const activePhase = assertSafePhaseSlug(state.activePhase);
    const draftPath = join(repoRoot, '.cadence/phases', activePhase, `${state.activeDraft}-DRAFT.md`);
    const draft = parseDraftMd(await readFile(draftPath, 'utf8'));

    const progPath = join(repoRoot, '.cadence/phases', activePhase, `${state.activeDraft}-PROGRESS.json`);
    const progress: ProgressJson = await readProgressOrEmpty(progPath, state.activeDraft);

    const waves = computeWaves(draft, progress);
    if (waves.length === 0) {
      return reportNothing(io, args, 'nothing to dispatch — every task is already finished');
    }

    // Loaded once per invocation, only on the real-plan path — an early
    // "nothing to plan"/"nothing to dispatch" return must stay exit-0 even
    // when config.json is broken (loadConfig can throw ConfigInvalidError).
    const config = await loadConfig(repoRoot);
    const classById = new Map(draft.tasks.map((t) => [t.id, resolveTaskClass(t)]));

    const byId = new Map(draft.tasks.map((t) => [t.id, t]));
    const plan: DispatchWavePlan[] = waves.map((w) => {
      const waveClasses: Record<string, TaskClass> = {};
      for (const id of w.taskIds) waveClasses[id] = classById.get(id)!;
      return {
        wave: w.wave,
        tasks: w.taskIds.map((id) => {
          const task = byId.get(id)!;
          const basePacket = renderPacketBase(task, draft);
          const declaredFileBytes = task.files.reduce(
            (sum, f) => sum + Math.min(fileBytesOrZero(join(repoRoot, f)), FILE_BYTES_CAP),
            0,
          );
          const signals: DispatchSignals = {
            packetChars: basePacket.length,
            declaredFileBytes,
            // ALWAYS null (D-DQ3) — tokenUtilization is a confirmed-fake
            // synthetic counter; no real context-utilization reading is
            // wired into dispatch planning this phase.
            contextUtilization: null,
          };
          const waveCtx: WaveExecutionContext = { wave: w.wave, waveClasses };
          const verdict: ExecutionVerdict = classifyTaskExecution(task, waveCtx, config, signals);
          return {
            id: task.id,
            name: task.name,
            packet: renderPacket(task, draft, verdict),
            recommendedIsolation: recommendIsolation(task),
            execution: verdict.execution,
            modelClass: verdict.modelClass,
            model: verdict.model,
            reasons: verdict.reasons,
          };
        }),
      };
    });

    if (args.json) {
      // signals is a stdout-JSON-shape addition only (D-DQ3) — the budget
      // signal is always null, never wired to a real reading this phase.
      io.out(JSON.stringify({ waves: plan, signals: { contextUtilization: null } }) + '\n');
    } else {
      for (const w of plan) {
        io.out(`Wave ${w.wave}:\n`);
        for (const t of w.tasks) {
          const detail = t.execution === 'dispatch' ? `${t.execution}, ${t.modelClass}` : t.execution;
          io.out(`  ${t.id}: ${t.name} [${detail}]\n`);
        }
      }
      io.out('Run with --json to get each task\'s full dispatch packet.\n');
    }
    return { exitCode: 0, data: { waves: plan } };
  } catch (err) {
    io.err(`${formatCommandError('dispatch plan', err)}\n`);
    return { exitCode: 1 };
  }
}
