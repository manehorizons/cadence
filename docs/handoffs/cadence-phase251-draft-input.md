# Phase 251 DRAFT input — conduction reachability + finding-durability arc close-out

**Source:** Claude session, 2026-08-02, verified against `thomas-powers-jr/cadence@main` at v1.54.0 (phases 247/248/249/250 landed, arc complete).
**Phase numbering:** 250 is the npm-scope rename (`docs/migration-npm-scope.md`). This is **251** — confirm against `cadence next` / worktree collision check before `draft new`.
**CLI surfaces verified** against `docs/reference/commands.md` at this commit, including the terminal-status constraint in Part A.

---

## Why this phase exists

The finding-durability arc is done. All four refusal families persist complete records, bypassed throws record honest provenance, and per-attempt snapshots survive reloops. The plumbing is finished.

It has never carried water. `rec-20260801-012` establishes two independent, verified blockers that make real-provider code-review findings structurally unreachable in normal operation: the `auto` profile excludes `code-review` from all three tiers, and `host-cli-client.ts`'s self-invocation guard forces a mock fallback whenever cadence runs inside a headless Claude Code session — which is essentially every agent-driven settle here.

**This phase does not remove either blocker.** The self-invocation guard is a real safety property (source comment: spawning a nested headless call "risks an unbounded nested self-invocation of the same host CLI"), and the `auto`-profile gate set is a deliberate cost decision. The phase's job is narrower and more in keeping with the repo's own thesis: **make the blocker visible, so "structurally unreachable" is never again mistaken for "not yet observed."** That distinction — unknown versus unreachable — is the epistemology layer applied to Cadence's own instrumentation, and right now four downstream items (phase 237's entry gate, `dec-20260801-003`'s dedup trigger, `dec-20260802-003`'s revisit trigger, and every inference about finding quality) are all waiting on evidence that current configuration cannot produce, with nothing anywhere reporting that fact.

## Anti-skip contract (binding)

1. **T1 (ledger close-out) must be DONE in PROGRESS before any T2+ work begins.** AC-1 gates it with verbatim check commands; skipped bookkeeping means AC-1 fails and settle refuses.
2. **Commit ledger writes in the same commit as the phase.** Two prior arc sessions produced correct ledger work that was stranded uncommitted in a worktree and nearly lost — and `rec-20260712-006`'s own evidence records an earlier entry lost to a `git reset --hard` before being committed. Same failure, twice, four weeks apart. A worktree's ledger writes are one reset from gone.
3. **Idempotency guards apply.** A guard that fires is a report-back event, not a silent skip.
4. **Single session, top to bottom.** Clean tree, `cadence status` IDLE, no concurrent session before `draft new`.
5. **Scope lock.** `rec-20260802-002` (SUMMARY.md renders no findings) and `rec-20260802-004` (deep-verify's registry gap) are OUT — separate phases. Do not fold either in.

---

## T1 — Arc close-out

**Guard:** `cadence recommendation show rec-20260802-001` must read `candidate`. If already `shipped`, stop and reconcile.

**T1a — close the umbrella.** Its summary still describes 247 as "in BUILD" and S1 as "not yet started"; all three slices shipped in v1.54.0.

```sh
cadence recommendation evidence add rec-20260802-001 \
  --note "Arc complete as of v1.54.0. S1: phase 248 (fcd76ad) — bypassed review-verifier throws record status:'skipped' with a skipReason naming the flag, failure, and configured provider, via a distinct reviewVerifierFailure flag kept separate from deep-verify's verifierFailure. S2: phase 247 (afcb90a) threaded acc.codeReview/acc.securityAudit into the gate-loop refused SUMMARY with a conditional contentHash; phase 249 (8f58bde) routed the three post-gate families (AC-derivation, anomaly/skill-audit, evidence-floor) through the same unchanged writer — verified in source at main: writeRefusedSettleSummary now has four call sites with identical argument shape, and the clock seam is resolved once at the top of settleService so all paths share one resolution. S3: phase 247's immutable per-attempt -SUMMARY-snapshot.json/.md siblings, tail-anchored to be invisible to every current SUMMARY consumer by construction. Preconditions/collision-backstop/soft-cap refusals remain deliberately SUMMARY-less, documented as by-design because they fire before a gates provenance array exists."
```

```sh
cadence recommendation promote rec-20260802-001 --status shipped --ref "v1.54.0 (phases 247/248/249)"
```

**T1b — `shippedRef` drift: record, do not attempt.** `rec-20260801-004` and `rec-20260712-006` both read `shipped` with `--ref "PR pending"`, though #358 and the 249 PR merged. **`recommendation promote` is refused for recs already in a terminal status** (`converted`, `rejected`, `shipped`), and the only sanctioned transitions out are `converted → shipped` and `settle-pending → shipped` — neither applies. There is no CLI path to correct a `--ref` on an already-shipped rec, and hand-editing ledger JSON is out of bounds for a gated task. File the gap instead:

```sh
cadence recommendation add \
  --title "No CLI path corrects a shippedRef on an already-shipped recommendation" \
  --summary "recommendation promote is refused for terminal-status recs, so a --ref recorded at settle time as a placeholder (e.g. 'PR pending') can never be corrected once the PR merges. Observed on rec-20260801-004 (phase 248, PR #358 merged) and rec-20260712-006 (phase 249 merged), both still reading 'PR pending' at v1.54.0. The doctor recommendation-shipped-drift check covers the settle-pending waypoint but not a stale ref on an already-shipped rec. Options to weigh: a narrow 'recommendation ref set <id> --ref' command; allowing --ref on promote for a shipped→shipped no-op transition; or having settle record the branch/PR automatically at the settle-pending → shipped step so a placeholder is never minted. Cosmetic per-instance, but it accumulates once per shipped phase and silently degrades the ledger's own provenance — an uncomfortable gap for the epistemology layer." \
  --priority low \
  --readiness needs-decision \
  --area core,intelligence \
  --evidence "Verified at v1.54.0: docs/reference/commands.md's recommendation promote section states refusal for terminal statuses and lists the two sanctioned exceptions; rec-20260801-004 and rec-20260712-006 both carry ref 'PR pending' post-merge."
```

**T1c — re-measure orphans after the org/scope migration.** `rec-20260802-003` recorded 145 orphan links (20 decisions, 125 evidence) pre-migration. A scope and org rename is exactly the event that could perturb ledger paths, so re-run and attach the current number:

```sh
cadence intelligence audit
```

```sh
cadence recommendation evidence add rec-20260802-003 \
  --note "Re-measured after the phase-250 npm-scope/org migration at v1.54.0: <paste the orphan decision and evidence counts from cadence intelligence audit here, verbatim>. Compare against the pre-migration baseline of 20 orphan decisions + 125 orphan evidence entries to confirm the rename neither introduced nor resolved orphans."
```

## T2 — Verification (report before writing any code)

- **V-1** — Confirm both blockers still hold at v1.54.0: `gates/engine.ts`'s DELTAS matrix (is `code-review` still absent from all three `auto` tiers?) and `host-cli-client.ts`'s `isSelfInvocation` / `SELF_INVOCATION_ENV_VAR` (which families are covered — Claude Code only, or Codex too?).
- **V-2** — Inventory `cadence doctor`'s existing check shape: the `{ name, status, severity, detail, remediation, fixId }` contract, how checks read config, and how an env-dependent check can be made deterministic under the mock-only test rule (an injectable `env` seam, matching `isSelfInvocation(family, env)`'s existing signature).
- **V-3** — Confirm whether a DRAFT-level profile override exists and its exact spelling, since the remediation text must name the real mechanism.

## T3+ — Implementation (sketch; SPEC owns the final shape)

A new `cadence doctor` check — working name `conduction-reachability`, `warning` severity, `fixId: null` (there is no safe auto-repair; both remediations are operator decisions). It evaluates the two axes independently and reports which combination currently holds:

- **Profile axis** — does the resolved gate set for this repo's configured profile include `code-review` / `security-audit` at any tier?
- **Session axis** — is a self-invocation env var set in the current process, such that a host-cli call would fall back to mock?

The `detail` states plainly whether real-provider review findings are reachable *right now*; the `remediation` names both levers — an explicit standard/strict profile override on a DRAFT, and running `cadence settle run` from a real interactive terminal rather than a headless agent session.

## Acceptance criteria (sketch)

- **AC-1 — Arc close-out complete** *(gates T1)*. Given T1 has run, when `cadence recommendation show rec-20260802-001` (status `shipped`, ref naming v1.54.0, two evidence entries), `cadence recommendation show rec-20260802-003` (three evidence entries, latest carrying the post-migration orphan counts), and `cadence intelligence audit` are executed, then every assertion holds with command output captured as executed evidence. Deliberately first: the phase cannot settle with the bookkeeping undone.
- **AC-2 — The check reports reachability honestly.** Given a config whose profile excludes `code-review` and/or an env with the self-invocation var set, when `cadence doctor` runs, then the check reports `warning` with a `detail` naming which of the two blockers is active (or both) and a `remediation` naming both levers. Given a profile that includes the gates and an env with no self-invocation var, then the check reports `ok`.
- **AC-3 — Deterministic under the mock-only rule.** Given the check's config and env inputs are supplied through injectable seams, then every AC-2 combination is exercised without a real provider, a real terminal, or a mutated process env.
- **AC-4 — No behavior change anywhere else.** Given `cadence doctor` runs, then every pre-existing check's status, severity, and text are unchanged, and doctor's exit code is unaffected (the new check is `warning`-severity and cannot fail a CI gate on its own).
- **AC-5 — The decision is recorded, not implied.** Given the phase settles, then a `cadence decision add` entry linked to `rec-20260801-012` records: (a) the self-invocation guard is retained — it prevents unbounded nested self-invocation and removing it to farm findings would trade a real safety property for test data; (b) the `auto`-profile gate set is unchanged — conduction is a deliberate, operator-initiated act, not something that should happen incidentally; (c) conduction is therefore a documented human-operator procedure, and this check exists so its absence is legible rather than silent; (d) trigger to revisit: if operator-run conduction proves impractical enough that the corpus stays empty through the next arc, reconsider a supervised, depth-limited escape hatch.
- **AC-6 — The operator procedure is documented.** Given the docs build, then a short documented procedure states the exact steps to produce a real-provider finding (profile override on the DRAFT, run settle from an interactive terminal, confirm the persisted SUMMARY records a real `verifierIdentity`), and `rec-20260801-012` is promoted to reflect its recorded disposition.

## Constraints

- Suggested tier `standard`; spec-review convergence applies. This document is DRAFT/SPEC input, not a substitute for it.
- **Do not modify** `isSelfInvocation`, `SELF_INVOCATION_ENV_VAR`, the spawn guard, or the DELTAS matrix. This phase adds visibility only.
- Non-goals stated in the SPEC: removing either blocker, an escape-hatch flag, `rec-20260802-002`, `rec-20260802-004`.

## Report-back

After settle: SUMMARY assurance record and gate provenance; AC-1's command outputs verbatim; V-1/V-2/V-3 findings; the decision id from AC-5; any guard that fired and what it found. If any verification contradicts a claim here, this document yields to the repo — correct it, note the correction in the relevant rec's evidence, proceed from measured state.

---

## Queue after this phase

`rec-20260802-002` (SUMMARY.md renders no findings — sharpened by the arc: snapshot siblings exist for human inspection and their `.md` half shows none of the findings that caused the refusal), then `rec-20260802-004` (deep-verify's identical registry gap), with `rec-20260802-003`'s orphan cleanup as a decision-first item once T1c re-measures it.
