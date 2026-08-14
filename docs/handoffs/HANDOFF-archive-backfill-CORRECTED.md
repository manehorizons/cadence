# HANDOFF — Pre-Phase-102 Archive Backfill (CORRECTED)

**Author:** external audit peer (2026-08-14, pass 4 — corrected)
**Target:** Claude Code, working session on `main`
**Supersedes:** `HANDOFF-v1.58-ledger-truth.md` — **withdrawn, see §0**
**Baseline:** `v1.57.0`, published 2026-08-13T23:42:58Z, zero pending changesets.

---

## 0. Retraction

**The previous handoff's central diagnosis was wrong. Claude Code caught it before
writing code, and was right on every point. This document replaces it.**

What I claimed: 21 recommendations filed before July were still *open* — four at `high` —
describing MCP and observability work that had shipped in June and never been recorded.
I called it a ledger that had drifted from reality and specced a P0 complex-tier arc
around fixing it.

What is actually true: **all 21 already carry terminal status in the ledger** — 20
`shipped`, 1 `rejected` — each with `shippedRef` and `convertedToPhaseId` populated.
`rec-20260607-001` reads `shippedRef: "v1.16.0 (phase 75)"`, `convertedToPhaseId:
"75-mcp-resources"`. I "discovered" phase 75 by inspecting the source tree and reported
it as a gap. The ledger had been saying it all along, in the same records my script was
printing.

**The error:** my counting command read `R.recommendations.length` and never inspected
the `status` field. `recommendations[]` is the *not-yet-archived* array, not the *open*
array. Those are different things, and I conflated them.

Two consequences that need correcting on the record:

1. **The "open grew 95 → 100" trend I reported in the pass-4 assessment is fabricated.**
   Pass 3 filtered by status and returned 95; pass 4 did not and returned 100. I compared
   them as though they measured the same quantity. **True open count: 78, with 9 `high`** —
   it went down, not up.
2. **`rec-20260611-001` is `shipped`, converted to phase `100-rec-shipped-status`** — it
   is the recommendation that *asked for* terminal shipped status, and it shipped. The
   withdrawn handoff anchored a P0 phase on it as an open gap. Its D-J section also cited
   it via a date transposition: `dec-20260813-004`'s rationale names `rec-20260803-001`,
   `rec-20260808-003`, and `rec-20260811-004` — no June recommendation appears in it.

**Claude Code's judgment on `rec-20260811-004` was correct and should stand.** That is
the one genuinely-remaining milestone-side terminal-state gap, it was explicitly
reaffirmed as deferred on 2026-08-13 (`dec-20260813-004`), and reversing a four-day-old
decision by quietly building a P0 phase around a handoff's say-so is not a call an agent
should make unprompted. Declining to do it was the right behavior.

**Withdrawn in full:** Phases Y, Z, AA.1, AA.2, AB, and decisions D-J, D-K, D-L as
specified. What survives is below, and it is much smaller.

---

## 1. Mission

One real defect remains, and it is a backfill, not an arc.

Phase `100-rec-shipped-status` introduced terminal status. Phase `102-rec-auto-archive`
(settled 2026-06-11T21:29:43Z, v1.24) made archival automatic on terminal transitions,
with `recommendations.autoArchive` defaulting to `true`. **22 records were promoted to
terminal status before phase 102 existed**, using a promote path with no archiving
concept. No backfill was ever run.

They are correctly statused and fully evidenced. They are simply sitting in the wrong
array. Every one can be moved with the existing CLI. **No new code is required.**

Optionally, add the deterministic invariant check that makes this class of drift
impossible to reaccumulate — see Phase AE.

---

## 2. Measured context

Measured against `main` @ HEAD `2026-08-14T00:11Z`. **Re-run before relying on any of it.
Note the `status` field this time.**

### CMD-1 — the invariant, and the backlog it currently fails

```bash
node -e "
const R=require('./.cadence/intelligence/recommendations.json');
const TERM=new Set(['shipped','rejected','converted','archived']);
const bad=R.recommendations.filter(r=>TERM.has(r.status));
console.log('terminal-status records still in recommendations[]:',bad.length);
console.log('genuinely open:',R.recommendations.length-bad.length);
if(bad.length)console.log(bad.map(r=>r.id).join(' '));
process.exitCode=bad.length?1:0;
"
```

Measured: **22 terminal-but-unarchived, 78 genuinely open**, exit 1.

The 22: `rec-20260602-001/-002/-003`, `rec-20260603-001`, `rec-20260604-001/-002/-003/-004`,
`rec-20260605-001/-002/-003`, `rec-20260607-001/-002/-003/-004/-005/-006/-007`,
`rec-20260608-001`, `rec-20260610-001`, `rec-20260611-001`, `rec-20260701-001`.

All 21 pre-July plus `rec-20260701-001` (`converted`).

### CMD-2 — true open population

```bash
node -e "
const R=require('./.cadence/intelligence/recommendations.json');
const TERM=new Set(['shipped','rejected','converted','archived']);
const open=R.recommendations.filter(r=>!TERM.has(r.status));
const p={};for(const r of open)p[r.priority]=(p[r.priority]||0)+1;
console.log('open:',open.length,JSON.stringify(p));
console.log('archived:',R.archived.length);
"
```

Measured: open 78 — `{medium: 38, low: 31, high: 9}`; archived 148.

**This, not 100/14, is the real prioritization surface.** Any planning done against the
withdrawn handoff's figures should be redone against these.

### CMD-3 — the archive path has no status gating

```bash
sed -n '476,495p' packages/core/src/intelligence/store/recommendations.ts
```

`archiveRecommendation` has exactly one guard: `if (!target)` — the id must exist in
`recommendations[]`. No status check. The record is moved by spreading `...target`, so
**`status`, `shippedRef`, and `convertedToPhaseId` are preserved verbatim**; only
`archivedAt`, `archiveReason`, and `updatedAt` are added.

CLI signature, confirmed at `cli/commands/recommendation.ts:510`:

```
cadence recommendation archive <recId>     # positional, no flags
cadence recommendation unarchive <recId>   # rollback, line 530
```

### CMD-4 — existing archiveReason distribution

```bash
node -e "
const R=require('./.cadence/intelligence/recommendations.json');
const c={};for(const r of R.archived)c[r.archiveReason]=(c[r.archiveReason]||0)+1;
console.log(JSON.stringify(c));"
```

Measured: `{"shipped":121,"converted-settled":18,"manual":6,"rejected":3}`

Relevant to D-M below: the CLI's `archive` verb hardcodes `'manual'`
(`recommendation.ts:514`). Note the field is `archiveReason`, not `archivedReason`.

---

## 3. Decision

### D-M — `archiveReason` fidelity on the backfill

Archiving the 22 through the CLI stamps `archiveReason: 'manual'` on records whose
substantive reason is `shipped` (20), `rejected` (1), or `converted-settled` (1).

Options:

1. **Accept `manual`.** Defensible on its own terms — a manual backfill *is* why these
   were archived, and `status` still carries the substantive truth. Cost: the 22 become
   indistinguishable from the 6 pre-existing genuine `manual` archives.
2. **Add a `--reason` flag** to the archive verb so the backfill can stamp the true
   reason. Small, but it is new code, and it widens a CLI surface to serve a one-time
   migration.
3. **Accept `manual`, and record a decision** stating that `manual` archives dated
   2026-08-14 are the pre-phase-102 backfill cohort, making them identifiable by
   `archivedAt` without new code.

**I lean option 3.** It preserves the distinction at zero cost and leaves no new surface
behind. But `archiveReason` is a provenance field, and if the project's view is that
provenance fields should never carry a value that misstates the cause, option 2 is the
principled answer. Your call — record whichever.

---

## 4. Entry conditions

- **E1** — `main` clean; `v1.57.0` tag present; zero pending changesets.
- **E2** — CMD-1 and CMD-2 run, output recorded verbatim, before any transition.
- **E3** — **Independently verify at least three of the 22** — confirm the record's
  `status`, `shippedRef`, and `convertedToPhaseId` against the named phase directory
  and its `SUMMARY.json`. If any record's evidence does not hold up, **that record is
  not backfilled**; record the discrepancy instead. I asserted things about this
  ledger once already without checking the field in front of me; do not inherit that.
- **E4** — Confirm `recommendations.autoArchive` resolves `true` in this repo, so the
  invariant genuinely holds going forward and this is a one-time backfill rather than a
  recurring sweep.

---

## 5. Phases

| # | Phase | Priority | Tier | Notes |
|---|---|---|---|---|
| AD | Pre-phase-102 archive backfill | P1 | quick-fix | Existing CLI, no new code |
| AE | `recommendation-archive-currency` doctor check | P2 | standard | Optional; see §5.2 |

---

### Phase AD — Pre-phase-102 archive backfill

**Tier `quick-fix`.** This is 22 CLI invocations and a verification. It does not warrant
`complex`, and it does not need real conduction — there is no code change to review.

**Tasks**

- **AD.1** — Run `cadence recommendation archive <recId>` for each of the 22 ids from
  CMD-1. Capture stdout for each.
- **AD.2** — Re-run CMD-1. It must report 0 and exit 0.
- **AD.3** — Re-run CMD-2. Open count must remain **78** and the priority split
  unchanged — the backfill moves terminal records only and must not alter the open
  population. **If the open count changes, something was archived that shouldn't have
  been; roll it back with `unarchive`.**
- **AD.4** — Spot-check three archived records to confirm `status`, `shippedRef`, and
  `convertedToPhaseId` survived the move unchanged.
- **AD.5** — Apply D-M.

**Acceptance criteria** — anchor each to a command result or a committed test, never to
SUMMARY prose (`dec-20260812-001`).

- **AC-1** — CMD-1 reports 0 and exits 0.
- **AC-2** — CMD-2 reports open 78, `{medium: 38, low: 31, high: 9}`, unchanged from
  the pre-backfill measurement.
- **AC-3** — `archived[]` grows by exactly 22, to 170.
- **AC-4** — For three sampled records, `status`/`shippedRef`/`convertedToPhaseId` are
  byte-identical pre- and post-move.
- **AC-5** — D-M recorded as a decision, referenced by id.

**Bar:** no hand-edits to `.cadence/intelligence/`. Everything through the CLI.
Rollback path is `cadence recommendation unarchive <recId>`.

---

### Phase AE — `recommendation-archive-currency` doctor check *(optional)*

The withdrawn handoff proposed a `recommendation-currency` check without a defensible
signal, and I flagged at the time that a check measuring the wrong thing would be worse
than none. That concern was correct — but the correct signal now exists, and it is the
one the real defect exposes:

> **No record in `recommendations[]` should carry a terminal status.**

This is deterministic, has no false positives, is computable in one pass, and —
importantly — **creates no pressure to close anything.** It measures a structural
invariant, not productivity. It cannot be gamed by marking work done. Post-phase-102
`autoArchive` maintains it automatically; every violation is a pre-102 artifact or a
genuine bug in a transition path.

Follows the `roadmap-currency` (phase 259) / `release-currency` (phase 262) house
pattern. **Warning-only, never fails the exit code.** Handle the `indeterminate` rung
explicitly per `dec-20260810-005` — an unreadable or malformed ledger is
`indeterminate`, not `ok`.

**Skip legitimately if:** after AD the invariant holds and the team judges a check
unnecessary for a defect that can no longer recur. `dec-20260813-002`'s handling of the
skipped Phase U is the precedent for closing out a conditional phase honestly.

---

## 6. Non-goals

- **Everything in the withdrawn handoff.** Phases Y, Z, AA.1, AA.2, AB; decisions D-J,
  D-K, D-L. There is no lifecycle gap on the recommendation side to build.
- **Reversing `dec-20260813-004`.** `rec-20260811-004` (milestone-side terminal state)
  stays deferred and low-priority. If it should be reopened, that is an operator
  decision made deliberately, not a side effect of a backfill.
- **Any MCP or observability work.** Both arcs shipped in v1.16–v1.24 and the ledger
  correctly records it.
- **A release.** AD is bookkeeping with no package-visible change and needs no changeset.
  If AE is built, it ships in whatever release comes next.

---

## 7. One item worth filing

Unrelated to the backfill, still unrecorded, and it survived the retraction because it
was measured rather than inferred:

`rec-20260806-004` ("real-provider gates silently produce empty findings when touched
files are already committed") is `high` with **no evidence recorded**. The corpus does
not support it:

- `providerSelection` distribution across 287 settles: `{"configured":3,"fallback":1}` —
  **`empty-diff` has fired zero times.** Phase 263 built that detector for exactly this
  failure mode.
- Phase 267's zero-finding conduction — which I previously offered as a suspected
  instance — reviewed a **73,689-byte diff across 20 files**. It was a real review that
  found nothing, not an empty-diff artifact.
- Real conduction produced findings on **3 of 5** conductions: phase 256 (MEDIUM,
  runbook step gap), phase 272 (HIGH, Windows `grep` ENOENT), phase 274 (MEDIUM,
  exported mutable gate tables).

Worth attaching as evidence and re-rating. The third bullet is a positive signal about
verifier value that currently exists nowhere in the ledger.

---

## 8. Report-back protocol

1. CMD-1 and CMD-2, before and after, verbatim.
2. The three records independently verified under E3, and whether their evidence held.
3. Which D-M option was taken, with the decision id.
4. Whether Phase AE was built or legitimately skipped, with reasoning.
5. Anything in §2 that measured differently than stated here.

---

## 9. Framing

The withdrawn handoff argued that a record drifting from reality is dangerous because
decisions get made from it. That argument was sound. The demonstration was me: I built
a release plan on a misread of the very ledger I was accusing of being wrong, and the
field that would have falsified me was in the records my own script printed.

What caught it was not a better-argued document. It was Claude Code checking the source
before trusting the record — the repo's own doctrine, applied to an artifact that
arrived with an auditor's confidence attached. That is the gate-vs-shape thesis working
in the direction that actually matters, and it is worth more than the handoff it
rejected.

The real work here is 22 CLI calls.
