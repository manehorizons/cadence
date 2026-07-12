import type { CadenceState } from '@manehorizons/cadence-types';

export interface StateBackend {
  resolveStateDir(): Promise<string>;
  readState(): Promise<CadenceState>;
  /**
   * Write `state.json` + the derived `STATE.md` together (Phase 41.1). The
   * former `writeState` is now private to the implementation — `commit` is
   * the only public write path, so STATE.md can never go stale.
   *
   * Optimistic concurrency (Phase 173): compares the current on-disk
   * `revision` to `state.revision` (the revision the caller's in-memory copy
   * was read at). A mismatch means another writer committed since this
   * caller read — refuses with `StateConflictError` rather than silently
   * overwriting, unless `opts.force` is set. On success, mutates
   * `state.revision` in place so a caller issuing several sequential
   * commits on the same object stays in sync without re-reading.
   */
  commit(state: CadenceState, opts?: { force?: boolean }): Promise<void>;
  archive(milestone: string): Promise<void>;
  beforeBranchSwitch?(from: string, to: string): Promise<void>;
  afterBranchSwitch?(branch: string): Promise<void>;
}
