import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SimpleStateBackend } from '../state/simple.js';
import { readRecommendationLedger } from '../intelligence/store/io.js';
import { runRecommendationTransition } from '../intelligence/store/recommendations.js';
import type { CommandIO, CommandResult } from './io.js';

/** `cadence spec new <phase> <num>` — scaffold a SPEC.md (IDLE→SPEC). */
export async function specNewService(
  repoRoot: string,
  args: { phase: string; num: string; title?: string; fromRec?: string },
  io: CommandIO,
): Promise<CommandResult> {
  const title = args.title ?? 'Untitled';
  try {
    const backend = new SimpleStateBackend(repoRoot);
    const state = await backend.readState();
    if (state.loopPosition !== 'IDLE') {
      io.err(
        `spec new refused: loopPosition is ${state.loopPosition}, not IDLE. ` +
          `Approve/settle/discard the active unit first.\n`,
      );
      return { exitCode: 1 };
    }
    if (args.fromRec !== undefined) {
      const recLedger = await readRecommendationLedger(repoRoot);
      const rec = recLedger.recommendations.find((r) => r.id === args.fromRec);
      if (!rec) {
        io.err(`spec new refused: recommendation ${args.fromRec} not found\n`);
        return { exitCode: 1 };
      }
      if (rec.status !== 'candidate' && rec.status !== 'accepted') {
        io.err(`spec new refused: cannot convert recommendation in status ${rec.status}\n`);
        return { exitCode: 1 };
      }
    }
    const dir = join(repoRoot, '.cadence', 'phases', args.phase);
    const padded = args.num.padStart(2, '0');
    const id = `${args.phase.slice(0, 2)}-${padded}`;
    const path = join(dir, `${id}-SPEC.md`);
    if (existsSync(path)) {
      io.err(`SPEC already exists: ${path}\n`);
      return { exitCode: 2 };
    }
    await mkdir(dir, { recursive: true });
    const body = `---\nphase: ${args.phase}\nid: ${id}\nstatus: PENDING\n---\n\n# ${id} — ${title}\n\n## Objective\n\n_(one sentence)_\n\n## Acceptance Criteria\n\n### AC-1: _(name)_\nGiven _(precondition)_\nWhen _(action)_\nThen _(outcome)_\n\n## Constraints\n\n- _(constraint)_\n\n## Open Questions\n\n- _(question)_\n`;
    await writeFile(path, body);

    state.activePhase = args.phase;
    state.activeSpec = id;
    state.loopPosition = 'SPEC';
    await backend.commit(state);

    io.out(`Created ${path}\n`);

    if (args.fromRec !== undefined) {
      const convertRes = await runRecommendationTransition(repoRoot, args.fromRec, 'convert', args.phase);
      if (!convertRes.ok) {
        io.err(
          `spec new: scaffold succeeded but convert failed: ${convertRes.error}. ` +
            `Run \`cadence recommendation convert ${args.fromRec} --to-phase ${args.phase}\` to retry.\n`,
        );
        return { exitCode: 1, data: { path, id, converted: false } };
      }
      io.out(`recommendation ${args.fromRec} → converted (to ${args.phase})\n`);
    }
    return { exitCode: 0, data: { path, id, converted: args.fromRec !== undefined } };
  } catch (err) {
    io.err(`spec new failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
