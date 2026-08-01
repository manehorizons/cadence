# CADENCE Phase 0 — Assurance Manifest, Kernel/Verifier Contract, Criteria-Anchored Review

**Status:** Phase 0 spec (design settled enough to DRAFT; not yet a Cadence spec)
**Target repo:** `manehorizons/cadence`
**Baseline measured:** `main` tarball, packages at `1.51.1` (`testkit` at `1.4.0`)
**Method:** full-repo read from `codeload` tarball. No test suites run (standing audit rule).
**Author:** Claude (drafting) → Claude Code (implementation)

---

## 0. What this document is

One spec covering three pieces of work that cannot honestly be specified apart:

1. **Assurance manifest** — closing Cadence's sole surviving P0 (every settle renders as equivalent regardless of verifier quality).
2. **Kernel / verifier contract** — naming and enforcing the extension boundary that already exists implicitly.
3. **Criteria-anchored review** — the expanded code-review capability, spec'd as the first consumer of that contract.

They are one document because specifying any one alone bakes in assumptions the other two would invalidate. The assurance manifest is the *instrument that measures whether the kernel boundary is real*; the review verifier is the *test that the contract holds under a genuinely new consumer*.

Delivery is still sliced, and **Slice 1 is unconditionally valuable** — it closes the P0 whether or not the rest ever ships.

---

## 1. Measured baseline

Everything in this section was read from source, not inferred.

### 1.1 Repository shape

| Fact | Measured value |
|---|---|
| Layout | Already a monorepo — `pnpm@9.12.0`, `turbo`, `@changesets/cli` |
| Workspace glob | `packages/*` |
| Packages | `core`, `types`, `host-claude-code`, `host-codex`, `host-toolkit`, `testkit` |
| Versions | all `1.51.1` except `testkit` `1.4.0` |
| Node | `>=20` |

**Implication:** the "monorepo-first" recommendation is not work to be done — it is already the state. Slice 2 is therefore *boundary enforcement inside an existing monorepo*, not a restructure. This materially lowers the risk of the whole plan.

### 1.2 The gate contract already exists

`packages/core/src/gates/types.ts`:

```ts
export type GateImpl = (ctx: SettleContext) => Promise<GateResult>;

export interface GateResult<P = SettleAccumulator> {
  readonly outcome: 'pass' | 'refuse';
  readonly summaryPatch?: Partial<P>;
  readonly flags?: GateFlags;
  readonly reason?: string;
}
```

`GATE_REGISTRY` is `Record<SettleGate, GateEntry>` — **total over the gate union, so a missing entry is a compile error.** `GATE_ORDER` owns execution order separately from the matrix order in `engine.ts`.

Measured `GATE_ORDER` (cheap → expensive):

1. `draft-read`
2. `structural-verifier`
3. `boundary-scan` *(self-guarded on `effectiveBoundaryEnforcement === 'block'`)*
4. `task-verify-required`
5. `build-test-must-pass`
6. `test-coverage`
7. `interactive-verdict` *(self-guarded on `--interactive`)*
8. `deep-verify` *(self-guarded on `--deep`)*
9. `code-review`
10. `security-audit`

The four DRAFT/BUILD gates (`coherence-check`, `approve`, `plan-review`, `per-task-verify`) are excluded at the type level via `Exclude<Gate, …>`, as is the `anomaly-notify` predicate.

### 1.3 The verifier boundary already exists

`SettleContext.verifiers: VerifierPorts` injects `deep`, `codeReview`, `securityAudit`. The Phase 40.1 comment is explicit: *gates never import a `*-factory` directly.* Verifier families (`anthropic` / `local` / `host-cli` / `mock`) are selected behind `select*Verifier` factories.

**This is the plugin system, shipped and unnamed.** Slice 2 names it and makes it the only extension point.

### 1.4 Provenance today — and the gap

`GateProvenanceZ` (Phase 140, extended Phase 170):

```ts
{ gate: GateZ, status: 'ran'|'skipped'|'refused', skipReason?: string, reason?: string }
```

`DeepVerifyMetaZ` (Phase 70) carries `provider`, `model`, `diffProvided`, `diffBytes`, `truncated`, `filesCount`, `inputTokens`, `outputTokens`.

**The gap, measured:** `DeepVerifyMeta` is the *only* per-verifier provenance persisted. `CodeReviewResult` carries `provider` and `model` in memory, but `SummaryZ.codeReview` is `z.record(z.string(), z.array(FindingZ))` — **the provider and model are discarded before persistence.** `securityAudit` is a bare `FindingZ[]` with the same loss.

So today a settle can record *that* code-review ran, but not *what ran it*. An `anthropic`-family review and a `mock` review produce byte-identical provenance. That is the P0, located precisely.

### 1.5 Evidence ladder and refusal floor

- `AcEvidenceZ` = `['ai-verified', 'executed', 'assertion', 'mention', 'unverified']` (strongest → weakest).
- `EvidenceFloorZ` mirrors it as a **deliberate duplicate** in `config.ts` (comment says so explicitly).
- `config.gates.evidenceFloor` — schema default `'mention'`; preset values: `solo` → `assertion`, `team` → `executed`, `production` → `executed` (Phase 214, `ev-20260724-010`).
- `config.gates.sealed: string[]` + `isGateSealed()` — a sealed gate ignores `--force`, `--allow-missing-coverage`, `--allow-failing-build`.
- `gateBypasses` (Phase 120) is a durable bypass audit trail with `{gate, flag, reason, severity}`.

A `production`-preset comment notes that "the active verifier isn't a real provider" is enforced *separately* as a refusal/warning, not by a stricter floor. That separate enforcement is a natural absorber for part of the assurance work — check before duplicating it.

### 1.6 The SUMMARY schema is a hard literal

```ts
export const SummaryZ = z.object({ schemaVersion: z.literal(1), … });
```

Read sites: `cli/commands/summary.ts:61` and `verify/phase-replay.ts:117`, both `safeParse`.

**Consequence:** a SUMMARY written by a future Cadence at `schemaVersion: 2` does not fail gracefully — it fails as a generic parse error, indistinguishable from corruption. Forward-compatible reads are currently impossible. Given 148+ settled phases in Phenyx alone plus Necro, Déjà, and every Praxis ledger, this is a deployed format with real history.

Precedent for the right handling already exists: Phase 223 `contentHash` reports pre-223 records as a distinct **"unverifiable"** outcome rather than a false MATCH (`dec-20260726-001`; signing deferred to `rec-20260726-001`). Assurance should reuse that shape exactly.

### 1.7 Finding types have diverged

Two `Finding` types are in play:

- `packages/types/src/summary.ts` → `FindingZ` = `{ severity: 'critical'|'high'|'medium'|'low', message, line? }`
- `packages/core/src/verify/code-review.ts` → `Finding` = `{ severity: 'high'|'medium'|'low', message, line? }`

`gates/types.ts` imports both, aliasing the latter as `CodeReviewFinding`.

Neither has: a stable id, an anchor, a file field (file is the record key), a disposition, or a waiver. **Finding identity does not exist today.**

### 1.8 The review verifier cannot see the criteria

```ts
export interface CodeReviewInput {
  files: string[];
  diff: string;
}
```

**This is the single most important measured finding.** Criteria-anchored review is not a tuning change — it is structurally impossible under the current input contract. The verifier is never given the DRAFT, the acceptance criteria, or the boundaries. Slice 3 is therefore a genuine contract change, not a prompt change.

Current refusal semantics: only `severity === 'high'` refuses; bypass via `--allow-code-review-failure` or `--force`; a convergence sidecar tracks failing attempts with an `escalate` verdict path.

### 1.9 Anchor targets available in the DRAFT

```ts
AcceptanceCriterionZ = { id: /^AC-\d+$/, name, given, when, then }
TaskZ               = { id, name, files, action, verify, done, depends?, status?, touchedFiles? }
DraftZ.boundaries   = z.array(z.string())
```

ACs are **structured Given/When/Then**. Boundaries are **bare strings**. `Task.done` carries AC refs parsed by `parseAcRefs`; `Task.verify` is a freeform string.

This matters: the anchor ladder does not have to be invented. It falls out of real schema differences between these three anchor kinds.

### 1.10 Invariant-promotion machinery already exists

`RetroRollupZ` (Phase 186):

```ts
{ totalPhases, phasesWithFriction,
  bypasses: RetroFrequencyBuckets,
  roughTaskStatuses: RetroFrequencyBuckets,
  findingCategories: RetroFrequencyBuckets }

RetroFrequencyBucketsZ = { recurring: RetroFrequencyEntry[], oneOff: RetroFrequencyEntry[] }
RetroFrequencyEntryZ   = { key, count, phaseIds }
```

`recurring` is already defined as *seen in 2+ distinct phases*. **The "recurring findings promote to invariants" pipeline has its input layer built.** Slice 4 consumes this rather than building it.

### 1.11 Correction: there is no snag ledger

**Measured: zero occurrences of `snag` in the entire repository** (all file types, code and docs).

The working thesis assumed findings route into "the snag/recommendation ledgers." Only the Praxis recommendation ledger exists. Routing targets are therefore:

- `RecommendationZ` — full ledger with status/readiness/priority/decay/scout-id.
- `EvidenceZ` — `{ id, recommendationId, kind: 'file'|'command'|'cadence-artifact'|'note', summary, path?, command? }`.

`RecommendationSourceZ` = `['manual','code-analysis','impact','cadence','session']` — **no `review` or `gate` member.** Routing review findings into the ledger requires extending this enum, or the provenance is lost in `manual`/`cadence`.

Either build the snag concept deliberately as new work, or drop it from the thesis. This spec drops it (§4.4) and uses the recommendation ledger with an extended source enum.

---

## 2. Findings that change the design

Five, ordered by how much they move the spec.

1. **Review cannot anchor because it cannot see criteria (§1.8).** The `CodeReviewInput` contract change is the spine of Slice 3, not a detail of it.
2. **The kernel boundary is ~80% built (§1.2, §1.3).** `GateImpl`, `GATE_REGISTRY` totality, and `VerifierPorts` already constitute a plugin architecture. The work is *enforcement and naming*, not construction. Downgrade the perceived risk accordingly.
3. **Provenance is lost at persistence, not at collection (§1.4).** `provider`/`model` exist in memory and are dropped on the way to SUMMARY. Slice 1 is substantially a *plumbing* task, not a discovery task.
4. **`schemaVersion: z.literal(1)` blocks forward-compat reads (§1.6).** Must be fixed *in* Slice 1, because Slice 1 is itself the first schema change.
5. **Invariant promotion already has its input layer (§1.10).** Slice 4 shrinks from "build frequency analysis" to "consume `findingCategories.recurring`."

---

## 3. Thesis (restated after measurement)

> Review findings cite the declared criterion they violate. A finding with no citable criterion is not dropped and not side-bucketed — it is reported as a **criteria gap**, a defect in the DRAFT surfaced at SETTLE. Recurring gaps promote to standing invariants. Anchors are graded, because an ungraded anchor is decoration.

Positioning note: the durable difference from the intent-anchored tier (Aviator Verify, BrainGrid, Traycer) is not anchoring itself — it is that **review feeds back into the criteria**. The loop is the moat. Prefer *closed-loop criteria* as the external frame; let anchoring be an implementation fact.

---

## 4. Architecture

### 4.1 Four roles, three pluggable

| Role | Authority | Pluggable | Examples |
|---|---|---|---|
| **Kernel** | Owns phase state, evidence ladder, refusal floor, assurance computation, SUMMARY schema, exit code | No | state machine, ladder, floor, counter-verifier |
| **Verifier** | May produce evidence and may **vote refuse**. May never produce pass | Yes | code-review, security-audit, deep-verify, mutation spot-check |
| **Consumer** | Read-only over settled artifacts | Yes | Check Runs, SARIF, dashboards, devlog |
| **Client** | Drives Cadence via public CLI, with exactly the authority a human at a terminal has | Yes | Conductor |

**Governing rule: any plugin can block; no plugin can pass.** Only the kernel calls green. This mirrors *exit is never gated; entry is the strict surface* — asymmetric authority is the pattern.

### 4.2 Conductor is a client

Not a kernel peer, not a verifier. Decision test:

> Can it be implemented entirely against public CLI commands?

If yes → client, kernel stays small. If no → **that is a bug report about the public surface being incomplete**, not a case for privileged access. Fix the surface, never grant the exception.

Consequence: Conductor can live in its own repo on its own cadence immediately, depending only on an already-published contract.

### 4.3 The counter-verifier is kernel

A component whose job is detecting an unearned settle cannot be uninstallable — the cheat would be "don't install the cheat-detector." Its highest-value single job: **"the ACs were too weak for this review to mean anything."** That is the mechanism making AC weakness costly, which is what stops the agent-authors-ACs-then-grades-against-them loop from closing in the bad sense.

Shares substrate with review (anchor resolution, finding schema, ledger routing, verifier-family abstraction); differs in target. One `Finding` type with a `target` discriminant (`artifact` | `verification`), two policy layers. **One spine, two heads.**

### 4.4 Explicitly not in Cadence

- **Brainstorming.** Irreducibly shaping. Putting a shaping surface inside the gate tool blurs the one distinction the portfolio rests on. Belongs in the Marrow/Praxis direction, where output is knowledge rather than verdict.
- **A snag ledger.** Does not exist (§1.11). Not introduced here.

---

## 5. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Criteria-gap findings block**, above a severity floor | The escape hatch is a DRAFT amendment, not a code fix — a ~30-second edit that permanently improves the spec. Blocking is only punishing when the cheapest fix is "go rewrite the code." |
| D2 | **Gap findings trip the existing `evidenceFloor`.** No second refusal primitive | Refusal-to-settle is the signature. Two of them dilutes it and doubles config surface. |
| D3 | **Gap count and severity distribution are declared unconditionally** | Config decides what *stops* you; config never decides what is *visible*. Same rule as assurance. |
| D4 | **DRAFT amendments are recorded** | "We accept unvalidated input here" becomes a version-controlled, attributable statement — the difference between a waiver and a shrug. |
| D5 | **Anchor ladder is a peer schema to the evidence ladder** | Without grading anchors, every anchored finding renders as equivalent regardless of anchor quality — the P0 in a new costume. |
| D6 | **Bump `schemaVersion` to 2 and fix the reader** | A v1 SUMMARY genuinely *cannot* state assurance. Conflating "no assurance recorded" with "assurance absent" is the exact failure being closed. Mirrors Phase 223's "unverifiable" precedent. |
| D7 | **Conductor is a client** (§4.2) | Keeps the kernel small; converts future access requests into CLI-completeness bugs. |
| D8 | **Counter-verifier is kernel** (§4.3) | Uninstallable cheat-detector is theater. |
| D9 | **One `Finding` type, discriminated by `target`** | Shared substrate, separate policy. Prevents counter-verify drifting into producing code findings. |
| D10 | **Gate is authoritative; `cadence review` and PR-native are projections** | A second path to green is how a gate degrades into shape. |

---

## 6. Slice plan

Vertical slices, each with a hard acceptance bar, ordered by dependency and risk. **Corpus authored and proven red before implementation in every slice.**

### Slice 1 — Assurance manifest *(no package moves; pure feature)*

Closes the P0. Valuable standalone even if slices 2–4 are abandoned.

**Scope**
- Enrich `GateProvenanceZ` with verifier identity: family/provider, model (optional), and a config fingerprint.
- Stop discarding `provider`/`model` for `code-review` and `security-audit` at persistence (§1.4).
- Compute an **assurance record** per settle from: gate provenance × evidence tiers × verifier families × bypasses × seals.
- Bump `schemaVersion` to `2`; make the reader accept `1 | 2`, and add a pre-parse probe that reports "written by a newer Cadence" distinctly from corruption.
- Pre-assurance records report a distinct **"unverifiable"** outcome, never a false clean.

**Do not** assign a letter grade. Emit a structured record plus a derived ordinal. Letter grades invite exactly the flattening being fixed.

**Acceptance bar**
- G/W/T: *Given* a settle where `code-review` ran under the `mock` family, *when* the SUMMARY is written, *then* the assurance record names the family and the derived ordinal is strictly lower than the same settle under a real provider.
- Every SUMMARY across Phenyx, Necro, Déjà, and Cadence itself still parses.
- Re-settling an unchanged phase produces an equivalent verdict.
- The manifest is expressible **without gate-specific special cases** (see tripwire T1).

**Regression corpus:** already on disk — hundreds of settled SUMMARY files across the portfolio. No authoring required; collect and pin.

### Slice 2 — Boundary enforcement in place *(no distribution work)*

**Scope**
- Name the three roles as published contracts (`kernel`, `verifier`, `consumer`).
- Add a lint rule failing the build when a verifier package imports kernel internals rather than the published contract.
- Keep one version, one release, monorepo — no per-plugin versioning, no third-party story.

**Acceptance bar**
- All five existing verifier-backed gates (`code-review`, `plan-review`, `spec-review`, `security-audit`, `ui-spec-review`) satisfy the contract with **zero special cases**.
- The lint rule fails on a deliberately introduced internal import.
- `GATE_ORDER` and gate semantics are **unchanged** — moving boundaries and changing behaviour in one step makes regressions undiagnosable.

Designing a plugin contract against five real plugins is a genuine advantage; most such systems are designed against one and get it wrong.

### Slice 3 — Criteria-anchored review verifier

**Scope**
- Extend `CodeReviewInput` to carry acceptance criteria, boundaries, and task→AC refs (§1.8).
- Implement the **anchor ladder** (§7.1).
- Implement **finding identity** (§7.2).
- Emit **criteria-gap findings** for unanchored findings above the severity floor (D1–D4).
- Route findings to the recommendation ledger; extend `RecommendationSourceZ` with a `review` member (§1.11).

**Acceptance bar**
- G/W/T: *Given* a diff introducing a defect with no covering AC, *when* review runs, *then* a criteria-gap finding is emitted naming the missing boundary, and settle refuses per the configured floor.
- *Given* the DRAFT is then amended to declare that boundary, *when* review re-runs, *then* the same defect is emitted as an **anchored** finding, not a gap.
- Findings survive a refactor that changes line numbers.
- **No kernel internals imported** (tripwire T2).

**Corpus:** adversarial fixtures covering — defect with executable AC; defect with structured-only AC; defect with boundary-string anchor; defect with no anchor; trivial unanchored finding (must *not* block); anchor-shopping (a vague AC that could absorb any finding); refactor-moved finding.

### Slice 4 — Invariant promotion

**Scope**
- Consume `RetroRollup.findingCategories.recurring` (§1.10).
- Split the two signals: recurring **unanchored** → invariant candidate; recurring **anchored** → spec-quality / codebase-hostility signal. Different dispositions.
- Standing invariants become always-on anchors requiring no per-DRAFT declaration.

**Acceptance bar**
- A gap finding recurring across 2+ distinct phases surfaces as an invariant candidate with its `phaseIds`.
- Promotion is explicit, never automatic.

### Deferred (explicitly not now)

Per-plugin distribution and versioning; third-party contributor story; PR-native rendering (Check Runs + SARIF — Slice 5+, must render **state-scoped results with diff-scoped emphasis**, never diff-scoped verdicts); adversarial counter-verifier implementation; any renaming; any change to `GATE_ORDER`.

---

## 7. Schemas

### 7.1 Anchor ladder

Grounded in real schema differences (§1.9), strongest → weakest:

| Tier | Basis (measurable) |
|---|---|
| `executable` | AC referenced by a task whose `verify` is a runnable command, and `build-test-must-pass` actually ran |
| `structured` | AC with non-empty `given` / `when` / `then` |
| `declared` | AC with prose-only or empty G/W/T, or a `boundaries[]` string |
| `undeclared` | No citable criterion → **criteria gap** |

Mirrors the `AcEvidence` five-tier shape without pretending to be it. A finding anchored at `executable` is a materially stronger artifact than one anchored at `declared`.

**Anchor-shopping is the adversarial case.** An AC reading "the API should be secure" absorbs anything. `structured` and `declared` tiers must be treated as weak by default, and the counter-verifier's job (§4.3) is to say so out loud.

### 7.2 Finding identity

Required fields beyond today's `{severity, message, line?}`:

- **`id`** — stable across runs. Derived from anchor + structural location, **never line numbers**.
- **`target`** — `'artifact' | 'verification'` (D9).
- **`anchor`** — `{ kind: 'ac'|'boundary'|'invariant'|'none', ref?, tier: AnchorTier }`.
- **`disposition`** — `open | accepted | waived | fixed | superseded`.
- **`waiver`** — when `disposition === 'waived'`, carries an **expiry**. A waiver with no expiry is a belief masquerading as knowledge, which is exactly what the epistemology-layer thesis exists to name.

**Reuse note:** fingerprint identity surviving refactor is the problem Déjà already solved with bidirectional containment scoring (max wins, 20-token minimum floor). Evaluate extraction of a shared primitive before writing a second implementation.

**Convergence note:** resolve the two divergent `Finding` types (§1.7) as part of this slice — `critical` exists in the persisted schema but the code-review verifier emits only `high|medium|low`.

### 7.3 Ledger routing

- Extend `RecommendationSourceZ` with `review`.
- Findings route as recommendations with `EvidenceZ` entries of `kind: 'cadence-artifact'` pointing at the settle.
- Reuse the existing scout-id convention for batch provenance.
- Ledger hygiene is a hard requirement: without stable identity and dispositions, repeated runs fill the ledger with undisposed items and its signal decays — which kills the thing that makes Cadence artifacts worth reading.

---

## 8. Tripwires — what would say this is wrong

Decided now, before investment.

- **T1.** The assurance manifest cannot be expressed without gate-specific special cases → the kernel boundary is not real. **Stop after Slice 1**, keep the P0 win, abandon slices 2–4.
- **T2.** The review verifier needs kernel internals to route findings → the contract is underspecified. **Fix the contract; never grant the exception.**
- **T3.** Slice 2 extraction runs beyond a couple of focused sessions → this is a rewrite wearing a refactor's clothes. **Revert to the working tag.**
- **T4.** Criteria-gap findings fire so often on real phases that amendment fatigue sets in → the severity floor is mis-set, not the concept. Retune the floor before weakening D1.

---

## 9. Hard constraints

1. **The SUMMARY format is deployed infrastructure.** 148+ settled phases in Phenyx, plus Necro, Déjà, Cadence itself, plus every Praxis ledger. Schema versioning discipline lands with Slice 1, not after.
2. **Every existing settle artifact in every repo must still read correctly**, and re-settling an unchanged phase must produce an equivalent verdict. This is the acceptance bar for the whole programme.
3. **No test suites run during audit** unless explicitly requested (standing rule, July 2026).
4. **Mock settlement is not settlement.** Any phase settled under the `mock` verifier family is structurally verified only and must be labeled as such — and after Slice 1, the assurance record says so mechanically rather than by convention.
5. **No `GATE_ORDER` changes during Slice 2.**

---

## 10. Open questions

1. **Assurance ordinal shape.** Structured record plus derived ordinal is settled (§6, Slice 1). The ordinal's *arity* is not — 3 bands? 5, mirroring the evidence ladder? Mirroring is tempting and may be false symmetry.
2. **Config fingerprint scope.** Whole-config hash, or a gate-relevant projection? Whole-config makes every unrelated config edit look like an assurance change.
3. **Does `spec-review` / `ui-spec-review` / `plan-review` get criteria-anchoring too?** They are already criteria-shaped. Possibly Slice 3 generalizes further than planned — or possibly that is scope creep and they stay as-is.
4. **Invariant storage location.** Project config, a dedicated invariant ledger, or the Praxis ledger with a distinct source? Affects whether invariants are shareable across the portfolio's ten repos.
5. **Does the anchor ladder feed the `evidenceFloor`, or get its own floor?** D2 says no second *refusal primitive*, which is not quite the same as no second *floor*. Leaning: one floor, with anchor tier as an input to evidence derivation.

---

## 11. Recommendation ledger entries to file

Suggested scout id: `scout-20260727-kernel-review-phase0`

| Readiness | Title |
|---|---|
| `ready-for-cadence-spec` | Assurance manifest: persist verifier family/model for code-review + security-audit |
| `ready-for-cadence-spec` | SUMMARY forward-compat read: accept `schemaVersion` 1\|2, distinct "newer Cadence" outcome |
| `ready-for-cadence-spec` | Kernel/verifier contract + lint rule against internal imports |
| `needs-decision` | Criteria-anchored review: extend `CodeReviewInput` with ACs/boundaries |
| `needs-decision` | Anchor ladder as peer schema to evidence ladder |
| `needs-decision` | Finding identity: stable ids, dispositions, expiring waivers |
| `needs-evidence` | Shared fingerprint primitive extraction from Déjà |
| `needs-evidence` | Invariant promotion from `RetroRollup.findingCategories.recurring` |
| `raw-idea` | Counter-verifier as kernel component with AC-weakness detection |
| `raw-idea` | Conductor as CLI client; treat access gaps as CLI-completeness bugs |
| `needs-decision` | Extend `RecommendationSourceZ` with `review` member |

---

## 12. Honest status labels

- **Measured from source:** everything in §1, §2.
- **Design settled, not built:** §4, §5.
- **Built, merged to `main` (2026-08-01, PR #353):** §6 Slices 1–3 (phases
  232–236, 241–242 — gate provenance + assurance record, kernel/verifier/
  consumer boundary, criteria-anchored review + anchor ladder, finding
  identity/disposition/ledger routing — landed on `feat/kernel-assurance-v2`,
  then merged whole into `main` along with phases 244–245). §7's schemas
  (anchor ladder, finding identity, ledger routing) are likewise built, not
  merely spec'd.
- **Not started:** §6 Slice 4 (phase 237, invariant promotion) —
  `needs-evidence`-gated on phase 236's routed findings accumulating real
  recurring cases, which requires the arc to actually be in use.
- **As-built note (2026-08-01):** no phase in this arc has yet settled under
  a real (non-`mock`) verifier identity — `code-review`/`security-audit`
  gates recorded `provider: mock` (phase 241) or carried no verifier
  identity at all (235, 236, 242) on their own settles. The arc that exists
  to distinguish mock-verified from real-verified review has not yet been
  reviewed for real itself; treat "tests pass" and "independently reviewed"
  as separate claims when deciding whether/how much of this to merge.
- **Undecided:** §10.
- **Corrected premise:** the snag ledger does not exist (§1.11).
