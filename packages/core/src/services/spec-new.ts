import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SimpleStateBackend } from '../state/simple.js';
import { readRecommendationLedger } from '../intelligence/store/io.js';
import { runRecommendationTransition } from '../intelligence/store/recommendations.js';
import { loadConfig } from '../config/loader.js';
import { phaseNumber } from '../phases/collision.js';
import { assertNoPhaseCollision } from '../phases/guard.js';
import { assertSafePhaseSlug, derivePhaseTaskId } from '../phases/id.js';
import { renderUiSpecScaffold } from '../parse/ui-spec-parser.js';
import { formatCommandError } from './format-command-error.js';
import type { CommandIO, CommandResult } from './io.js';

/** `cadence spec new <phase> <num>` — scaffold a SPEC.md (IDLE→SPEC). */
export async function specNewService(
  repoRoot: string,
  args: {
    phase: string;
    num: string;
    title?: string;
    fromRec?: string;
    allowPhaseCollision?: boolean;
    ui?: boolean;
  },
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
    const phase = assertSafePhaseSlug(args.phase);
    const dir = join(repoRoot, '.cadence', 'phases', phase);
    const id = derivePhaseTaskId(phase, args.num);
    const path = join(dir, `${id}-SPEC.md`);
    if (existsSync(path)) {
      io.err(`SPEC already exists: ${path}\n`);
      return { exitCode: 2 };
    }
    const uiSpecPath = join(dir, `${id}-UI-SPEC.md`);
    if (args.ui === true && existsSync(uiSpecPath)) {
      io.err(`UI-SPEC already exists: ${uiSpecPath}\n`);
      return { exitCode: 2 };
    }
    // Phase 83: worktree-collision guard — refuse a phase number already in use
    // by a sibling worktree or upstream, before any file is created. Additive to
    // the local `existsSync` refusal above; best-effort config load (defaults on
    // failure). `--allow-phase-collision` bypasses this, never the existsSync.
    const config = await loadConfig(repoRoot).catch(() => undefined);
    if (config) {
      const verdict = await assertNoPhaseCollision(repoRoot, phaseNumber(phase), {
        config,
        // Local is excluded from scaffold-time matching — the dir is being
        // created, so a same-number local dir is self, not a collision. The
        // collision authority is sibling worktrees + upstream. (Local still
        // feeds `nextFree`.) The same-dir `existsSync` above guards local dups.
        excludeSources: ['local'],
        ...(args.allowPhaseCollision !== undefined ? { allow: args.allowPhaseCollision } : {}),
      });
      if (!verdict.ok) {
        io.err(verdict.message);
        return { exitCode: 1 };
      }
    }
    await mkdir(dir, { recursive: true });
    const body = `---\nphase: ${args.phase}\nid: ${id}\nstatus: PENDING\n---\n\n# ${id} — ${title}\n\n## Objective\n\n_(one sentence)_\n\n## Acceptance Criteria\n\n### AC-1: _(name)_\nGiven _(precondition)_\nWhen _(action)_\nThen _(outcome)_\n\n## Constraints\n\n- _(constraint)_\n\n## Open Questions\n\n- _(question)_\n`;
    await writeFile(path, body.replace(`phase: ${args.phase}`, `phase: ${phase}`));

    if (args.ui === true) {
      await writeFile(uiSpecPath, renderUiSpecScaffold(phase, id));
      io.out(`Created ${uiSpecPath}\n`);
    }

    state.activePhase = phase;
    state.activeSpec = id;
    state.loopPosition = 'SPEC';
    await backend.commit(state);

    io.out(`Created ${path}\n`);

    if (args.fromRec !== undefined) {
      const convertRes = await runRecommendationTransition(repoRoot, args.fromRec, 'convert', phase);
      if (!convertRes.ok) {
        io.err(
          `spec new: scaffold succeeded but convert failed: ${convertRes.error}. ` +
            `Run \`cadence recommendation convert ${args.fromRec} --to-phase ${phase}\` to retry.\n`,
        );
        return { exitCode: 1, data: { path, id, converted: false } };
      }
      io.out(`recommendation ${args.fromRec} → converted (to ${args.phase})\n`);
    }
    return { exitCode: 0, data: { path, id, converted: args.fromRec !== undefined } };
  } catch (err) {
    io.err(`${formatCommandError('spec new', err)}\n`);
    return { exitCode: 1 };
  }
}
