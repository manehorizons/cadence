import type { CadenceState } from '@cadence/types';

export interface StateBackend {
  resolveStateDir(): Promise<string>;
  readState(): Promise<CadenceState>;
  writeState(state: CadenceState): Promise<void>;
  archive(milestone: string): Promise<void>;
  beforeBranchSwitch?(from: string, to: string): Promise<void>;
  afterBranchSwitch?(branch: string): Promise<void>;
}
