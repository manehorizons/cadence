# Phase 249 DRAFT input — post-gate refusal SUMMARYs + finding-durability ledger closeout

**Source:** Claude session, 2026-08-02, against live `main@fcd76ad` (post-phase-248, loop IDLE).
**Replaces** Parts 1, 2, and 4 of `cadence-handoff-finding-durability-remainder.md`. That handoff's ledger parts have now been skipped across two sessions; this document exists to make a third skip structurally impossible rather than exhortatively discouraged.
**Line references pinned to `main@fcd76ad`** — re-derive before citing in the SPEC.

---

## Why the ledger work is inside this phase (read before drafting)

Twice now, code phases from this arc executed while their companion ledger bookkeeping evaporated. The diagnosis is the repo's own thesis: a phase cannot settle without its artifacts, but a chore-commit instruction in handoff prose has no refusal path — it is shape, and shape drifts. So this phase's DRAFT makes the bookkeeping **gated**: the ledger closeout is T1/T2 with its own acceptance criterion (AC-1 below), verified by executing commands whose output is the evidence. If T1/T2 are skipped, AC-1 cannot pass, `task-verify-required` and settle refuse, and the phase does not close. The bookkeeping inherits an exit code. That is the entire design intent — preserve it through spec-review; do not let the ledger tasks be "simplified" out into a follow-up commit, because the follow-up commit is precisely the thing that has failed to happen twice.

## Anti-skip contract (binding on this phase)

1. **T1 and T2 are ordered first in the DRAFT and must be DONE in PROGRESS before any T3+ work begins.** Not "before settle" — before the first line of T3 is touched. If you find yourself writing settle.ts changes with T1/T2 still pending, stop: that is the failure mode recurring.
2. **AC-1 is machine-checkable and its check commands are listed verbatim.** Task-verify for T1/T2 runs those commands and records their output; "I did the ledger work" as prose is not acceptable evidence.
3. **Idempotency guards still apply.** Each ledger action opens with a check for prior work; if found, reconcile and record what was found rather than duplicating. A guard firing is a report-back event, not a silent skip.
4. **Single session, top to bottom.** Working tree clean, `cadence status` IDLE, no concurrent session, before `draft new`.
5. **Scope lock.** rec-20260802-001 (deep-verify's identical registry-side gap) is explicitly OUT of this phase — it is phase 250. Do not fold it in, however tempting the adjacency; 248 held the same line deliberately.

---

## T1 — Record D3 and disposition rec-20260731-010

**Guard:** `cadence decision list --filter-rec rec-20260731-010` must be empty and `cadence recommendation show rec-20260731-010` must show status `candidate`. If either differs, stop, record what exists, reconcile.

**T1a — evidence note (stale-premise correction):**

```sh
cadence recommendation evidence add rec-20260731-010 \
  --note "Persistence half shipped via phase 247 (PR #357): writeRefusedSettleSummary now threads acc.codeReview/acc.securityAudit with the success path's conditional-spread shape, attaches contentHash when findings are non-empty, and preserves findings-bearing refused attempts as immutable -SUMMARY-snapshot siblings. The summary's claim that a refused settle's findings are not persisted is stale as of 247. Remaining open half was routing-on-refusal only — disposition recorded as the decision tied to this rec."
```

**T1b — the D3 decision:**

```sh
cadence decision add \
  --rec rec-20260731-010 \
  --title "Ledger routing stays finalize-only; refused-attempt findings survive via preserved artifacts, not routing" \
  --rationale "(a) Fact basis: a reloop finding is expected to be fixed in the next attempt minutes later, so routing attempt-1 findings would mint ledger entries for defects that die immediately — compounding rec-20260731-006 (per-settle ledger churn) and rec-20260731-005 (archived recs suppress recurrence of the same finding id). Phase 247 strengthened the case: findings-bearing refused attempts are now durably preserved as contentHash-verified SUMMARY-snapshot siblings, so the ledger is no longer the only place a refused finding can survive — which dissolves the urgency that motivated routing-on-refusal. (b) Pre-committed next step if ever revisited: route from preserved snapshot artifacts at phase abandonment, never live at refusal time. (c) Trigger to revisit: at least one real-provider case where an abandoned phase's preserved refused snapshots contain a high-severity finding that later recurs (same finding id, or same file plus equivalent defect) in a different phase's settled record. Trigger adjustable when first revisited, not binding."
```

**T1c — close the rec:**

```sh
cadence recommendation promote rec-20260731-010 --status deferred
```

## T2 — Join rec-20260712-006 to the cluster and promote it

**Guard:** `cadence recommendation show rec-20260712-006` must show readiness `raw-idea` and exactly one evidence entry (the 2026-07-12 reconstructed stub). If it already carries a cluster-join note or a higher readiness, stop and reconcile.

```sh
cadence recommendation evidence add rec-20260712-006 \
  --note "Joined to the finding-durability cluster. Verified at main@fcd76ad: the post-gate-loop refusal families in services/settle.ts still return exitCode 1 with no SUMMARY write. Phases 247/248 sharpened the asymmetry: a gate-loop refusal now persists findings, a contentHash, a tamper-evident sibling, and honest bypass provenance, while an evidence-floor refusal later in the same service persists nothing. Fix: those families call the writer 247 hardened. This phase (249) implements it."
```

```sh
cadence recommendation promote rec-20260712-006 --readiness ready-for-cadence-spec
```

**Known cosmetic, deliberately not chased in T1/T2:** rec-20260801-004's `shippedRef` still reads "PR pending" though #358 merged. Left alone — no verified CLI path updates a ref on an already-shipped rec, and hand-editing ledger files is out of bounds for a gated task.

## T3 — Scoping: map every post-gate `ok: false` exit to its owning family

At `fcd76ad` the candidate sites sit near settle.ts lines 285, 531, 961, 1059, 1153 — **verify ownership, don't trust the numbers.** Expected in scope: AC derivation, anomaly/skill-audit, evidence floor. Expected out of scope as a documented non-goal in the SPEC: precondition failures and gate-set-resolution failures — they refuse before a resolved draft/gate context exists, so there is nothing coherent to record; state this explicitly rather than leaving it implicit.

## T4+ — Implementation (sketch; the SPEC owns the final shape)

The in-scope families route through `writeRefusedSettleSummary` (or a thin wrapper — no fourth writer), threading whichever accumulator payloads are actually in scope at each call site, inheriting 247's conditional contentHash and snapshot-sibling behavior for free. Verify per call site which payloads are available before threading; widen no signature beyond what each site needs.

---

## Acceptance criteria (sketch — input to `cadence spec new`, convergence applies)

**AC-1 — The finding-durability ledger closeout is complete and verifiable** *(gates T1/T2)*
Given T1 and T2 have run,
when the following are executed —
`cadence decision list --filter-rec rec-20260731-010` (exactly one active decision, title beginning "Ledger routing stays finalize-only"),
`cadence recommendation show rec-20260731-010` (status `deferred`, two evidence entries, one linked decision),
`cadence recommendation show rec-20260712-006` (readiness `ready-for-cadence-spec`, two evidence entries),
`cadence intelligence audit` (clean, exit 0) —
then every listed assertion holds, with command output captured as the executed evidence. This AC is deliberately first: the phase cannot settle with the bookkeeping undone.

**AC-2 — Every in-scope post-gate refusal writes a refused SUMMARY**
Given a refusal in any T3-mapped in-scope family, when settle exits 1, then a refused SUMMARY is written via the phase-247 writer with gates provenance and — where accumulator payloads are in scope at that call site — `codeReview`/`securityAudit` findings threaded through, inheriting conditional contentHash and snapshot-sibling behavior identically to a gate-loop refusal (a findings-bearing evidence-floor refusal preserves its findings exactly as a gate-loop refusal does).

**AC-3 — Byte-identical refusal behavior otherwise**
Given any in-scope refusal, then exit code, stderr messaging, loop-state non-mutation, and every gate outcome are unchanged; refused SUMMARYs keep `acResults: []` (nothing synthesized).

**AC-4 — Corpus and suite stability**
Given the pre-existing SUMMARY corpus and the existing settle test suite, then every record still validates and every existing test passes unmodified — additions land only on already-optional fields; no schema bump.

## Constraints

- Suggested tier `standard`; spec-review convergence applies; this document is DRAFT/SPEC input, not a substitute.
- Single refused-writer invariant preserved (247's).
- Non-goals stated in the SPEC: precondition/gate-set-resolution silence (by design, with the reason), rec-20260802-001 (phase 250), the 004 shippedRef cosmetic.

## Report-back

After settle: the SUMMARY assurance record and gate provenance; AC-1's four command outputs verbatim; any guard that fired and what it found; any delta from the sketches. If any verification contradicts a claim here, the document yields to the repo — correct, note in the relevant rec's evidence, proceed from measured state.
