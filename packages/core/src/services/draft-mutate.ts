import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { frontmatterStatus } from '../parse/draft-scaffold.js';
import { setObjective, addAcceptanceCriterion, addTask } from '../parse/draft-mutate.js';
import { assertSafePhaseSlug, derivePhaseTaskId } from '../phases/id.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence draft set-objective / add-ac / add-task` — additive DRAFT.md
 * mutation subcommands (Phase 151). Each reads the on-disk DRAFT.md, refuses
 * unless its frontmatter `status` is `PENDING` (mirroring the guard already
 * used by `draft check`/`draft approve`), then delegates to the pure
 * `draft-mutate.ts` helper and writes the result back to disk.
 */

interface LoadedDraft {
  raw: string;
  path: string;
}

async function loadPendingDraft(
  repoRoot: string,
  phase: string,
  num: string,
  io: CommandIO,
  cmdName: string,
): Promise<LoadedDraft | undefined> {
  const safePhase = assertSafePhaseSlug(phase);
  const id = derivePhaseTaskId(safePhase, num);
  const path = join(repoRoot, '.cadence', 'phases', safePhase, `${id}-DRAFT.md`);
  if (!existsSync(path)) {
    io.err(`draft ${cmdName} refused: ${path} not found.\n`);
    return undefined;
  }
  const raw = await readFile(path, 'utf8');
  const status = frontmatterStatus(raw);
  if (status !== 'PENDING') {
    io.err(
      `draft ${cmdName} refused: draft status is ${status ?? 'unknown'}, not PENDING.\n`,
    );
    return undefined;
  }
  return { raw, path };
}

export async function draftSetObjectiveService(
  repoRoot: string,
  args: { phase: string; num: string; text: string },
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const loaded = await loadPendingDraft(repoRoot, args.phase, args.num, io, 'set-objective');
    if (!loaded) return { exitCode: 1 };
    const updated = setObjective(loaded.raw, args.text);
    await writeFile(loaded.path, updated);
    io.out(`Updated ${loaded.path}\n`);
    return { exitCode: 0, data: { path: loaded.path } };
  } catch (err) {
    io.err(`draft set-objective failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}

export async function draftAddAcService(
  repoRoot: string,
  args: { phase: string; num: string; given: string; when: string; then: string; name?: string },
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const loaded = await loadPendingDraft(repoRoot, args.phase, args.num, io, 'add-ac');
    if (!loaded) return { exitCode: 1 };
    const updated = addAcceptanceCriterion(loaded.raw, {
      given: args.given,
      when: args.when,
      then: args.then,
      ...(args.name !== undefined ? { name: args.name } : {}),
    });
    await writeFile(loaded.path, updated);
    io.out(`Updated ${loaded.path}\n`);
    return { exitCode: 0, data: { path: loaded.path } };
  } catch (err) {
    io.err(`draft add-ac failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}

export async function draftAddTaskService(
  repoRoot: string,
  args: {
    phase: string;
    num: string;
    files: string[];
    action: string;
    verify: string;
    done: string[];
  },
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const loaded = await loadPendingDraft(repoRoot, args.phase, args.num, io, 'add-task');
    if (!loaded) return { exitCode: 1 };
    const updated = addTask(loaded.raw, {
      files: args.files,
      action: args.action,
      verify: args.verify,
      done: args.done,
    });
    await writeFile(loaded.path, updated);
    io.out(`Updated ${loaded.path}\n`);
    return { exitCode: 0, data: { path: loaded.path } };
  } catch (err) {
    io.err(`draft add-task failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
