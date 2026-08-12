# HANDOFF — CADENCE v1.57.0 Criteria Honesty

**Author:** external audit peer (2026-08-12, pass 3)
**Target:** Claude Code, working session on `main`
**Predecessors:** `HANDOFF-v1.56-verifier-honesty.md` (L–P, shipped), `HANDOFF-v1.56-release-closeout.md` (Q–S, shipped as 271–273)
**Baseline:** `v1.56.0`, published to npm 2026-08-11T22:57:09Z, all five public packages in lockstep.

---

## 0. Scope decision

You asked whether this should be criteria-honesty only or criteria-honesty plus an
MCP surface opener. **This handoff is criteria-honesty only, and I'd argue against
bundling MCP into it.**

The reason is structural, not schedule-driven. The work below changes what
`deep-verify` can see and how an unverifiable criterion is classified — a semantics
change to the verification substrate itself. The MCP surface arc
(`rec-20260607-001` through `-004`) builds a new *public* consumer surface on top of
that substrate. Landing both in one release means the first external consumers of
`cadence://` resources meet freshly-changed verdict semantics that have never been
observed on ordinary phases.

Let the criteria fix land, run a few normal phases against it, then open MCP as
v1.58 with the substrate settled. §7 leaves the MCP arc explicitly staged, not dropped.

---

## 1. Mission

v1.56 made verifier *identity* honest — you can now tell mock from real, configured
from fallback, and see conduction drift as a trend.

v1.57 addresses the next layer down: **a criterion the verifier structurally cannot
observe currently fails, and the only way past it is `--force`.**

Phase 272 — the release-critical phase of v1.56 — settled with a severity `error`
bypass over three failing verdicts. Read carefully, two of those three were not
sloppiness. They were a shape mismatch between how the acceptance criteria were
written and what `deep-verify` is architecturally able to see. The predecessor
handoff (mine) wrote them that way. The verifier was correct to fail them, the
operator was correct to force past them, and **both being correct at once is the
defect.**

`rec-20260811-008` names it exactly. This release closes it.

---

## 2. Measured context — verify before designing anything

All figures measured against `main` @ HEAD `2026-08-12T01:39Z`. **Re-run each command
before relying on it.** If a value has moved, yours is correct and this document is
stale — record yours and say so.

### The root cause, in source

`packages/core/src/gates/deep-verify.ts`, lines 62–65, assembles the verifier payload:

```ts
    acs,                        // line 62 — AC id + text from the DRAFT
    tests,                      // line 63 — coverage map: AC id -> test refs
    diff: cap.diff,             // line 64 — capped working diff
    files: [...ctx.touchedFiles], // line 65 — touched file paths
```

That is the entire observable surface. **`deep-verify` cannot see `SUMMARY.md` prose,
`PROGRESS.json` notes, or any command's stdout.** An acceptance criterion whose
satisfaction condition is "the verbatim output is pasted into the SUMMARY" is
therefore unverifiable *by construction* — not unverified, unverifiable. It will fail
100% of the time regardless of whether the work was done correctly.

Confirm before designing:

```bash
sed -n '55,70p' packages/core/src/gates/deep-verify.ts
```

### CMD-A — the phase 272 evidence

```bash
node -e "
const j=require('./.cadence/phases/272-assurance-record-correctness/272-01-SUMMARY.json');
console.log('gateBypasses:'); for (const b of j.gateBypasses||[]) console.log('  ['+b.severity+']', b.gate, '->', b.reason);
console.log('deepVerify:'); for (const [k,v] of Object.entries(j.deepVerify||{})) console.log('  '+k, v.pass?'PASS':'FAIL', '--', v.reason);
"
```

Measured — the three failures, with the verifier's own stated reasons:

| AC | Verdict | Verifier's reason | Class |
|---|---|---|---|
| AC-1 | FAIL | SUMMARY states RED was captured but pastes neither verbatim pre-fix nor post-fix output | **unobservable by shape** |
| AC-4 | FAIL | Test runs `verify-all`, but SUMMARY has a paraphrased count, not the verbatim tail | **unobservable by shape** |
| AC-7 | FAIL (`auto: no linked tasks`) | Settle-time property; no task can produce it | **unanchorable by shape** |

AC-1 and AC-4 were in fact satisfied — `acResults` records both as `PASS (executed)`,
and the underlying work was correct. AC-7's condition was also satisfied: the same
SUMMARY records `code-review: ran, provider=host-cli, providerSelection=configured`.

**Three correct outcomes, three failed verdicts, one `--force`.** That is the defect.

### CMD-B — how widespread is the pattern

```bash
node -e "
const fs=require('fs'),p=require('path');const root='.cadence/phases';
const rx=/verbatim|pasted into the SUMMARY|paste the|stdout|command output/i;
let tot=0,hit=0,phases=new Set();
for(const d of fs.readdirSync(root)){const dir=p.join(root,d);if(!fs.statSync(dir).isDirectory())continue;
for(const f of fs.readdirSync(dir)){if(!f.endsWith('-DRAFT.md'))continue;
const t=fs.readFileSync(p.join(dir,f),'utf8');
for(const m of t.matchAll(/^### (AC-\d+)[:\s]([^\n]*)\n([\s\S]*?)(?=\n### |\n## |$)/gm)){
tot++; if(rx.test(m[2]+m[3])){hit++;phases.add(d);} }}}
console.log('total ACs across corpus: %d | command-output-shaped: %d (%s%%) | phases affected: %d',
 tot,hit,(hit/tot*100).toFixed(1),phases.size);
"
```

Run this. It sizes the blast radius and is the baseline for AC-3 below. **Do not
predict the figure — measure it and record it in the DRAFT.**

### CMD-C — force-settle history

```bash
node -e "
const fs=require('fs'),p=require('path');const root='.cadence/phases';let rows=[];
for(const d of fs.readdirSync(root)){const dir=p.join(root,d);if(!fs.statSync(dir).isDirectory())continue;
for(const f of fs.readdirSync(dir)){if(!f.endsWith('-SUMMARY.json'))continue;
try{const j=JSON.parse(fs.readFileSync(p.join(dir,f),'utf8'));
for(const b of j.gateBypasses||[]) if(b.gate==='settle'||b.severity==='error') rows.push([j.completedAt||'',d,b.severity,b.reason]);}catch(e){}}}
rows.sort();console.log('error-severity / settle bypasses: %d',rows.length);
rows.forEach(r=>console.log(' ',r[0].slice(0,19),r[1].slice(0,40),'['+r[2]+']',r[3].slice(0,90)));
"
```

Measured at time of writing: phase 272 is the only `error`-severity bypass in 285
settles. **This is a first, not a habit** — which is exactly why it's worth fixing now
rather than after it becomes one.

### CMD-D — evidence ladder and current AC verdict surface

```bash
grep -n "AcEvidenceZ" -A 2 packages/types/src/summary.ts
grep -n "^export function deriveAcEvidence" -A 12 packages/core/src/gates/ac-evidence.ts
```

Ladder: `ai-verified > executed > assertion > mention > unverified`
(`packages/types/src/summary.ts:176`, derivation in `gates/ac-evidence.ts:15`).

Note that `unverified` currently conflates two very different states: "we looked and
found nothing" and "there is nothing here that could be looked at." D-G decides
whether that distinction becomes explicit.

---

## 3. Decisions to record before implementation

### D-G — How should an unobservable criterion be classified?

**This is the load-bearing decision of the release. Surface it; do not resolve it silently.**

Three options:

1. **Refuse at DRAFT time.** A new structural check rejects command-output-shaped ACs
   before work starts, with a message naming the observable alternative. Strongest —
   the defect never reaches settle. Costs: a new refusal path (which v1.56 deliberately
   avoided adding anywhere), and it will reject ACs in existing DRAFT templates.
2. **New verdict class at settle.** `deep-verify` returns a third state alongside
   `pass`/`fail` — e.g. `unobservable` — carrying the reason and the anchor tier. Does
   not refuse; makes the distinction visible in `SUMMARY.json` and stops the verdict
   from being a false `fail`. Costs: touches `deepVerify` persistence shape.
3. **Both, staged.** Option 2 this release; option 1 filed for v1.58 once the corpus
   shows how often option 2 fires.

**My recommendation is option 3, leading with option 2.** Option 1 alone risks
rejecting legitimate criteria before you know the real distribution — and CMD-B's
figure is the evidence that should drive that call, not an estimate. Option 2 makes
the population measurable first.

Whichever is chosen: **`unobservable` must never roll up as `pass`.** A criterion
nobody can check is not a criterion that passed. It should render distinctly, and
`assurance.overall` must not be allowed to reach `strong` on its back.

### D-H — Does an unobservable AC still count against the evidence floor?

Follows from D-G. If `unobservable` is a new class, decide where it sits relative to
`unverified` on the ladder in `gates/ac-evidence.ts`. Two defensible answers:

- **Peer to `unverified`**, weakest rung — preserves the existing floor semantics unchanged.
- **Off-ladder**, orthogonal, like `indeterminate` is to `DoctorSeverity` (`dec-20260810-005`) —
  precedent exists in this codebase and is one release old.

The `indeterminate` precedent is the closer analogy and I'd lean there, but this is
yours to call. Record it either way.

### D-I — `security-audit` matrix reachability

`dec-20260811-001` deferred the DELTAS matrix change to v1.57. This is v1.57. The
decision is now due.

Current state, `packages/core/src/gates/engine.ts:28`:

| profile × tier | quick-fix | standard | complex |
|---|---|---|---|
| `strict` | — | `code-review` | `code-review`, **`security-audit`**, `plan-review` |
| `standard` *(repo default)* | — | — | `code-review`, `deep-verify` |
| `auto` | — | — | — |

One of nine cells. At `profile: standard` it is unreachable at every tier, and
`securityAudit.provider` is still `mock`. 0 of 285 settles have ever conducted one.

The matrix comment at `engine.ts:24` names `DESIGN.md §4.2` as the source of truth —
**any change here edits `DESIGN.md` first, then the table.**

---

## 4. Entry conditions

- **E1** — `main` clean and synced; `v1.56.0` tag present; npm shows `1.56.0` as `latest`.
- **E2** — One changeset pending (`resume-dangling-lasthandoff-warning.md`, phase 273).
  Confirm with `ls .changeset/*.md | grep -v README | wc -l`. It rides along in this release.
- **E3** — `cadence doctor` captured verbatim before any work; saved into Phase T's DRAFT.
- **E4** — CMD-B run and its figure recorded before Phase T is drafted. **This is a hard
  gate:** Phase T's design depends on the real distribution, not an assumed one.
- **E5** — `rec-20260811-008` and `rec-20260811-003` exist and are open. Do not re-file.

---

## 5. Ledger

No new recommendations need filing up front — the relevant ones exist:

| id | pri | state | role in this release |
|---|---|---|---|
| `rec-20260811-008` | medium | needs-decision | **Phase T's driver.** Promote once D-G lands. |
| `rec-20260811-001` | high | shipped-as-decision | D-I reopens for the matrix change |
| `rec-20260808-007` | high | blocked | Unblocked by `dec-20260811-002` for v1.57 — Phase V |
| `rec-20260811-003` | medium | needs-decision | Drift-counter chronic-warn; **Phase W, decision only** |
| `rec-20260811-007` | high | needs-decision | Windows `grep` finding — **already fixed in source**, close it |

**`rec-20260811-007` note:** the fix is live at
`packages/core/tests/docs/phase272-assurance-correctness.test.ts` — the test now carries
`it.skipIf(process.platform === 'win32')` with a comment crediting the phase 272 real
conduction. The recommendation is still `candidate`. Verify the fix, then transition it
to `shipped` with a `shippedRef`. Do not re-implement.

---

## 6. Phases in priority order

| # | Phase | Priority | Tier | Notes |
|---|---|---|---|---|
| T | Unobservable criteria: classification | **P0** | complex + override | The release |
| U | `security-audit` reachability (D-I) | **P1** | standard | Only if D-I chooses to change the matrix |
| V | deep-verify / per-task-verify provenance | **P2** | standard | `rec-20260808-007` |
| W | Ledger reconciliation + drift-counter decision | **P3** | standard | Decisions and closures only |
| X | v1.57.0 release | **P0** | standard | Last |

---

### Phase T — Unobservable criteria: classification

**Refs:** `rec-20260811-008`, D-G, D-H. Tier `complex` with a DRAFT-level profile
override per `dec-20260803-001` — this is substrate work and warrants real conduction.

**Tasks**

- **T.1** — Build a pure classifier that, given an AC's text and its resolved coverage
  refs, determines whether its satisfaction condition falls inside `deep-verify`'s
  observable surface (`{acs, tests, diff, files}`). Pure, dependency-injected, no I/O —
  matching the house split used across `verify/*` and `gates/*`.
  Natural home: a new module beside `verify/criteria-gap.ts`, which already does the
  adjacent *finding→anchor* direction. **Do not extend `criteria-gap.ts` itself** — that
  module anchors findings to criteria; this classifies criteria by observability. Different axis.
- **T.2** — Author the fixture corpus **first, proven red**, before T.3 wires anything.
  Corpus-before-code. Minimum cases: an observable AC backed by a test ref; a
  command-output-shaped AC ("paste the verbatim tail"); a settle-time property AC with
  no linkable task (the AC-7 shape); an AC observable only via the diff; and a
  boundary case that reads as prose-shaped but has a real test ref.
- **T.3** — Wire the classifier into `gates/deep-verify.ts` per D-G's chosen option.
  If option 2: extend the persisted `deepVerify` record with the new state and its
  reason. **Additive only** — no `schemaVersion` bump, no changes to existing field
  meanings, absent stays absent on historical records.
- **T.4** — Handle every consumer of the verdict explicitly, not via fallthrough
  default. `dec-20260810-005`'s `indeterminate` rollout is the template: it enumerated
  `DoctorReport.ok`, the `fail()` helper, `--fix`'s planner, the CLI/JSON renderer,
  `doctorNextStep`, and the MCP `doctorService` seam. Do the equivalent enumeration
  here and list it in the DRAFT before writing code.
- **T.5** — Apply D-H to `gates/ac-evidence.ts` (`deriveAcEvidence`, `rankEvidence`,
  `meetsEvidenceFloor`, `checkEvidenceFloor`). If off-ladder, prove the existing floor
  semantics are bit-identical for every historical record.
- **T.6** — Render the state in `SUMMARY.md` distinctly from both `pass` and `fail`,
  with the classifier's reason. An operator reading the summary should be able to tell
  "this wasn't checked because it can't be" from "this was checked and failed."

**Acceptance criteria**

Write these as **observable** criteria — this phase of all phases should not
reproduce the defect it fixes. Anchor each to a test file, not to SUMMARY prose.
Concretely: prefer *"test `X` asserts `Y`"* over *"the verbatim output of `Z` is pasted below."*
Where a command's output genuinely matters, have a test assert against the command's
result programmatically and anchor the AC to that test.

- **AC-1** — T.2's fixture corpus fails before T.3 and passes after; both states asserted
  by a committed test, not by pasted prose.
- **AC-2** — Replaying phase 272's three failing ACs through the classifier yields the
  new state for AC-1/AC-4/AC-7 and not `fail`. Assert programmatically against the
  committed `272-01-SUMMARY.json`; that record is now a regression fixture.
- **AC-3** — CMD-B's population figure is recorded, and a test asserts the classifier's
  count against the live corpus matches it within a declared tolerance.
- **AC-4** — Every historical `SUMMARY.json` still parses and content-hashes identically;
  `cadence summary verify-all` exits 0, asserted by a test.
- **AC-5** — D-G and D-H both exist as decision records, referenced by id in the DRAFT.
- **AC-6** — This phase's own `SUMMARY.json` records `code-review: status=ran,
  provider=host-cli, providerSelection=configured`. **Anchor this to a task**, unlike
  v1.56's AC-7 — e.g. a task whose deliverable is the override configuration itself —
  so it does not repeat the `auto: no linked tasks` failure.
- **AC-7** — `gateBypasses` is `null` on settle. **If this phase force-settles, the fix
  did not work.** Stop and report rather than forcing.

**Bar:** no new refusal path anywhere in the settle pipeline (carried forward from v1.56 O.5).
`unobservable` never rolls up as `pass`, and never lets `assurance.overall` reach `strong`.

---

### Phase U — `security-audit` reachability

**Conditional on D-I choosing to change the matrix.** If D-I reaffirms deferral, skip
this phase and record why.

- **U.1** — `DESIGN.md §4.2` first, then `engine.ts:28`'s `DELTAS`.
- **U.2** — Move `securityAudit.provider` off `mock` in `.cadence/config.json`, or record
  why it stays.
- **U.3** — Confirm phase 251's `conduction-reachability` check now reports the gate as
  reachable; assert in a test.
- **AC** — A settle at the newly-reachable cell records `security-audit: status=ran` with
  a non-`mock` provider. **This would be the first in the project's history** — capture
  it as a milestone, and expect it to surface real findings on first conduction.

---

### Phase V — deep-verify / per-task-verify provenance

`rec-20260808-007`, unblocked by `dec-20260811-002`.

Phase 263 deliberately excluded these from provenance persistence, reasoning that
including them would grow `verifierRollup` with real `host-cli` entries on ordinary
settles and push `assurance.overall` toward `strong` with no review gate having run.
**That rationale still holds and must be addressed head-on, not worked around.**

The likely shape: persist the identity but keep it out of the `verifierRollup` that
feeds `assurance.overall`, so provenance becomes visible without inflating assurance.
If that separation isn't cleanly expressible, defer again with a decision — do not
compromise the assurance semantics to close a provenance gap.

---

### Phase W — Ledger reconciliation and deferred decisions

Decisions and status transitions only. No source changes.

- **W.1** — Close `rec-20260811-007` (fix already live — verify, then transition with `shippedRef`).
- **W.2** — Decide `rec-20260811-003` (drift-counter chronic warn). Live inputs: tier
  distribution `{standard: 232, complex: 29, quick-fix: 20}` across 281 drafts (re-measure),
  threshold 3, current streak 1. Note that v1.57's own complex-tier phases shift this —
  **re-measure after Phase T settles, not before.**
- **W.3** — `mil-rec-rec-20260808-003` remains `proposed` with its recommendation shipped.
  `rec-20260811-004` documents the missing CLI path. Either build the path or reaffirm
  the documented-blocker posture; do not hand-edit `.cadence/intelligence/`.
- **W.4** — `rec-20260807-005` (`bare` is still the default coverage scheme and still
  ships the phase-239 AC-token collision bug). **Decision only, not implementation.**
  Flagging it here because the MCP arc in §7 widens the consumer base, and this is a
  "we fixed it for ourselves" asymmetry that gets more expensive with more consumers.

---

### Phase X — v1.57.0 release

Standard release pattern. `changeset:version` across the `fixed` lockstep group;
verify all five public packages land on `1.57.0` together with testkit still `ignore`d;
`Release` workflow with provenance; tag; `scripts/release-integrity.mjs`; confirm
`release-currency` and `roadmap-currency` both `ok` post-publish.

`conduction-drift-streak` at `ok` **or** at `warning` with the value recorded and W.2's
reasoning cited. A `warning` here is an honest outcome — do not suppress it, lower the
threshold, or force a complex phase solely to reset it.

---

## 7. Non-goals — and what's staged next

**Out of scope for v1.57:**

- The MCP surface arc — `rec-20260607-001` (Resources under `cadence://`), `-002` (tool
  parity), `-003` (Prompts), `-004` (`cadence mcp install`). **This is v1.58's headline.**
  All four are `ready-for-cadence-spec` and have been queued since June. They want the
  verdict semantics settled underneath them first.
- The observability cluster — `rec-20260607-005/006/007` (Phase 80/81/82 structured
  logger). Also spec-ready; the natural alternative to MCP for v1.58 if you'd rather
  strengthen the substrate than widen the surface.
- Implementing `rec-20260807-005` — W.4 records a decision only.
- The remaining kernel Phase 0 items (`rec-20260727-008/009/010`) — all `low`,
  `raw-idea`/`needs-evidence`. **The kernel arc is otherwise complete:** 8 shipped, 1
  rejected. Nothing there blocks anything.
- Any change to `conduction-drift-streak`'s threshold or severity ladder beyond W.2's decision.

---

## 8. Cross-cutting requirements

- **Write observable ACs.** Anchor every criterion to a committed test, a diff, or a
  touched file — something inside `{acs, tests, diff, files}`. Where a command's output
  matters, assert against it programmatically. This supersedes the predecessor
  handoff's §8 "paste verbatim into the SUMMARY" instruction, **which was the defect
  this release fixes.**
- **Verbatim output still belongs in the report-back and PROGRESS notes** — the
  measure-before-writing discipline is unchanged. What changes is that it must not be
  the *anchor* of an acceptance criterion, because the verifier cannot see it.
- **No predicted figures.** Every number derives from a command whose output is captured.
  If §2's measurements have moved, yours are correct and this document is stale.
- **Corpus-before-code.** T.2's fixtures are red before T.3 exists.
- **Additive only.** No `schemaVersion` bump; historical records reinterpreted by nobody.
- **No new refusal path** in the settle pipeline.
- **Do not force-settle.** If Phase T needs `--force`, that is a signal the fix is
  incomplete. Stop and report.

---

## 9. Report-back protocol

1. Verbatim `cadence doctor`, before and after.
2. CMD-A through CMD-D output, with anything that moved called out.
3. CMD-B's population figure and how it shaped D-G.
4. Which options were taken for D-G, D-H, D-I, with decision ids.
5. Phase T's `gateBypasses` value — the AC-7 bar.
6. Whether any AC in this release had to be rewritten mid-phase for observability, and its original shape.

---

## 10. Framing

v1.56 shipped the machinery that made this defect visible. The `error`-severity bypass
on phase 272 is the first in 285 settles, and the record captured it honestly, at full
severity, with the reasons intact — nothing was hidden, and the project filed
`rec-20260811-008` against itself without prompting.

That is the system working. But a gate that reliably fails correct work teaches
operators to reach for `--force`, and that is precisely how a bypass becomes a habit.
Fixing it now, while the count is one, is much cheaper than fixing it at twenty.

Then the substrate is settled and the expansion work has something solid to stand on.
