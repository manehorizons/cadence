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
  /**
   * Telemetry-exempt write path (Phase 194 / issue #234). For purely
   * informational `session` counters — currently just
   * `session.subagentSpawns` — that must never be able to trip the
   * optimistic-concurrency guard `commit()` enforces via `revision`.
   *
   * Re-reads `state.json` fresh from disk (ignores any caller-supplied
   * in-memory snapshot), applies `amount` to the named field, and writes
   * `state.json` + `STATE.md` back — WITHOUT comparing to or bumping
   * `revision`, so this call can never throw `StateConflictError` and never
   * causes a concurrent caller's own `commit()` to fail. This is a
   * deliberate "last write wins" trade-off for a field nothing structural
   * depends on — see `SimpleStateBackend.bumpSessionCounter`'s doc comment
   * for the narrow residual race this accepts. A no-op (not an error) when
   * `state.json` does not exist yet — there is no session to attach
   * telemetry to before first init.
   */
  bumpSessionCounter(field: 'subagentSpawns', amount: number): Promise<void>;
  archive(milestone: string): Promise<void>;
  beforeBranchSwitch?(from: string, to: string): Promise<void>;
  afterBranchSwitch?(branch: string): Promise<void>;
}
