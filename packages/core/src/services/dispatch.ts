import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { SimpleStateBackend } from '../state/simple.js';
import { assertSafePhaseSlug } from '../phases/id.js';
import { parseDraftMd } from '../parse/draft-parser.js';
import { computeWaves } from '../dispatch/wave-planner.js';
import { renderPacket } from '../dispatch/packet.js';
import type { ProgressJson } from '../gates/types.js';
import type { CommandIO, CommandResult } from './io.js';

interface DispatchTaskPlan {
  id: string;
  name: string;
  packet: string;
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

    const byId = new Map(draft.tasks.map((t) => [t.id, t]));
    const plan: DispatchWavePlan[] = waves.map((w) => ({
      wave: w.wave,
      tasks: w.taskIds.map((id) => {
        const task = byId.get(id)!;
        return { id: task.id, name: task.name, packet: renderPacket(task, draft) };
      }),
    }));

    if (args.json) {
      io.out(JSON.stringify({ waves: plan }) + '\n');
    } else {
      for (const w of plan) {
        io.out(`Wave ${w.wave}:\n`);
        for (const t of w.tasks) io.out(`  ${t.id}: ${t.name}\n`);
      }
      io.out('Run with --json to get each task\'s full dispatch packet.\n');
    }
    return { exitCode: 0, data: { waves: plan } };
  } catch (err) {
    io.err(`dispatch plan failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
