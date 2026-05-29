import type {
  AnomalyEvent,
  CadenceConfig,
  CadenceState,
  DeepVerdict,
  Draft,
  Finding,
  GateSet,
} from '@cadence/types';
import type {
  VerifyInput,
  VerifyResult,
  VerifyTestRef,
} from '../verify/verifier.js';
import type { InteractiveVerdict } from '../verify/interactive.js';

/** Canonical PROGRESS.json shape settle reads. settle.ts's local copy of this
 *  (and of AcResult) is removed in favour of these in Phase 39.1 Task 4. */
export interface ProgressJson {
  draftId: string;
  tasks: Record<
    string,
    { status: string; notes: string; touchedFiles: string[]; updatedAt: string }
  >;
}

/** An AC verdict row destined for SUMMARY.acResults. */
export interface AcResult {
  id: string;
  pass: boolean;
  note?: string;
}

/** Stderr seam. Defaults to process.stderr.write; tests inject a capture. */
export interface IoPort {
  err(s: string): void;
}

/**
 * Injected verifier collaborators. Phase 40.1 consolidates behind this; gates
 * never import a *-factory directly. 39.1 defines ONLY `deep` (what it
 * exercises); 39.4/39.5 add members when those gates are extracted.
 */
export interface VerifierPorts {
  readonly deep: { verify(input: VerifyInput): Promise<VerifyResult> };
}

/**
 * Notification collaborator. Phase 42.1 consolidates the emitUnconverged spine
 * behind this. 39.1 defines only the `anomalies` finalizer hook it needs;
 * 39.4/39.7 add `codeReviewHigh`/`unconverged` members when those gates land.
 */
export interface EmitPort {
  anomalies(events: AnomalyEvent[]): Promise<void>;
}

/** The subset of `settle run` flags gates read. Grows as gates are extracted. */
export interface SettleOpts {
  readonly force?: boolean;
  readonly auto?: boolean;
  readonly deep?: boolean;
  readonly allowMissingCoverage?: boolean;
  readonly allowVerifierFailure?: boolean;
}

/** Everything a gate may read. Built once, before the gate loop. Readonly. */
export interface SettleContext {
  readonly cwd: string;
  readonly state: CadenceState;
  readonly draft: Draft;
  readonly progress: ProgressJson;
  readonly config: CadenceConfig | null;
  readonly gateSet: GateSet;
  readonly opts: SettleOpts;
  readonly explicitIds: ReadonlySet<string>;
  readonly touchedFiles: readonly string[];
  /** Shared, lazily-evaluated test-coverage scan; memoized so it runs at most
   *  once per settle (the inline gates scan it independently today). */
  coverage(): Promise<Map<string, VerifyTestRef[]>>;
  readonly verifiers: VerifierPorts;
  readonly emit: EmitPort;
  readonly io: IoPort;
}

/** Cross-cutting flags a gate sets for the finalizers to read. */
export interface GateFlags {
  coverageBypassed?: boolean;
  verifierFailure?: { message: string; provider?: string };
}

/**
 * The shared bag the driver owns: gate `summaryPatch`es merge here; finalizers
 * read + write it too. `acResults` is finalizer-built, not a gate contribution.
 */
export interface SettleAccumulator {
  deepVerify?: Record<string, DeepVerdict>;
  interactiveVerify?: Record<string, InteractiveVerdict>;
  codeReview?: Record<string, Finding[]>;
  securityAudit?: Finding[];
  acResults?: AcResult[];
  flags: GateFlags;
}

/** A gate's entire contribution. No shared mutable state. */
export interface GateResult {
  readonly outcome: 'pass' | 'refuse';
  readonly summaryPatch?: Partial<SettleAccumulator>;
  readonly flags?: GateFlags;
}

export type GateImpl = (ctx: SettleContext) => Promise<GateResult>;

/** Shallow-merge a GateResult's contribution into the accumulator. */
export function mergeInto(acc: SettleAccumulator, res: GateResult): void {
  if (res.summaryPatch) {
    const { flags: _ignore, ...rest } = res.summaryPatch;
    Object.assign(acc, rest);
  }
  if (res.flags) {
    Object.assign(acc.flags, res.flags);
  }
}
