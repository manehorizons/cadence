# CADENCE Phase 39.1 — The gate contract (`SettleContext` / `GateResult` / `GateImpl`) — Design

> Shape-defining phase for the v1.3.0 "Architecture deepening" milestone.
> Extracts the **coverage** and **deep-verify** gates out of `settle.ts` and,
> in doing so, locks the contract every subsequent v1.3 phase (39.2–39.7, the
> `checks/` relocations, the 40.1/42.1 port consolidations, and the 44.1
> registry) is built against.

## Summary

`packages/core/src/cli/commands/settle.ts` is a 900-LoC command whose `run`
action is one ~800-line function body (`settle.ts:59→857`) with every gate
inlined in sequence. Phase 39.1 lifts the **test-coverage** gate (`settle.ts:196`)
and the **`--deep` verifier** gate (`settle.ts:307`) into `core/src/gates/`,
and defines the shared `SettleContext` / `GateResult` / `GateImpl` contract +
the `verifiers` and `emit` ports they ride on.

Two gates, not one, because they exercise the two structurally-distinct gate
shapes the contract must cover: coverage is a near-pure refuse-or-pass policy
that sets a cross-cutting flag (`coverageBypassed`); deep-verify consumes an
injected **verifier port**, produces **summary data** (`deepVerify`), and sets
a different flag (`verifierFailure`). Validating the shape against both before
six more phases commit is the cheap insurance the pressure-test (2026-05-29)
called for.

## Product Boundary

No user-facing behavior changes. `cadence settle run` produces byte-identical
stdout/stderr, identical exit codes, identical SUMMARY.{json,md}, and identical
sidecars/notifications. This is an internal interface-tightening phase; its
deliverable is a contract and two extracted gates, anchored by transcript
snapshot tests.

## Scope

### In scope

- New `gates/types.ts`: `SettleContext`, `GateResult`, `GateImpl`,
  `SettleAccumulator`, `GateFlags`, the `VerifierPorts` + `EmitPort` port
  interfaces, and the `IoPort` seam.
- New `gates/coverage.ts` exposing `runCoverageGate: GateImpl`.
- New `gates/deep-verify.ts` exposing `runDeepVerifyGate: GateImpl`.
- `settle.ts`: build a `SettleContext` once; replace the two inline blocks with
  `runCoverageGate(ctx)` / `runDeepVerifyGate(ctx)`; merge their `GateResult`s
  into a local accumulator; preserve the refuse-and-halt semantics.
- New `tests/gates/{coverage,deep-verify}.test.ts` driving the gates directly.

### Out of scope (later v1.3 phases)

- The other 10 enum gates + the two `checks/` items (39.2–39.7, 43.1).
- The `Record<Gate, GateImpl>` registry + `GATE_ORDER` driver (44.1).
- Verifier-factory consolidation behind the port (40.1).
- `emitUnconverged` spine consolidation behind the port (42.1).
- `StateBackend.commit(state)` (41.1) — settle keeps its current two-step
  state write in 39.1; the gate contract does not touch state persistence.

## Architecture

### NEW files

- `packages/core/src/gates/types.ts` — the contract (see Implementation Pattern).
- `packages/core/src/gates/coverage.ts` — `runCoverageGate`.
- `packages/core/src/gates/deep-verify.ts` — `runDeepVerifyGate`.
- `packages/core/tests/gates/coverage.test.ts`.
- `packages/core/tests/gates/deep-verify.test.ts`.

### MODIFIED files

- `packages/core/src/cli/commands/settle.ts` — builds `SettleContext`, calls the
  two gates, merges results, drops the two inline blocks (net LoC down).

### Untouched

- `gates/engine.ts` — the matrix (`effectiveGateSet`) is unchanged; 39.1 consumes
  its output, does not alter it.
- `verify/*-factory.ts`, `notify/*` — reached only through the new ports; their
  internals are 40.1/42.1's problem.

## Implementation Pattern

### The two-phase model: producers, then finalizers

Reading all six current gates establishes the model the contract encodes:

- **Producer gates** (the 12 enum members minus `anomaly-notify`) are
  *independent* — none reads another's output inside the gate loop. Each is a
  `GateImpl`. The interactive↔deep verdict reconciliation that looks like a
  cross-gate read happens in the **post-loop AC-merge**, not inside a gate.
- **Finalizers** run after the gate loop, in fixed order, consuming the
  accumulated results: AC-derivation/merge → `anomaly-notify` (`collectAnomalies`
  + notify) → skill-audit (`checks/`, 39.6) → SUMMARY assembly → state write.

`anomaly-notify` is a **finalizer, not a producer** — `collectAnomalies`
(`settle.ts:734`) consumes `deepVerify` / `interactiveVerify` / `verifierFailure`
/ `coverageBypassed` produced by earlier gates. This is the structural reason it
is not a `GateImpl` and not a registry entry (confirming the pressure-test
decision from a different angle). 39.1 does **not** build the finalizer phase —
it only needs the producer contract — but the contract is named so 39.2+ slot in
cleanly.

### Data shapes (`gates/types.ts`)

```ts
import type {
  CadenceConfig, CadenceState, Draft, GateSet,
  DeepVerdict, Finding, InteractiveVerdict, AcResult,
} from '@cadence/types';

/** Stderr seam. Defaults to process.stderr.write; tests inject a capture. */
export interface IoPort {
  err(s: string): void;
}

/** Injected verifier collaborators. 40.1 consolidates behind this; gates never
 *  import a *-factory directly. Each member is the already-selected verifier for
 *  that dimension (provider switch + fallback already applied). 39.1 defines
 *  ONLY what it exercises (`deep`); 39.4/39.5 add `codeReview`/`securityAudit`
 *  members when those gates are extracted — ports grow per gate by design. */
export interface VerifierPorts {
  readonly deep: { verify(input: VerifyInput): Promise<VerifyResult> };
}

/** Notification collaborator. 42.1 consolidates the emitUnconverged spine behind
 *  this; gates call the port, never notify/*.ts directly. 39.1 defines only the
 *  `anomalies` finalizer hook it needs; 39.4/39.7 add `codeReviewHigh` /
 *  `unconverged` members when those gates land. */
export interface EmitPort {
  anomalies(events: AnomalyEvent[]): Promise<void>;        // degrade-on-throw owned here
}

/** The subset of `settle run` flags gates read. */
export interface SettleOpts {
  readonly force?: boolean;
  readonly auto?: boolean;
  readonly deep?: boolean;
  readonly allowMissingCoverage?: boolean;
  readonly allowVerifierFailure?: boolean;
  // …the remaining --allow-* flags, added as their gates are extracted.
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
  readonly touchedFiles: readonly string[];   // union of draft.tasks[].files, computed once
  /** Memoized test-coverage scan — today it is run 3× (coverage, interactive,
   *  deep). The ctx memoizes it so extracted gates share one scan. */
  coverage(): Promise<Map<string, VerifyTestRef[]>>;
  readonly verifiers: VerifierPorts;
  readonly emit: EmitPort;
  readonly io: IoPort;
}

/** Cross-cutting flags a gate sets for the finalizers to read. */
export interface GateFlags {
  readonly coverageBypassed?: boolean;
  readonly verifierFailure?: { message: string; provider?: string };
}

/** The shared bag the driver owns: gate `summaryPatch`es merge in here, and the
 *  finalizers (AC-merge, SUMMARY assembly) read + write it too. Gates populate
 *  the verdict/finding fields; `acResults` is finalizer-built (the post-loop
 *  AC-derivation/merge), not a gate contribution. Fields are added as the gates
 *  that produce them are extracted — 39.1 only writes `deepVerify` + `flags`. */
export interface SettleAccumulator {
  deepVerify?: Record<string, DeepVerdict>;
  interactiveVerify?: Record<string, InteractiveVerdict>;
  codeReview?: Record<string, Finding[]>;
  securityAudit?: Finding[];
  acResults?: AcResult[];        // written by the finalizer, not by any gate
  flags: GateFlags;
}

/** A gate's entire contribution. No shared mutable state. */
export interface GateResult {
  readonly outcome: 'pass' | 'refuse';                 // 'refuse' ⇒ exitCode=1, halt
  readonly summaryPatch?: Partial<SettleAccumulator>;
  readonly flags?: GateFlags;
}

export type GateImpl = (ctx: SettleContext) => Promise<GateResult>;
```

### Refuse-and-halt — the keystone

In today's code a failing gate writes stderr then `process.exitCode = 1; return;`,
aborting the action. A registry loop can't `return` from settle. So `GateResult`
carries `outcome`. The gate **writes its own stderr** (via `ctx.io.err`, preserving
exact message + order ⇒ bit-identical) and returns `{ outcome: 'refuse' }`. The
caller — unrolled in 39.1, looped in 44.1 — does the halt:

```ts
// 39.1 (settle.ts), unrolled:
const acc: SettleAccumulator = { flags: {} };
const cov = await runCoverageGate(ctx);
mergeInto(acc, cov);
if (cov.outcome === 'refuse') { process.exitCode = 1; return; }
const dv = await runDeepVerifyGate(ctx);
mergeInto(acc, dv);
if (dv.outcome === 'refuse') { process.exitCode = 1; return; }
// …existing finalizers (AC-merge, anomaly-notify, skill-audit, SUMMARY, state)
// read `acc.deepVerify`, `acc.flags.coverageBypassed`, etc. — unchanged logic.

// 44.1, rolled (for reference; NOT built in 39.1):
for (const g of GATE_ORDER) {                 // canonical execution order
  if (!ctx.gateSet.gates.includes(g)) continue;
  const impl = GATE_REGISTRY[g];              // anomaly-notify has no entry → skip
  if (!impl) continue;
  const res = await impl(ctx);
  mergeInto(acc, res);
  if (res.outcome === 'refuse') { process.exitCode = 1; return; }
}
```

`mergeInto(acc, res)` shallow-merges `summaryPatch` and `flags`. Exit code on any
refuse is always `1` today, so a single driver-level `process.exitCode = 1`
is bit-identical.

### `GATE_ORDER` ≠ matrix order (a 44.1 constraint discovered here)

`effectiveGateSet().gates` is `[...ALWAYS_FIRE, ...deltas]` order — e.g.
`code-review` precedes `deep-verify`. But settle *executes* deep-verify before
code-review, and draft-read before coverage. Because the **first** refusing gate
owns the stderr + exit, reordering is not behavior-preserving when two gates
would both fail. 44.1 therefore needs an explicit `GATE_ORDER: Gate[]` constant
encoding the current execution sequence; the driver intersects it with
`gateSet.gates`. (This corrects the roadmap's 44.1 AC #3, which claimed
"engine.ts ordering is now authoritative.") 39.1 records the requirement; 44.1
implements it.

### Building the context (in `settle.ts`)

`SettleContext` is assembled from values settle already computes: `cwd`, `state`,
`draft`, `progress`, `cadenceConfig`, `gateSet`, the parsed `opts`, `explicitIds`,
and `touchedFiles`. `coverage()` wraps `scanTestCoverage` in a memoized thunk.
The ports are thin adapters over the existing selectors:
`verifiers.deep` ← `selectVerifier(config)`, `emit.*` ← `selectNotifier(config)` +
the existing `emit*` helpers, `io.err` ← `(s) => process.stderr.write(s)`.

## Acceptance Criteria

- **AC-1** `runCoverageGate(ctx)` is the single home for coverage-gate logic;
  `settle.ts` no longer references `scanTestCoverage`/`uncoveredAcs`/`testGlobs`
  for the coverage gate.
- **AC-2** `runDeepVerifyGate(ctx)` is the single home for deep-verify logic;
  the verifier is reached only via `ctx.verifiers.deep`, never a direct
  `selectVerifier`/factory import inside the gate.
- **AC-3** Both gates conform to `GateImpl` with no per-gate casts — the shape is
  uniform and registry-ready (a `const _check: GateImpl = runCoverageGate` type
  assertion compiles for both).
- **AC-4** `GateResult.summaryPatch` + `flags` carry the gates' entire
  contribution; settle merges them — no gate writes shared mutable state.
- **AC-5** Each gate writes stderr only through `ctx.io.err`; a test capture
  observes byte-identical messages.
- **AC-6** Gate tests reach every branch (pass / refuse / `--force` /
  `--allow-missing-coverage` / `--allow-verifier-failure` / verifier-throws)
  without standing up the CLI command stack.
- **AC-7** `cadence settle run` behavior is bit-identical to pre-extraction:
  stdout, stderr, exit code, SUMMARY.{json,md}, and the coverage/deep refusal
  transcripts (snapshot-tested).
- **AC-8** `settle.ts` net LoC drops by both inline blocks' size + framing.

## Testing

- TDD per `CONTRIBUTING.md` — failing test first, in `tests/gates/`.
- Unit: `coverage.test.ts` / `deep-verify.test.ts` construct a `SettleContext`
  with a fake `IoPort` (capture), a stub `VerifierPorts.deep`, and a fixture
  draft; assert `GateResult` shape + captured stderr per branch.
- Snapshot: a settle-level transcript test (existing `@cadence/testkit`
  ephemeral repo) proves bit-identical refusal output for the coverage and
  deep-verify paths before vs after extraction.
- Each AC token (`AC-1`…`AC-8`) is referenced by a test per the test↔AC gate.

## Commit Convention

Two-commit settle (per CLAUDE.md):
1. `feat(core): extract coverage + deep-verify gates; define gate contract (Phase 39.1)`
   — `gates/{types,coverage,deep-verify}.ts`, `settle.ts`, the new tests.
2. `chore: settle` — `.cadence/phases/39.1/*` + `state.json` + `STATE.md`.

## Success Criteria

A subsequent gate (39.3 interactive) can be extracted by writing one
`gates/interactive.ts` that conforms to `GateImpl`, reads only `ctx`, returns a
`GateResult`, and is wired with one `runInteractiveGate(ctx)` call + merge in
settle. The **core contract** — `SettleContext`'s base fields, `GateResult`,
`GateImpl`, the merge mechanics — must remain untouched. Growth that is *expected
and fine*: a later gate adds a **collaborator port** (39.3 needs a prompter port;
39.4 adds the `codeReview` verifier + `emit.codeReviewHigh`) or a **new
`SettleAccumulator` field** for the data it produces. The contract fails only if
a later gate must change the *shape* of `GateResult`/`GateImpl` or the
refuse-and-halt mechanics — that would mean 39.1 under-specified the core.

## Decision Log

- **Two gates in 39.1, not one** (pressure-test 2026-05-29). Coverage alone is a
  pure-policy gate; it would not exercise the verifier port or summary-data
  contribution, leaving the riskiest parts of the contract unvalidated until
  39.2+. Deep-verify covers both. Rejected: coverage-only (under-tests the shape).
- **Functional patch accumulation, not a mutable ctx accumulator** (user, 2026-05-29).
  Gates return their whole contribution in `GateResult`; the driver owns merging.
  Each gate is unit-testable by return value with no shared object, and the model
  is identical under the 44.1 registry. Rejected: mutable `ctx.acc` (shared state,
  harder isolation).
- **Injected `IoPort`, not direct `process.stderr`** (user, 2026-05-29). `ctx.io.err`
  defaults to `process.stderr.write`; tests inject a capture. Preserves
  bit-identical output (gate writes in place, same order) and makes AC-6 clean.
  Rejected: direct `process.stderr.write` (forces gate tests to capture the global
  stream).
- **`anomaly-notify` is a finalizer, not a `GateImpl`.** It consumes every
  producer's output (`collectAnomalies`, `settle.ts:734`); structurally it cannot
  be an independent producer. Confirms the roadmap's "stays a `ctx.shouldNotify`
  flag" decision via the code.
- **`GATE_ORDER` constant required for 44.1.** Matrix order ≠ execution order, and
  first-refuser owns stderr/exit ⇒ reordering is observable. Corrects roadmap
  44.1 AC #3.
- **State persistence untouched in 39.1.** The contract is about gates, not the
  `StateBackend.commit` seam (41.1); settle keeps its two-step write here.

## Follow-On

- **39.2** extracts `structural-verifier` / `build-test-must-pass` / `draft-read`
  against this contract (total enum coverage).
- **39.3–39.7** extract the remaining producer gates; 39.4/39.7 ride `ctx.emit`.
- **44.1** adds `GATE_ORDER` + `Record<Gate, GateImpl>` and converts settle's
  unrolled calls into the loop; builds the finalizer phase explicitly.
- Roadmap edit needed: fix Phase 44.1 AC #3 to reference `GATE_ORDER` rather than
  "engine.ts ordering is authoritative."
