import type {
  AnomalyEvent,
  CadenceConfig,
  CadenceState,
  AcEvidence,
  DeepVerdict,
  DeepVerifyMeta,
  Draft,
  Finding,
  GateSet,
} from '@manehorizons/cadence-types';
import type {
  VerifyInput,
  VerifyResult,
  VerifyTestRef,
} from '../verify/verifier.js';
import type { InteractiveVerdict } from '../verify/interactive.js';
import type { Interactivity } from './interactivity.js';
import type { Prompter } from '../verify/prompter.js';
import type {
  CodeReviewInput,
  CodeReviewResult,
  Finding as CodeReviewFinding,
} from '../verify/code-review.js';
import type {
  SecurityAuditInput,
  SecurityAuditResult,
} from '../verify/security-audit.js';

/** Canonical PROGRESS.json shape settle reads. settle.ts imports this (and
 *  AcResult below) rather than redefining them locally. */
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
  /** Phase 140: strongest evidence class found for this AC (independent of
   *  `pass`/`fail`), derived post-gate-loop. */
  evidence?: AcEvidence;
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
  /** Code-review verifier (Phase 39.4), lazily `selectCodeReviewVerifier`. */
  readonly codeReview: { verify(input: CodeReviewInput): Promise<CodeReviewResult> };
  /** Security-audit verifier (Phase 39.5), lazily `selectSecurityAuditVerifier`.
   *  Phase 184: `opts` mirrors `SecurityAuditVerifier.verify`'s optional
   *  `{ signal?; traceId? }` second parameter — the real gate call site
   *  passes a per-run `traceId`. */
  readonly securityAudit: {
    verify(
      input: SecurityAuditInput,
      opts?: { signal?: AbortSignal; traceId?: string },
    ): Promise<SecurityAuditResult>;
  };
}

/**
 * Notification collaborator. Phase 42.1 consolidates the emitUnconverged spine
 * behind this. 39.1 defines only the `anomalies` finalizer hook it needs;
 * 39.4/39.7 add `codeReviewHigh`/`unconverged` members when those gates land.
 */
export interface EmitPort {
  anomalies(events: AnomalyEvent[]): Promise<void>;
  /** code-review-high anomalies (Phase 39.4). Wraps emitCodeReviewHigh over the
   *  selected notifier; the anomaly-notify membership guard is the gate's. */
  codeReviewHigh(
    findings: Record<string, CodeReviewFinding[]>,
    info: { provider: string; bypassed: boolean },
  ): Promise<void>;
  /** code-review unconverged escalation anomaly (Phase 39.4). */
  codeReviewUnconverged(info: {
    draftId: string;
    attempts: number;
    maxAttempts: number;
    findings: number;
    provider: string;
    model?: string;
    bypassed?: boolean;
  }): Promise<void>;
  /** skill-audit-miss anomaly (Phase 39.6 — checks/skill-audit). Wraps
   *  emitSkillAuditMiss over the selected notifier. UNCONDITIONAL — NOT under the
   *  anomaly-notify guard (a strict phase failing the requirement must still
   *  leave an audit trail). */
  skillAuditMiss(payload: {
    required: string[];
    invoked: string[];
    missing: string[];
    severity: 'warn' | 'error';
    bypassed?: boolean;
    unenforceable?: boolean;
  }): Promise<void>;
}

/**
 * Convergence sidecar collaborator (Phase 39.4). The gate owns the JSON byte
 * layout; the settle adapter owns the path + atomic write. `read()` yields the
 * prior failing-attempt count + history (absent/corrupt/legacy → {0, []}).
 * Reused by the 39.5 security-audit gate.
 */
export interface ConvergenceSidecar {
  read(): Promise<{ attemptsSoFar: number; history: unknown[] }>;
  write(text: string): Promise<void>;
}

/**
 * Result of the build-test-must-pass runner (Phase 39.2). `ran:false` means no
 * `verification.testCommand` is configured — the gate passes with a note rather
 * than guessing a command. `ok` is meaningful only when `ran === true`.
 */
export interface TestRunResult {
  readonly ran: boolean;
  readonly ok: boolean;
  readonly exitCode?: number;
  readonly command?: string;
}

/**
 * Subprocess collaborator for the build-test-must-pass gate (Phase 39.2).
 * Injected so the gate (and its tests) never spawn a real process; settle
 * builds it from `config.verification.testCommand`.
 */
export interface RunnerPort {
  test(): Promise<TestRunResult>;
}

/**
 * Prompter collaborator for the interactive-verdict gate (Phase 39.3).
 * `create()` builds the prompter (scripted via CADENCE_PROMPTER_SCRIPT, else
 * StdinPrompter) and may throw on a non-TTY — the gate turns that throw into a
 * refusal. The env/TTY construction policy lives in the settle-side adapter.
 */
export interface PrompterPort {
  create(): Prompter;
}

/** The subset of `settle run` flags gates read. Grows as gates are extracted. */
export interface SettleOpts {
  readonly force?: boolean;
  readonly auto?: boolean;
  readonly deep?: boolean;
  readonly allowMissingCoverage?: boolean;
  readonly allowVerifierFailure?: boolean;
  readonly allowStaleDraft?: boolean;
  readonly allowOpenTasks?: boolean;
  readonly allowFailingBuild?: boolean;
  readonly interactive?: boolean;
  readonly allowCodeReviewFailure?: boolean;
  readonly allowSecurityAuditFailure?: boolean;
  /** --allow-skill-audit-miss (Phase 39.6, skill-audit check). */
  readonly allowSkillAuditMiss?: boolean;
  /** --allow-boundary-scan-failure (Phase 156, boundary-scan gate). */
  readonly allowBoundaryScanFailure?: boolean;
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
  /** Phase 116: resolved non-TTY interactivity mode (`resolveInteractivity` over
   *  env + `process.stdin.isTTY`, computed by the settle-side adapter). `bypass`
   *  makes the interactive-verdict gate skip its walker and pass instead of
   *  refusing on a non-TTY. Absent → treated as attempt-prompt (back-compat). */
  readonly interactivity?: Interactivity;
  readonly explicitIds: ReadonlySet<string>;
  readonly touchedFiles: readonly string[];
  /** Shared, lazily-evaluated test-coverage scan; memoized so it runs at most
   *  once per settle (the inline gates scan it independently today). */
  coverage(): Promise<Map<string, VerifyTestRef[]>>;
  /** Memoized DRAFT.md mtime in ms (Phase 39.2, for the draft-read gate);
   *  `null` when there is no DRAFT or the stat fails. */
  draftMtimeMs(): Promise<number | null>;
  /** Memoized `git diff --no-color HEAD -- <touchedFiles>` (Phase 39.4);
   *  empty string on any error. Shared by code-review + security-audit gates. */
  diff(): string;
  readonly verifiers: VerifierPorts;
  readonly emit: EmitPort;
  readonly runner: RunnerPort;
  readonly prompter: PrompterPort;
  /** Code-review convergence sidecar (Phase 39.4). */
  readonly codeReviewSidecar: ConvergenceSidecar;
  readonly io: IoPort;
}

/** Cross-cutting flags a gate sets for the finalizers to read. */
export interface GateFlags {
  coverageBypassed?: boolean;
  /** Phase 226 (T3): true iff build-test-must-pass proceeded specifically
   *  because a failing test run was let through via --allow-failing-build or
   *  --force while the gate was NOT sealed — never set on a genuinely
   *  passing run or a sealed refusal. Mirrors `coverageBypassed`'s role: lets
   *  the registry's gate-provenance collection report "skipped (bypassed)"
   *  instead of a misleading "ran". */
  buildTestBypassed?: boolean;
  /** Phase 226 (T3): true iff boundary-scan proceeded past a real
   *  out-of-boundary finding via --force or --allow-boundary-scan-failure
   *  while the gate was NOT sealed. Same provenance-parity role as
   *  `coverageBypassed`/`buildTestBypassed` above. */
  boundaryScanBypassed?: boolean;
  verifierFailure?: { message: string; provider?: string };
}

/**
 * The shared bag the driver owns: gate `summaryPatch`es merge here; finalizers
 * read + write it too. `acResults` is finalizer-built, not a gate contribution.
 */
export interface SettleAccumulator {
  deepVerify?: Record<string, DeepVerdict>;
  /** Phase 70: run-level provenance for the deep-verify pass. */
  deepVerifyMeta?: DeepVerifyMeta;
  interactiveVerify?: Record<string, InteractiveVerdict>;
  /** Phase 116: walker auto-skipped in a non-TTY (mutually exclusive with above). */
  interactiveVerifySkipped?: 'non-tty';
  codeReview?: Record<string, Finding[]>;
  securityAudit?: Finding[];
  /** Phase 156: audit trail for a bypassed boundary-scan refusal. */
  boundaryScan?: { offenders: string[] };
  acResults?: AcResult[];
  /** Phase 140: false when build-test-must-pass couldn't execute (no
   *  testCommand configured) — undefined/true means it ran normally. Read by
   *  the registry's gate-provenance collection and by AC-evidence derivation. */
  buildTestRan?: boolean;
  flags: GateFlags;
}

/**
 * A gate's entire contribution. No shared mutable state. `P` is the producer
 * accumulator the `summaryPatch` targets — defaults to `SettleAccumulator` so
 * settle gates and `mergeInto` are unchanged. The draft/build surfaces (Phase
 * 39.7) parameterize `P` with their own product type (e.g. `BuildProducts`)
 * while keeping the shared `{ outcome, summaryPatch?, flags? }` shape.
 */
export interface GateResult<P = SettleAccumulator> {
  readonly outcome: 'pass' | 'refuse';
  readonly summaryPatch?: Partial<P>;
  readonly flags?: GateFlags;
  /** Phase 170: human-readable refusal reason a gate impl attaches when
   *  `outcome === 'refuse'`, surfaced onto the refusing gate's provenance entry. */
  readonly reason?: string;
}

export type GateImpl = (ctx: SettleContext) => Promise<GateResult>;

/**
 * Phase 141: is `gateId` in `config.gates.sealed`? A sealed gate ignores its
 * usual bypass flags (`--force`, `--allow-missing-coverage`,
 * `--allow-failing-build`) — the `test-coverage` and `build-test-must-pass`
 * gates each consult this before honoring a bypass. Loosely typed (`string`,
 * not `SettleGate`) to match `gates.sealed: string[]` in the config schema; a
 * typo in config just never matches at runtime rather than a type error.
 * Safe on a missing/null config or an absent/empty `gates.sealed` — never
 * throws, always `false` in that case.
 */
export function isGateSealed(ctx: SettleContext, gateId: string): boolean {
  return ctx.config?.gates?.sealed?.includes(gateId) ?? false;
}

/** Shallow-merge a GateResult's contribution into the accumulator. */
export function mergeInto(acc: SettleAccumulator, res: GateResult): void {
  if (res.summaryPatch) {
    const rest: Partial<SettleAccumulator> = { ...res.summaryPatch };
    delete rest.flags;
    Object.assign(acc, rest);
  }
  if (res.flags) {
    Object.assign(acc.flags, res.flags);
  }
}
