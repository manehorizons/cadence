import type { KeelState } from '@keel/types';

export interface StateBackend {
  resolveStateDir(): Promise<string>;
  readState(): Promise<KeelState>;
  writeState(state: KeelState): Promise<void>;
  archive(milestone: string): Promise<void>;
  beforeBranchSwitch?(from: string, to: string): Promise<void>;
  afterBranchSwitch?(branch: string): Promise<void>;
}
