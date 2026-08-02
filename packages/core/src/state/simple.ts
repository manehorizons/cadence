import { readFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CadenceStateZ, type CadenceState } from '@thomas-powers-jr/cadence-types';
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
    const dir = await this.resolveStateDir();
    const path = join(dir, 'state.json');
    if (!existsSync(path)) {
      if (existsSync(dir)) {
        // rec-20260726-002: a fresh git worktree/clone carries the committed
        // .cadence/ scaffold but never state.json (gitignored since phase
        // 196) — `cadence init` refuses here ("already initialized"), so
        // point at `cadence onboard`, which bootstraps exactly this case.
        throw new NotInitializedError(
          '.cadence/ exists but state.json is missing (likely a fresh git worktree or clone — state.json is gitignored, not copied by git) — run `cadence onboard` to bootstrap it.',
        );
      }
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

  /**
   * Telemetry-exempt write path (Phase 194 / issue #234). See the
   * `StateBackend` interface doc for the full rationale — this deliberately
   * skips the `revision` compare-and-swap `commit()` performs so a
   * telemetry-only counter bump can never throw `StateConflictError` or
   * invalidate another writer's in-flight snapshot.
   *
   * Re-reads `state.json` fresh (never trusts a caller-held in-memory
   * copy), bumps the named field on that snapshot, and writes the whole
   * snapshot back — unconditionally, with no compare-and-swap. This
   * narrows (versus the bug this exists to fix) but does not fully close
   * one race: if a `commit()` elsewhere reads, checks, and writes in the
   * gap between this method's own read and write, this write will still
   * land and silently overwrite that commit's structural change with this
   * method's stale copy plus the bumped counter — no error either side.
   * That window is a single read→write round trip (this repo has no lock
   * file), versus the multi-minute `host-cli` gate window that produced
   * issue #234, so the residual risk is accepted as deliberately, vastly
   * narrower than the bug being fixed — a trade-off made on purpose for a
   * telemetry field nothing structural depends on, not an accidental side
   * effect of skipping `commit()`'s guard.
   */
  async bumpSessionCounter(field: 'subagentSpawns', amount: number): Promise<void> {
    const dir = await this.resolveStateDir();
    const statePath = join(dir, 'state.json');
    if (!existsSync(statePath)) {
      // No state.json yet (pre-init) — nothing to attach telemetry to.
      return;
    }
    const onDisk = await this.readState();
    onDisk.session[field] = Math.max(0, onDisk.session[field] + amount);
    await this.writeState(onDisk);
    await atomicWriteText(join(dir, 'STATE.md'), renderStateMd(onDisk));
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
