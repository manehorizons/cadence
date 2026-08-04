# Handoff — finding-durability remainder (hygiene + D3 + phases 248/249)

**Source:** Claude assessment session, 2026-08-02, against live `main@afcb90a` (v1.53.x + phase 247, loop IDLE).
**Line references pinned to `main@afcb90a`** — re-derive before citing in any DRAFT/SPEC.
**All CLI surfaces below verified against `docs/reference/commands.md` at the same commit** (`recommendation evidence add`, `recommendation promote`, `decision add --rec/--title/--rationale`, `intelligence audit`).

## Session discipline (read first)

**Execute this handoff top-to-bottom in exactly ONE session.** The previous arc handoff was split across two concurrent sessions and its preflight was lost in the seam — that is the failure mode this section exists to prevent.

- Before starting: working tree clean, `cadence status` shows IDLE, no other session active on this repo.
- **Idempotency guard at every step:** each part below opens with a check for whether its output already exists (evidence present, decision recorded, phase directory present). If a check finds prior work, **stop and report** — reconcile, never duplicate. This mirrors how phase 247's T3 handled the abandoned-session pickup: verify before trusting, then continue.
- Parts run in order: 1 → 2 → 3 → 4. Parts 1–2 land as one chore commit before any phase work begins.

**Umbrella rec: deliberately not filed.** The original preflight's umbrella (`scout-20260801-claude-finding-durability`) never landed, and phase 247 shipped without it. Filing it retroactively would create a shipped-on-arrival rec — ledger noise with no consumer. The cluster's queryability is now carried by the evidence cross-links added in Part 1 instead. This is a considered non-action; do not "fix" it.

---

## Part 1 — Ledger hygiene

**Check first:** `cadence recommendation show` for rec-20260731-010, rec-20260712-006, rec-20260801-004. All three should show zero evidence entries. If any already carries an evidence note referencing phase 247 or this handoff, stop and report.

**Explicit non-action, recorded here so it isn't re-litigated:** rec-20260801-005 and rec-20260801-011 are `shipped` with `readiness: needs-decision`. Ledger-wide, readiness is frozen at promotion time on shipped recs (21 shipped/needs-decision in the archive alone) — this is house pattern, not a defect. Leave both untouched.

**1a — Correct rec-20260731-010's now-stale premise:**

```sh
cadence recommendation evidence add rec-20260731-010 \
  --note "Persistence half shipped via phase 247 (PR #357, main@afcb90a): writeRefusedSettleSummary now threads acc.codeReview/acc.securityAudit with the success path's conditional-spread shape, attaches contentHash when findings are non-empty, and preserves findings-bearing refused attempts as immutable -SUMMARY-snapshot siblings. The summary's claim that a refused settle's findings are not even persisted is stale as of 247. Remaining open half is routing-on-refusal only — disposition recorded as a decision tied to this rec (see decision ledger)."
```

**1b — Join rec-20260712-006 to the cluster and sharpen it against 247:**

```sh
cadence recommendation evidence add rec-20260712-006 \
  --note "Joined to the finding-durability cluster. Verified at main@afcb90a: the post-gate-loop refusal families in services/settle.ts still return exitCode 1 with no SUMMARY write (map each ok:false exit site to its owning family before drafting — expected members: AC derivation, anomaly/skill-audit, evidence floor). Phase 247 sharpened the asymmetry: a gate-loop refusal now persists findings, a contentHash, and a tamper-evident sibling, while an evidence-floor refusal later in the same service persists nothing. Fix is now trivially specified: those families call the writer 247 hardened. Scoped as phase 249."
```

```sh
cadence recommendation promote rec-20260712-006 --readiness ready-for-cadence-spec
```

**1c — Record rec-20260801-004's urgency shift:**

```sh
cadence recommendation evidence add rec-20260801-004 \
  --note "Re-verified at main@afcb90a: both catch blocks unchanged by phase 247 — a bypassed verifier throw still returns bare outcome pass with no flags, and registry persists status ran with empty verifier identity. Urgency shifted: codeReview.provider has been host-cli in this repo's live config since PR #351, so a credential expiry or network failure plus --force is now a reachable daily-dogfooding event that records as a clean real-provider pass. Scoped as phase 248; land before real-provider reloop dogfooding accumulates any such records."
```

```sh
cadence recommendation promote rec-20260801-004 --readiness ready-for-cadence-spec
```

**Close Part 1:** `cadence intelligence audit` — must report clean. Findings here mean a link went in wrong; fix before committing.

---

## Part 2 — Record D3 and disposition rec-20260731-010

**Check first:** `cadence decision list --filter-rec rec-20260731-010` — must be empty. If a decision already exists there, stop and report.

```sh
cadence decision add \
  --rec rec-20260731-010 \
  --title "Ledger routing stays finalize-only; refused-attempt findings survive via preserved artifacts, not routing" \
  --rationale "(a) Fact basis: a reloop finding is expected to be fixed in the next attempt minutes later, so routing attempt-1 findings would mint ledger entries for defects that die immediately — compounding rec-20260731-006 (per-settle ledger churn) and rec-20260731-005 (archived recs suppress recurrence of the same finding id). Phase 247 strengthened the case: findings-bearing refused attempts are now durably preserved as contentHash-verified SUMMARY-snapshot siblings, so the ledger is no longer the only place a refused finding can survive — which dissolves the urgency that motivated routing-on-refusal. (b) Pre-committed next step if ever revisited: route from preserved snapshot artifacts at phase abandonment, never live at refusal time. (c) Trigger to revisit: at least one real-provider case where an abandoned phase's preserved refused snapshots contain a high-severity finding that later recurs (same finding id, or same file plus equivalent defect) in a different phase's settled record. Trigger is adjustable when first revisited, not binding."
```

Then close out the rec — its persistence half shipped (247) and its routing half is now a recorded deferral:

```sh
cadence recommendation promote rec-20260731-010 --status deferred
```

**Commit Parts 1+2** as one chore commit, message in house style, e.g. `chore(cadence): finding-durability ledger reconciliation + dec for rec-20260731-010`.

---

## Part 3 — Phase 248: honest bypassed-throw provenance (rec-20260801-004)

**Check first:** no `.cadence/phases/248-*` directory exists. Suggested tier: `standard`. Sketch below is input to the normal SPEC flow — spec-review convergence still applies.

**Objective.** A verifier throw bypassed via `--allow-code-review-failure` / `--allow-security-audit-failure` / `--force` records an honest `skipped` provenance entry naming the flag and the failure — never a bare `ran` with empty identity.

**T1 (do first — this verification was assigned in the prior handoff as V-d and never reported):** read `gates/deep-verify.ts`'s throw path and record exactly how it sources the provider for `flags.verifierFailure = { message, provider }` when the call threw. The two review gates mirror that pattern; do not invent a second one.

**AC sketch:**

- **AC-1** — Given the code-review verifier throws and a bypass flag is set, when settle completes, then the persisted `SUMMARY.gates[]` entry for `code-review` is `status: 'skipped'` with a `skipReason` naming the actual flag used and stating a verifier failure was bypassed — never `status: 'ran'`.
- **AC-2** — Given the verifier throws and no bypass flag is set, then the refuse behavior is byte-identical to today, including the reason text (regression pin).
- **AC-3** — Given a bypassed throw, then the configured verifier family is recorded via the T1-verified `verifierFailure` pattern, and no `verifierIdentity` is fabricated — a clean identity for a call that never returned is a lie.
- **AC-4** — Given a bypassed throw, then `deriveSettleAssuranceRecord` excludes the gate from `verifierRollup` (pin the existing under-report as the correct semantics, now with an explaining record instead of a misleading one).
- **AC-5** — Given the security-audit verifier throws under the same conditions, then AC-1 through AC-4 hold identically. The two catch blocks are byte-identical today; keep the fix symmetric.

**Constraints.** Gates signal via a dedicated bypass flag consumed by a new registry branch following the existing bypass ladder (`build-test-must-pass` / `boundary-scan` / `test-coverage` branches in `registry.ts` — name-the-actual-flag pattern per phase 226). No `GATE_ORDER` change; no non-throw path changes anywhere.

---

## Part 4 — Phase 249: every post-gate refusal writes a SUMMARY (rec-20260712-006)

**Check first:** no `.cadence/phases/249-*` directory exists. Entry condition: phase 248 settled (not a hard dependency, but keeps the arc's one-slice-at-a-time bar). Suggested tier: `standard`.

**Objective.** The post-gate-loop refusal families route through the writer phase 247 hardened, so a refusal after the gate loop leaves the same quality of record as a refusal inside it.

**Scoping task (do first):** map every `ok: false` exit in `services/settle.ts` to its owning family at current main (at `afcb90a` the candidates sit near lines 285, 531, 961, 1059, 1153 — verify ownership, don't trust the numbers). Expected in scope: AC derivation, anomaly/skill-audit, evidence floor. **Expected out of scope, as an explicit documented non-goal:** precondition failures and gate-set-resolution failures — they refuse before a resolved draft/gate context exists, so there is nothing coherent to record; state this in the SPEC rather than leaving it implicit.

**AC sketch:**

- **AC-1** — Given a refusal in any in-scope family, when settle exits 1, then a refused SUMMARY is written via `writeRefusedSettleSummary` with gates provenance and — where the accumulator payloads are in scope at that call site — `codeReview`/`securityAudit` findings threaded through, inheriting 247's conditional contentHash and snapshot-sibling behavior for free (a findings-bearing evidence-floor refusal preserves its findings identically to a gate-loop refusal).
- **AC-2** — Given any in-scope refusal, then exit code, stderr messaging, loop-state non-mutation, and every gate outcome are byte-identical to today; refused SUMMARYs keep `acResults: []` (nothing synthesized).
- **AC-3** — Given the pre-existing SUMMARY corpus and the existing settle test suite, then every record still validates and every existing test passes unmodified — additions land only on already-optional fields; no schema bump.

**Constraints.** `writeRefusedSettleSummary` (or a thin wrapper) stays the single refused-writer — no fourth writer. Verify per call site which accumulator payloads are actually available before threading; do not widen any function signature beyond what each site needs.

---

## Report-back protocol

After Parts 1–2: report the evidence ids created, the decision id, rec-20260731-010's final status line, and the `intelligence audit` result. After each phase settles: report its SUMMARY assurance record and gate provenance, plus any deltas from the sketches above. If any verification contradicts a claim in this handoff, the handoff yields to the repo: correct the claim, note it in the relevant rec's evidence, proceed from measured state.
