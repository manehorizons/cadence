# Arc handoff — finding-durability

**Scout ID:** `scout-20260801-claude-finding-durability`
**Source:** Claude deep-dive session, 2026-08-01, against live `main@98b6a15` (v1.53.0, post-phase-246, loop IDLE).
**All file:line references below are pinned to `main@98b6a15`.** If `main` has moved past that commit, re-derive line numbers before citing them in any DRAFT/SPEC — do not copy them forward unverified (per the citation-rot concern in rec-20260801-008).

---

## Arc thesis

Five filed recommendations are one defect wearing five hats: **finding and provenance data survives only the happy path, and the loss is anti-correlated with severity.** A clean settle persists everything; a refusal — the event most needing an audit trail — persists the least. The arc restores record integrity on every exit path. It is deliberately in the phase-233/244 mold: **no new gates, no new refusal semantics, byte-identical pass/refuse behavior everywhere.** Every slice is reported-record work only.

**Cluster members:** rec-20260731-010, rec-20260801-011, rec-20260801-005, rec-20260801-004, rec-20260712-006 (the July 12 stray — "settle-internal refusal paths still write no SUMMARY" — is this arc's older sibling and joins it here).

**Verified mechanism (main@98b6a15):**

- `packages/core/src/gates/registry.ts:209` — `mergeInto(acc, res)` runs **before** the refuse check (~211–218), so a refusing gate's `summaryPatch` payloads (including `codeReview`/`securityAudit` finding arrays) are already in `acc` when settle takes the refusal branch. The gate-throw catch (~206) refuses without `mergeInto` — nothing to merge there, `res` was never assigned.
- `packages/core/src/services/settle.ts:751` — `writeRefusedSettleSummary` receives `gates` provenance but **not `acc`**: the refused SUMMARY has `acResults: []`, no `codeReview`, no `securityAudit`, no `boundaryScan`, and **no `contentHash`**.
- `settle.ts:1083` — `finalizeAndCloseSettle` is the only path that persists finding payloads and the only path that runs phase-242 ledger routing (~1183–1220, keyed on `codeReviewFindings` + `recommendations.autoRoute`).
- Both writers target the identical `.cadence/phases/<phase>/<draft>-SUMMARY.json` — a convergence reloop's attempt-1 refused SUMMARY is destroyed by attempt-2's success (or by attempt-2's refusal).
- Three post-gate refusal families return `{ ok: false, exitCode: 1 }` with **no SUMMARY write at all**: `deriveSettleAcResults` (~867), `runAnomalyAndSkillAuditChecks` (~965), `deriveEvidenceAndCheckFloor` (~1059).
- `gates/code-review.ts` and `gates/security-audit.ts` catch blocks: a **bypassed** verifier throw returns bare `{ outcome: 'pass' }` — no flags, no `summaryPatch` — so `registry.ts:248` records `{ gate, status: 'ran' }` with empty `verifierIdentityProvenance`, indistinguishable from a clean real-provider pass. The **non-bypassed** throw refuses with a reason naming the failure; only the bypass branch misreports.

---

## Preflight — ledger reconciliation (run before any phase work)

1. **Scout ID collision.** Confirm `scout-20260801-claude-finding-durability` is absent from `.cadence/intelligence/recommendations.json` (check `archived` too). If present, this handoff was partially ingested — reconcile, don't re-add.
2. **Attach the new verification evidence** (each note below is pre-drafted; adjust only if re-verification disagrees):

```sh
cadence recommendation evidence add rec-20260801-005 \
  --note "Independently re-verified against main@98b6a15 (2026-08-01): registry.ts:209 runs mergeInto before the refuse check at ~211-218, code-review's refuse paths return summaryPatch.codeReview, and writeRefusedSettleSummary (settle.ts:751) receives gates but not acc — the findings are captured into the accumulator and discarded at the SUMMARY-write frame. The rec's 'verify before scoping' caveat is now discharged."
```

```sh
cadence recommendation evidence add rec-20260731-010 \
  --note "Correction from source read at main@98b6a15: findings from a refused code-review ARE captured into acc (mergeInto precedes the refuse check) — they are discarded at writeRefusedSettleSummary, not un-persisted by the gate. Persistence half shares one fix with rec-20260801-005/rec-20260712-006 (thread acc payloads into the refused writer). Routing half is a separate decision — see D3 in the finding-durability arc handoff."
```

```sh
cadence recommendation evidence add rec-20260712-006 \
  --note "Joined to the finding-durability cluster (scout-20260801-claude-finding-durability): the three post-gate refusal families (deriveSettleAcResults ~867, runAnomalyAndSkillAuditChecks ~965, deriveEvidenceAndCheckFloor ~1059 at main@98b6a15) still return exitCode 1 with no SUMMARY write. Phase 228 covered only the gate-loop refusal family. Fix travels with rec-20260801-005 in arc Slice 2."
```

```sh
cadence recommendation evidence add rec-20260801-004 \
  --note "Re-verified at main@98b6a15: both code-review.ts and security-audit.ts catch blocks return bare {outcome:'pass'} on a bypassed throw — no flags, no summaryPatch — so registry.ts:248 persists status:'ran' with empty verifier identity. Non-bypassed throw path refuses honestly; only the bypass branch misreports. Arc Slice 1."
```

3. **File the umbrella rec** (claims the cluster for milestone clustering; promote its readiness after Slice 0 records D1–D3):

```sh
cadence recommendation add \
  --title "Finding-durability arc: complete, attempt-addressable settle records on every exit path" \
  --summary "One arc, three slices, restoring record integrity where five filed recs identified loss: (S1) bypassed verifier throws record an honest skipped-with-reason provenance entry instead of a clean 'ran' (rec-20260801-004); (S2) every refusal family — gate-loop and the three post-gate families — writes a complete SUMMARY carrying the accumulator's finding payloads and a contentHash (rec-20260801-005, rec-20260712-006, persistence half of rec-20260731-010); (S3) refused-attempt SUMMARYs are preserved as attempt-suffixed sibling artifacts so convergence reloops bank cross-settle drift pairs instead of destroying them (rec-20260801-011), directly feeding phase 246's pre-registered trigger corpus. No new gates, no new refusal semantics, byte-identical pass/refuse behavior — pure record integrity, in the phase-233/244 reported-only mold. Routing-on-refusal deliberately excluded per decision D3 (finalize-only routing, trigger pre-registered)." \
  --priority high \
  --readiness needs-decision \
  --area core,types \
  --file packages/core/src/services/settle.ts,packages/core/src/gates/registry.ts,packages/core/src/gates/code-review.ts,packages/core/src/gates/security-audit.ts \
  --evidence "Five-rec cluster verified line-by-line at main@98b6a15: acc payloads discarded at writeRefusedSettleSummary (settle.ts:751), three silent post-gate refusal families (~867/~965/~1059), same-path SUMMARY overwrite on reloop, and bare {outcome:'pass'} bypass catches in both review gates. Data loss is anti-correlated with severity: the cleanest settles keep the most complete records." \
  --scout-id scout-20260801-claude-finding-durability
```

---

## Slice 0 — verify + decide (no source changes ship)

Phase 246's discipline applies: decisions durable before code. Four verifications, then three decisions.

### Verifications (report findings back before recording decisions)

**V-a — Sidecar lifecycle and fidelity.** In `verify/converge.ts` and its callers: is `<draft>-CODE-REVIEW.json` cleared/rotated on a successful settle, and does `history` store full finding text or a truncated/count-only shape? Determines whether the sidecar could ever serve as a drift corpus (expected answer: no — which is why D2 recommends artifact files — but confirm rather than assume).

**V-b — SUMMARY consumer glob inventory.** Enumerate every consumer that discovers SUMMARYs by pattern and record each one's exact matcher: `scanRetroArtifacts` (retro-rollup.ts), `cadence verify phase --changed` discovery, `verify/phase-replay.ts`, `cadence summary render`/`summary verify` path resolution, and the phase-246 corpus scripts if committed. For each, confirm whether a file named `<draft>-SUMMARY.refused-1.json` would match. **Slice 3's suffix choice is hostage to this list** — the acceptance bar is zero consumers double-counting.

**V-c — Refused-SUMMARY readers.** Does anything read the canonical refused SUMMARY back today — `resume`, `status`, `next`, hooks? `settle.ts` itself does not. Determines whether Slice 2/3 must keep writing the canonical path on refusal (D2 assumes yes, for compatibility and for the phase-228 "human fixes and retries" intent).

**V-d — deep-verify throw-path provider sourcing.** How does `gates/deep-verify.ts` populate `flags.verifierFailure = { message, provider }` when the call threw — configured-family resolution, or something on the error? Slice 1 mirrors this pattern exactly rather than inventing a second one.

### Decisions (record via `cadence decision add`, linked to the listed recs; check `--help` for exact flag names — phase 246 used `--rec`)

**D1** *(recs: rec-20260801-005, rec-20260712-006, rec-20260731-010)* — Every refusal family writes a SUMMARY; refused SUMMARYs carry the accumulator's payloads and a contentHash.
Rationale draft: *(a)* Verified at main@98b6a15: refusal-time data loss spans four exit families and the payloads already exist in `acc` at the refusal frame — persistence is a threading change, not a collection change. *(b)* Refused SUMMARYs gain `contentHash` (phase-223 precedent, all fields optional within schemaVersion 2 — no version bump) because preserved refused artifacts become the corpus phase 246's offline analyzer reads, and an unhashed corpus record is unverifiable by `cadence summary verify`. *(c)* Refused SUMMARYs remain `acResults: []` — nothing was evaluated; do not synthesize verdicts.

**D2** *(rec: rec-20260801-011)* — Attempt preservation via attempt-suffixed sibling artifacts; canonical path behavior unchanged; convergence sidecar untouched.
Rationale draft: *(a)* Refused settles additionally write `<draft>-SUMMARY.refused-<n>.json` (exact suffix finalized against V-b's consumer inventory; the bar is that no existing `*-SUMMARY.json` matcher picks it up). The canonical path still gets the latest write exactly as today — nothing that reads it changes behavior. *(b)* Sibling files over an embedded attempts array because each attempt stays an independently hashable, schema-stable artifact and the canonical record's `contentHash` semantics are untouched; over sidecar enrichment because the sidecar is code-review-only and (per V-a, expected) not full-fidelity, while phase 246 recorded SUMMARY.json — not the ledger, not sidecars — as the corpus of record. *(c)* Success never deletes prior refused-attempt artifacts: an abandoned, never-converged phase leaves a complete forensic trail. *(d)* Attempt numbering is derived from files present on disk, never process memory.

**D3** *(rec: rec-20260731-010, routing half)* — Ledger routing remains finalize-only; refused-attempt findings are recoverable from preserved artifacts, not routed.
Rationale draft, 246-shape: *(a)* Fact basis: a reloop finding is expected to be fixed in the next attempt minutes later; routing attempt-1 would mint ledger entries for defects that die immediately, compounding rec-20260731-006 (per-settle ledger churn) and rec-20260731-005 (archived recs suppress recurrence of the same finding id). Once D1/D2 land, the ledger is no longer the only place a refused finding can survive — which dissolves the urgency that motivated the ask. *(b)* Pre-committed next step if revisited: route from **preserved artifacts at abandonment**, not live at refusal time. *(c)* Trigger: at least one real-provider case where an abandoned phase's preserved refused artifacts contain a high-severity finding that later recurs (same `Finding.id` or same file + equivalent defect) in a different phase's settled record. Adjustable when first revisited; not binding.

---

## Slice 1 — honest bypassed-throw provenance (rec-20260801-004)

Independent of Slices 2–3; may ship first. Suggested tier: `standard`.

**Objective.** A verifier throw bypassed via `--allow-code-review-failure` / `--allow-security-audit-failure` / `--force` records an honest `skipped` provenance entry naming the flag and the failure, never a bare `ran`.

**ACs (sketch):**

- **AC-1** — Given the code-review verifier throws and a bypass flag is set, when settle completes, then the persisted `SUMMARY.gates[]` entry for `code-review` is `status: 'skipped'` with a `skipReason` naming the actual flag used and stating a verifier failure was bypassed — never `status: 'ran'`.
- **AC-2** — Given the verifier throws and no bypass flag is set, when settle runs, then the refuse behavior is byte-identical to today (regression pin on the existing catch-path refusal, including its reason text).
- **AC-3** — Given a bypassed throw, when provenance is recorded, then the configured verifier family is recorded via the deep-verify `verifierFailure` pattern (per V-d) — and no `verifierIdentity` is fabricated (a clean identity for a call that never returned is a lie).
- **AC-4** — Given a bypassed throw, when `deriveAssuranceRecord` runs, then the gate is absent from `verifierRollup` (pin the existing under-report as the correct semantics, now with an explaining record instead of a misleading one).
- **AC-5** — Given the security-audit verifier throws under the same conditions, then AC-1 through AC-4 hold identically (the two catch blocks are byte-identical today; keep the fix symmetric).

**Constraints.** No `GATE_ORDER` change; no change to any non-throw path's pass/refuse outcome; registry branch follows the existing build-test/boundary-scan bypass-flag → `skipReason` pattern (registry.ts ~235–246), not a new mechanism.

---

## Slice 2 — every refusal writes a complete SUMMARY (rec-20260801-005, rec-20260712-006, rec-20260731-010 persistence half)

Entry: D1 recorded. Suggested tier: `standard`.

**Objective.** All four refusal families persist a refused SUMMARY carrying the accumulator's finding payloads and a contentHash.

**ACs (sketch):**

- **AC-1** — Given the gate loop refuses after code-review and/or security-audit deposited findings into `acc`, when the refused SUMMARY is written, then it contains those `codeReview`/`securityAudit` payloads (and `boundaryScan` when present) — including the later-gate-refuses case rec-20260801-005 names (code-review passes with a declared gap, security-audit refuses, gap survives in the artifact).
- **AC-2** — Given a refusal in any of the three post-gate families (AC derivation, anomaly/skill-audit, evidence floor), when settle exits 1, then a refused SUMMARY is written with gates provenance and available payloads — the current silent exit is gone.
- **AC-3** — Given any refused SUMMARY is written, then it carries a `contentHash` computed the phase-223 way and `cadence summary verify` validates it.
- **AC-4** — Given any refusal, then exit code, stderr messaging, loop-state non-mutation, and every gate's pass/refuse outcome are byte-identical to today; refused SUMMARYs keep `acResults: []`.
- **AC-5** — Given the full pre-existing settled-SUMMARY corpus, when parsed, then every record still validates at schemaVersion 1 and 2 — all additions land on already-optional fields; no version bump.

**Constraints.** Thread payloads from `acc` at the call sites — do not re-run any verifier or re-derive findings; `writeRefusedSettleSummary` stays the single refused-writer (post-gate families call it or a thin wrapper, not a fourth writer).

---

## Slice 3 — attempt-addressable refusal artifacts (rec-20260801-011)

Entry: Slice 2 settled; D2 recorded; V-b inventory complete. Suggested tier: `standard`.

**ACs (sketch):**

- **AC-1** — Given a settle refuses, when the refused SUMMARY is written to the canonical path, then an attempt-suffixed sibling (`<draft>-SUMMARY.refused-<n>.json`, exact suffix per D2/V-b) is also written with identical content including `contentHash`.
- **AC-2** — Given attempt artifacts exist, when every consumer in the V-b inventory runs (retro scan, `verify phase --changed`, phase-replay, `summary render`/`verify`), then each consumer's results are unchanged by their presence — asserted per-consumer, not assumed from the glob.
- **AC-3** — Given attempt-1 refused and attempt-2 succeeds, when the success SUMMARY overwrites the canonical path, then attempt-1's suffixed artifact still exists and still passes `cadence summary verify` — the reloop drift pair phase 246's trigger needs is durably banked.
- **AC-4** — Given prior attempt files exist on disk and the process has restarted between attempts, when the next refusal writes, then numbering continues monotonically from the files present — never from in-memory state.

**Out of scope for the arc, recorded not built:** routing-on-refusal (D3, trigger pre-registered) and fuzzy finding-identity dedup (phase 246 owns it; its trigger — three non-mock settles each persisting ≥1 finding — is *fed* by this arc, not part of it).

---

## Report-back protocol

After Slice 0: report V-a through V-d findings and the recorded decision ids before drafting Slice 1's SPEC. After each slice settles: report the SUMMARY assurance record and gate provenance for the settle itself, plus any deltas from the sketched ACs (sketches above are inputs to `cadence spec new`, not substitutes for it — spec-review convergence still applies). If any verification contradicts a claim in this handoff, the handoff yields to the repo: correct the claim, note the correction in the relevant rec's evidence, and proceed from measured state.
