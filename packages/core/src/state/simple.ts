import { readFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CadenceStateZ, type CadenceState } from '@manehorizons/cadence-types';
import { StateCorruptError, NotInitializedError, StateConflictError } from '../errors.js';
import { atomicWriteJSON, atomicWriteText } from './atomic-write.js';
import { renderStateMd } from '../render/state-md.js';
import type { StateBackend } from './backend.js';

export class SimpleStateBackend implements StateBackend {
  constructor(private readonly repoRoot: string) {}

  async resolveStateDir(): Promise<string> {
    return join(this.repoRoot, '.cadence');
  }

  async readState(): Promise<CadenceState> {
    const path = join(await this.resolveStateDir(), 'state.json');
    if (!existsSync(path)) {
      throw new NotInitializedError();
    }
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
    } catch (err) {
      throw new StateCorruptError(`Cannot read state.json: ${(err as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new StateCorruptError(`state.json is not valid JSON: ${(err as Error).message}`);
    }
    const result = CadenceStateZ.safeParse(parsed);
    if (!result.success) {
      throw new StateCorruptError(`state.json failed schema validation: ${result.error.message}`);
    }
    return result.data;
  }

  /**
   * Write `state.json` AND the derived `STATE.md` together (Phase 41.1). The
   * single public write path — callers can no longer write one without the
   * other, killing the stale-STATE.md class.
   *
   * Optimistic concurrency (Phase 173): before writing, compares the
   * on-disk `revision` to `state.revision`. A mismatch means another writer
   * committed in between — refuse rather than silently clobber. On success
   * `state.revision` is bumped in place (mutating the caller's object), so a
   * caller that issues multiple sequential commits on the same in-memory
   * state (e.g. a hook handler with two independent write branches) stays in
   * sync automatically. No on-disk file yet (first-ever write for this
   * checkout) skips the check entirely — there is nothing to conflict with.
   */
  async commit(state: CadenceState, opts: { force?: boolean } = {}): Promise<void> {
    const dir = await this.resolveStateDir();
    const statePath = join(dir, 'state.json');
    if (existsSync(statePath)) {
      const onDisk = await this.readState();
      if (onDisk.revision !== state.revision) {
        if (!opts.force) {
          throw new StateConflictError(
            `state.json changed since you read it (you had revision ${state.revision}, current is ${onDisk.revision}) — re-run this command to pick up the latest state.`,
            { expectedRevision: state.revision, actualRevision: onDisk.revision },
          );
        }
        process.stderr.write(
          `cadence: force bypassing a state.json conflict (you had revision ${state.revision}, current is ${onDisk.revision}) — overwriting\n`,
        );
      }
      state.revision = onDisk.revision + 1;
    }
    await this.writeState(state);
    await atomicWriteText(
      join(await this.resolveStateDir(), 'STATE.md'),
      renderStateMd(state),
    );
  }

  /** Internal `state.json` primitive (Phase 41.1: private — use `commit`). */
  private async writeState(state: CadenceState): Promise<void> {
    const dir = await this.resolveStateDir();
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    CadenceStateZ.parse(state);
    await atomicWriteJSON(join(dir, 'state.json'), state);
  }

  async archive(milestone: string): Promise<void> {
    const dir = await this.resolveStateDir();
    const phasesDir = join(dir, 'phases');
    const archiveDir = join(dir, 'archive', milestone);
    await mkdir(archiveDir, { recursive: true });
    if (existsSync(phasesDir)) {
      await rename(phasesDir, join(archiveDir, 'phases'));
      await mkdir(phasesDir, { recursive: true });
    }
  }
}
