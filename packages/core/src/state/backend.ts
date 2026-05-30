import type { CadenceState } from '@manehorizons/cadence-types';

export interface StateBackend {
  resolveStateDir(): Promise<string>;
  readState(): Promise<CadenceState>;
  /** Write `state.json` + the derived `STATE.md` together (Phase 41.1). The
   *  former `writeState` is now private to the implementation — `commit` is the
   *  only public write path, so STATE.md can never go stale. */
  commit(state: CadenceState): Promise<void>;
  archive(milestone: string): Promise<void>;
  beforeBranchSwitch?(from: string, to: string): Promise<void>;
  afterBranchSwitch?(branch: string): Promise<void>;
}
