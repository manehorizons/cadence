# HANDOFF — CADENCE v1.56.0 Verifier Honesty Semantics

**To:** Claude Code
**From:** Thomas, 2026-08-04
**Repo:** `thomas-powers-jr/cadence` @ `main`
**Prerequisite:** v1.55.0 shipped (see `HANDOFF-v1.55-integrity-release.md`)
**Scout ID for this batch:** `scout-20260804-verifier-honesty`

**Do not begin this document until v1.55.0 is published and its release phase has
settled.** Several phases here depend on measurements only v1.55 can produce.

---

## 1. Mission

v1.55 made CADENCE's verification *reachable*. v1.56 makes it **impossible to
misread**.

The v1.54 audit found that 56 review artifacts across 263 settles all ran under
`mock` with zero findings — and that nothing in the system escalated as that
number grew. The gap was not that mock exists. The gap is that mock's output is
epistemically indistinguishable from real verification in three separate places:
in provenance, in rendering, and in the gate outcome itself.

This release closes all three. It does not remove mock, does not require a paid
provider, and does not rename the config value. Read §3 before proposing any of
those.

---

## 2. Measured context — read before designing anything

**Mock is not a rubber stamp.** Verify each of these against current source before
relying on them.

**`packages/core/src/verify/mock-verifier.ts`** — the AC verifier. An AC passes iff
it has ≥1 linked test in `input.tests[ac.id]`; otherwise it returns
`pass: false, reason: 'no linked test found'`. Pure function, no I/O, so gates stay
testable offline and CI needs no API key.

**`packages/core/src/verify/code-review.ts:103`** (`MockCodeReviewVerifier`) —
flags every `console.log(...)` added in the diff as a HIGH finding. Empty diff or
no matches returns no findings. Accepts `extraMarkers` (phase 235 T5) so the
adversarial corpus can exercise other severities offline.

**Both can fail.** Mock is a narrow deterministic floor, not a no-op. It enforced
AC↔test linkage across every settle in this repo's history. That is real gate
behavior and the project should get credit for it.

**The consequence for this release:** the problem is not that mock approved things
it shouldn't have. The problem is that its approvals are recorded, rendered, and
rolled up in a form that a reader cannot distinguish from an AI verifier's
approval.

**Load-bearing coupling to be careful with:**

```ts
// packages/core/src/gates/assurance-record.ts
const hasRealVerifier = verifierRollup.some((v) => v.provider !== 'mock');
```

The literal string `'mock'` is the machine identity for "not real verification."
It appears in the assurance derivation, the config schema, doctor checks, and 56
historical review artifacts. Treat it as a stable contract.

---

## 3. Decisions to record before implementation

File these as decisions (`cadence decision`) before the first phase. Each was
considered and settled during the v1.54 audit review; recording them prevents
re-litigation mid-release.

### D-A — Do not rename the `mock` provider identity

**Rejected:** renaming `provider: 'mock'` to `offline`, `local`, `basic`,
`structural`, or `deterministic`.

**Rationale:**

1. `provider: 'mock'` is load-bearing (see §2). Renaming is a breaking change across the config schema, SUMMARY provenance, doctor checks, and 56 historical artifacts that constitute the corpus of record.
2. Every candidate replacement is *softer*. `offline`, `local`, and `deterministic` all read as legitimate operating modes a user could comfortably stay on indefinitely. `mock` announces "placeholder." It is the most honest word available and it is boring register, matching the project convention for schema values.
3. Renaming immediately after an audit that found 263 settles under mock would read as softening the label rather than fixing the condition — the opposite of the project's stated posture.

**However**, the audit identified a real precision defect the rename was reaching
for: `mock` *understates* what it does. Phases M1 and M2 address that at the
display layer instead of the schema layer.

### D-B — Do not require a real provider at setup

**Rejected:** making `cadence init` refuse to complete without an API key or a
configured `host-cli` provider.

**Rationale — the decisive point is empirical:** this repo's `codeReview.provider`
was already `"host-cli"`, a real provider, throughout the entire period in which
zero conduction occurred. The blockers were `profile: "auto"` excluding the gate
from every tier and the self-invocation guard forcing fallback. **A setup-time
provider requirement would have prevented nothing.** It targets an axis that was
not the failure axis.

Additional costs: it destroys the offline demo and `cadence tutorial` (the README's
headline demo is explicitly "offline, mock verifier, zero npm deps"), breaks
hermetic CI where consumers reasonably decline a paid LLM call per settle, breaks
this repo's own testkit fixtures, and imposes cost coercion on solo users for whom
the deterministic gates already deliver most of the value.

Phases N and O deliver the intended benefit — informed, visible, non-drifting
provider state — without the coercion.

---

## 4. Entry conditions

Do not start until all are true. Verify each; do not assume.

- **E1** — v1.55.0 published; release phase settled; `cadence doctor` reports no untriaged release-blocking warning.
- **E2** — v1.55 Phase E (real-provider certification) completed with a `SUMMARY.json` carrying a non-`mock` `verifierRollup` entry. **Phase P cannot be designed without at least one real-provider gate outcome to compare against.**
- **E3** — v1.55 Phase C landed: repo `profile` off `"auto"`. Report how many settles have accumulated real-provider verifier identity since. This number feeds Phase O's threshold and `dec-20260801-003`'s revisit trigger.
- **E4** — v1.55 Phase F landed: findings render in both Markdown renderers. Phase P changes what those renderers receive.
- **E5** — v1.55 Phase J.1 resolved or explicitly deferred with a recorded decision. Phase P interacts with `deriveAssuranceRecord`; do not touch it while J.1 is open.

If G–J slipped to v1.56 (see the v1.55 handoff §6 scope split), sequence them
**before** this document's phases. They are independent; these are not.

---

## 5. Phases in priority order

| # | Phase | Priority | Notes |
|---|---|---|---|
| L | Provider selection provenance | **P0** | Prerequisite for M, N, O |
| M | Rendered label precision | **P1** | Display layer only |
| N | Affirmative provider selection at init | **P1** | Independent |
| O | Conduction drift counter | **P1** | Depends on L |
| P | Mock abstains on review gates | **P2** | Largest; own decision record |

---

### Phase L — Distinguish configured mock from fallback mock

**No existing rec — file under the scout ID.**

**Finding.** Phase 243 emits a loud banner on every seam's credential-missing
downgrade, so the *operator at the terminal* learns about a fallback. But the
**persisted provenance is identical either way**: a gate that fell back to mock
because an API key was missing records `provider: 'mock'`, byte-for-byte the same
as a gate where the operator deliberately selected mock.

These are epistemically different facts:

- *"The operator chose a structural placeholder."* — an informed decision.
- *"The operator intended real verification and silently received a placeholder."* — a failure.

The banner is ephemeral. The corpus is permanent. **The corpus cannot currently
tell these apart**, which means no retroactive analysis over the 263-settle corpus
can either — including the offline analyzer `dec-20260801-003` commits to building.

**Tasks**

- **L.1** — Add a selection-mode field to gate provenance. Suggested: `providerSelection: 'configured' | 'fallback'`. Confirm the field name against existing provenance naming conventions before committing to it.
- **L.2** — Populate it at **selection time**, in the same code path that triggers the phase-243 banner. Do not re-derive it downstream; the banner path already knows the answer.
- **L.3** — Cover all seven verifier seams, not just code-review and security-audit. Phase 243's banner precedent is the correct scope.
- **L.4** — **Schema decision required.** `SUMMARY.schemaVersion` is currently `1 | 2`. Determine whether an optional additive field is forward-compatible under the existing v2 reader or requires a bump. Record the decision. Do not open broad schema-v3 work — if a bump is needed, scope it to this field alone and say so.
- **L.5** — Historical summaries lacking the field must still parse, and `cadence summary verify` must still pass on every file in `.cadence/phases/`. **No default may inject the field into a parsed historical summary before hashing.** This is a hard constraint — violating it invalidates the corpus.
- **L.6** — Corpus first: adversarial fixtures covering configured-mock, fallback-mock, configured-real, and a mid-run credential loss, all proven red before implementation.

**Bar:** a settle with a deliberately-removed API key produces provenance
distinguishable from a settle with mock deliberately configured; all 263 historical
summaries still pass `cadence summary verify`; the distinction is queryable across
the corpus with a single command, and that command is recorded in the DRAFT.

---

### Phase M — Rendered label precision

**No existing rec — file under the scout ID. Depends on L.**

**Finding.** `mock` understates what it does. A reader seeing `provider: mock`
reasonably concludes nothing was checked. In fact the AC verifier enforced
AC↔test linkage and could fail; the code-review mock flagged added `console.log`
calls as HIGH. The label costs the project credit it earned, while
simultaneously — via D-A — remaining the right machine identity.

Fix the **display layer only**. The JSON key does not change.

**Tasks**

- **M.1** — Render a precise human label wherever a provider is displayed: SUMMARY.md, `cadence summary render`, `cadence doctor`, `cadence config explain`, and the phase-243 banners. Convey both what mock *does* check and what it does *not*.
- **M.2** — Surface the Phase L selection mode in the rendered label. A fallback must read visibly differently from a deliberate choice.
- **M.3** — Single source of truth for the label. Do not duplicate the string across renderers — that is the exact drift the `host-toolkit` extraction (phase 222) existed to fix.
- **M.4** — Do not overcorrect. The label must not imply mock is adequate. It states what ran.
- **M.5** — Byte-compatibility: historical summaries re-rendered through `cadence summary render` may change their provider label; confirm this does not affect `contentHash` verification, which hashes persisted JSON, not rendered Markdown. **Verify this rather than assuming it.**

**Bar:** an engineer reading a rendered SUMMARY can state, without consulting docs,
what mock verified and what it did not — and whether it was chosen or fallen back
to.

---

### Phase N — Affirmative provider selection at init

**No existing rec — file under the scout ID.**

**Finding.** Provider defaults are currently inherited silently. Per D-B, requiring
a *real* provider is rejected. But requiring an *explicit choice* is not coercive
and delivers most of the benefit: the operator ends the setup knowing what they
selected.

**Tasks**

- **N.1** — `cadence init` presents the verifier provider choice explicitly. Mock remains a legal, first-class, unshamed option.
- **N.2** — The selection is recorded as a decision in the intelligence ledger, not merely written to config. The point is a retrievable record that a choice was made.
- **N.3** — State the consequence at selection time in plain language, including that `assurance.overall` cannot reach `strong` under mock (see v1.55 J.1 for whether that remains true).
- **N.4** — **Non-interactive paths must not break.** `cadence init --ci`, `--full`, and any scripted invocation need a documented non-prompting form with an explicit flag. A prompt that hangs in CI is a worse defect than the one this phase fixes.
- **N.5** — `cadence onboard` (2nd–Nth teammate on an existing `.cadence/`) must **not** re-prompt. It reports the existing selection instead. Verify against the phase 246 onboard semantics.

**Bar:** a fresh `cadence init` cannot complete without a recorded provider
selection; every non-interactive path completes without a prompt; `cadence onboard`
reports rather than re-asks.

---

### Phase O — Conduction drift counter

**No existing rec — file under the scout ID. Depends on L.**

**Finding.** Phase 251's `conduction-reachability` answers *"can this repo
conduct?"* — a point-in-time capability question. **Nothing answers *"has it,
lately?"*** That is why 263 settles accumulated without escalation. The condition
was static and visible; the *trend* was invisible.

This is a drift-shaped problem and deserves a gate-shaped answer.

**Tasks**

- **O.1** — Derive, from the existing SUMMARY corpus, a standing signal: consecutive settles with no non-`mock` verifier identity in provenance. Read-only, best-effort, consistent with the `phase-freshness` check precedent (phase 208).
- **O.2** — Surface in `cadence doctor` and `cadence status`. Consider `cadence next`, which already answers "what now?" deterministically from live loop state — a long drift streak is a legitimate ranked move.
- **O.3** — **Threshold must be measured, not guessed.** Use E3's post-v1.55 settle counts and `dec-20260801-003`'s existing three-settle convention. Record the derivation. No invented numbers.
- **O.4** — Escalating severity by streak length. Note that `DoctorSeverity` may have gained an indeterminate rung in v1.55 J.2; check before designing the severity ladder.
- **O.5** — This is a *warning*, not a refusal. Do not add a new settle refusal path. Mock is legal; the point is that its accumulation becomes visible.
- **O.6** — Report the counter's value against the current corpus as a measured finding in the DRAFT. That number is the retroactive answer to "how long would this have gone unnoticed."

**Bar:** running the check against the corpus as of v1.54 would have reported a
streak in the hundreds; running it after v1.55 reports a materially lower number;
both figures appear in the DRAFT with their derivation commands.

---

### Phase P — Should mock ever mark a review gate `pass`?

**No existing rec — file under the scout ID. Requires its own decision record
before implementation.**

**The question.** A placeholder that *approves* creates false confidence. A
placeholder that *abstains* cannot. Phase 248 already established the shape:
`status: 'skipped'` with a `skipReason`, used for bypassed verifier throws.
Reusing it for mock review gates would make it **structurally impossible for
provenance to ever record "code-review passed" when a placeholder ran.**

This is refusal-as-first-class-primitive applied to the project's own placeholder.
It is the most doctrinally aligned change in this release and also the most
invasive. Spec it properly.

**Objections already checked — verify independently, do not take on faith:**

- *Does it break the demo?* Apparently not. The demo's refusal comes from `build-test-must-pass`, a deterministic gate, not from a verifier.
- *Does it break offline CI?* Apparently not. `skipped` is not `refused`; the settle proceeds.
- *Does it break `cadence tutorial`?* **Unverified — check this explicitly.**

**Scoping — this is the critical design constraint.**

Apply abstention to the **review families only** (`code-review`, `security-audit`,
`spec-review`, `plan-review`, `ui-spec-review`). For `deep-verify` and
`per-task-verify`, **mock must keep passing**: there it enforces AC↔test linkage,
which is genuine deterministic gate work, and the evidence ladder and
`test-coverage` gate depend on it. Converting those to abstention would remove a
real gate and weaken the system.

If the implementation cannot cleanly separate these two behaviors, **stop and
report** rather than applying abstention uniformly.

**Known interaction to resolve before coding.** In `deriveAssuranceRecord`, gates
with `provider === undefined` are excluded from `verifierRollup`, and
`overall: 'unverified'` requires `!hasAnyVerifier`. A mock-abstained review gate
that still carries `provider: 'mock'` would keep `hasAnyVerifier` true and leave
`overall` derivation unchanged — probably the desired outcome, but **derive it,
state it in the DRAFT, and test it.** Do not discover it at settle time.

**Tasks**

- **P.1** — Record the decision first: abstain vs. pass, with the reasoning and the rejected alternatives. This is a semantic change to gate outcomes and belongs in `decisions.json`.
- **P.2** — Corpus before code. Adversarial fixtures covering each review family under mock, each under a real provider, and the deep-verify/per-task-verify families that must be unaffected. Proven red first.
- **P.3** — Implement abstention for review families only, reusing the phase-248 `skipped` + `skipReason` shape rather than inventing a parallel mechanism.
- **P.4** — Update `deriveAssuranceRecord` and any consumer treating a review `pass` as meaningful. Enumerate consumers before changing them.
- **P.5** — Verify all 263 historical summaries still parse and `cadence summary verify` still passes. **Do not retroactively reinterpret historical `pass` records** — they say what they said.
- **P.6** — Confirm `cadence tutorial` and `examples/demo-test-gutting/run-demo.sh` still behave correctly end to end.

**Bar:** no configuration of CADENCE can produce provenance recording a review-gate
`pass` under a mock provider; `deep-verify` and `per-task-verify` retain their
existing mock pass semantics; the tutorial and demo are unchanged in observable
behavior; all historical summaries verify.

---

## 6. Non-goals for v1.56

- Renaming the `mock` provider identity (D-A).
- Requiring a real provider at setup (D-B).
- Removing the mock verifier.
- New verifier families or providers.
- Broad schema v3 work beyond the single field in L.4, if required.
- Changing `deep-verify` / `per-task-verify` mock semantics (explicitly protected in P).
- New refusal paths (O.5).
- Any change to `isSelfInvocation`, `SELF_INVOCATION_ENV_VAR`, or the `DELTAS` matrix.

---

## 7. Cross-cutting requirements

Carried forward from v1.55 §9, unchanged, plus:

- **No existing mock behavior becomes stricter without a recorded decision.**
- **No historical `SUMMARY.json` is reinterpreted.** New fields are additive and absent-means-absent, never absent-means-defaulted.
- `contentHash` verification remains valid across every file in `.cadence/phases/`.
- No credential, key, or absolute path enters provenance via the new selection-mode field.

---

## 8. Ledger

Dedup first: `cadence recommendation list`, `cadence decision show dec-20260801-003`.

**Decisions to file before Phase L:** D-A (no rename), D-B (no required provider).
**Decision to file before Phase P:** abstain-vs-pass, with alternatives.

**Candidates to file** — verify absent first:

| Finding | Priority / readiness | Phase |
|---|---|---|
| Provenance cannot distinguish configured mock from fallback mock | high / ready-for-cadence-spec | L |
| No standing signal for consecutive settles without real-provider conduction | high / ready-for-cadence-spec | O |
| Mock review gates record `pass`, creating false confidence | high / needs-decision | P |
| `mock` label understates deterministic AC↔test enforcement | medium / ready-for-cadence-spec | M |
| Provider selection is inherited silently at `init` | medium / ready-for-cadence-spec | N |

```bash
cadence recommendation add \
  --scout-id scout-20260804-verifier-honesty \
  --readiness <readiness> --priority <priority> --area <area> \
  --evidence "<measured fact + the command that produced it>"
```

**After Phase O lands**, re-read `dec-20260801-003`. Phase O's counter is the
mechanical instrument for tracking its three-settle revisit trigger. Wire the
trigger to the counter rather than leaving it to manual observation — that
coupling is the point of this entire release.

---

## 9. Report-back protocol

Unchanged from v1.55 §13. Report at every phase boundary and immediately on any
structural surprise. Verbatim commands and exit codes; actual measured output; bar
status with evidence; divergences from this document; anything blocked on operator.

Do not proceed past an unmet bar. Do not self-authorize scope.

---

## 10. Framing

v1.54 shipped a system that could not tell you it had never been verified. Phase
251 fixed the capability question. v1.55 fixed the reachability. v1.56 fixes the
part that actually failed: nothing escalated as the unverified settle count grew
from 1 to 263.

The fix is not to remove the placeholder. Mock earns its place — it enforced
AC↔test linkage across the project's entire history, offline and free, and it can
fail. The fix is that a placeholder should be **legible as a placeholder** in
provenance, in rendering, and in the gate outcome itself — and that its
accumulation should become louder over time rather than quieter.

A verifier that abstains with a named reason is more trustworthy than one that
approves without looking. That principle is already in the codebase, applied to
everything except CADENCE's own default.
