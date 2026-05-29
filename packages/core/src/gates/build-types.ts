import type {
  CadenceConfig,
  CadenceState,
  Draft,
  GateSet,
} from '@cadence/types';
import type { PerTaskInput, PerTaskResult } from '../verify/per-task.js';
import type { PerTaskVerifyRecord } from '../build/record.js';
import type { GateResult, IoPort } from './types.js';

/**
 * Build-surface gate contract (Phase 39.7). For the per-task-verify gate that
 * fires at `build task` time on DONE outcomes. Reuses the shared `GateResult`
 * shape parameterized with `BuildProducts` so the gate can hand its
 * `PerTaskVerifyRecord` back to the router (which threads it into
 * `recordTaskOutcome`). The build command router owns context construction.
 */

/** The product a build gate contributes back to the router. */
export interface BuildProducts {
  perTaskRecord?: PerTaskVerifyRecord;
}

/** The subset of `build task` flags the build gates read. */
export interface BuildGateOpts {
  readonly allowPerTaskFailure?: boolean;
}

/** Per-task verifier port (Phase 39.7); lazily `selectPerTaskVerifier`. */
export interface BuildVerifierPorts {
  readonly perTask: { verify(input: PerTaskInput): Promise<PerTaskResult> };
}

/** Notification collaborator for the build gates. */
export interface BuildEmitPort {
  /** per-task-fail anomaly (Phase 24.2). Dispatched UNCONDITIONALLY (the
   *  notifier transport drops it on opted-out profiles — see the original
   *  build.ts note); not under the anomaly-notify guard. */
  perTaskFail(info: {
    taskId: string;
    provider: string;
    reason: string;
    bypassed: boolean;
  }): Promise<void>;
}

/** Everything a build gate may read. Built once by the build router. Readonly. */
export interface BuildGateContext {
  readonly cwd: string;
  readonly state: CadenceState;
  readonly draft: Draft;
  readonly config: CadenceConfig | null;
  readonly gateSet: GateSet;
  readonly taskId: string;
  readonly opts: BuildGateOpts;
  /** `git diff --no-color HEAD -- <files>`; empty string on any error / no git. */
  diff(files: string[]): string;
  readonly verifiers: BuildVerifierPorts;
  readonly emit: BuildEmitPort;
  readonly io: IoPort;
}

export type BuildGateImpl = (
  ctx: BuildGateContext,
) => Promise<GateResult<BuildProducts>>;
