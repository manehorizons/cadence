# HANDOFF — CADENCE v1.58.0 Ledger Truth

**Author:** external audit peer (2026-08-14, pass 4)
**Target:** Claude Code, working session on `main`
**Predecessor:** `HANDOFF-v1.57-criteria-honesty.md` (T–X, shipped as 274–275)
**Baseline:** `v1.57.0`, published to npm 2026-08-13T23:42:58Z, all five public packages in lockstep, zero pending changesets.

---

## 0. Correction to the previous recommendation

**I told you v1.58 should be the MCP surface arc. That was wrong, and the reason it
was wrong is itself the subject of this release.**

I recommended it because `rec-20260607-001` through `-004` sit in the ledger as open,
`high`/`medium`, `ready-for-cadence-spec`. I read the ledger and believed it.

Then I checked the source tree:

| Recommendation | State in ledger | State in source |
|---|---|---|
| `rec-20260607-001` — MCP Resources under `cadence://` | open, **high** | `mcp/resources.ts`, 8 resources — **phase 75, settled 2026-06-07** |
| `rec-20260607-002` — tool parity (handoff, resume, rec add/promote, doctor) | open | all 5 present among 22 tools — **phase 76** |
| `rec-20260607-003` — MCP Prompts + guidance extraction | open | `mcp/prompts.ts` (4 prompts), `types/guidance.ts` (231 lines) — **phase 77** |
| `rec-20260607-004` — `cadence mcp install` | open | `mcp/install.ts`, `mergeMcpConfig` — **phase 78** |
| `rec-20260607-005` — structured logger foundation | open, **high** | `core/src/logging/{logger,format,resolve}.ts` — **phase 80** |
| `rec-20260607-006` — instrument three seams | open, **high** | instrumented at dispatcher, registry, mcp, three verifier clients — **phase 81** |
| `rec-20260607-007` — observability docs + **release v1.17.0** | open, **high** | v1.17.0 shipped 2026-06-07; you are on v1.57.0 |

Seven recommendations, four of them `high`, filed 2026-06-07. Phases 75–81 all settled
**the same day**. The release shipped. Nothing was ever transitioned.

They have been open for 67 days, and they have been steering prioritization the whole
time — including mine, one pass ago. The last one is titled "release v1.17.0." You are
forty minor versions past it.

**The expansion work you wanted to get back to is done.** The kernel arc closed in
v1.53 (8 shipped, 1 rejected, 3 low stragglers). The MCP arc closed in v1.17–v1.23.
The observability cluster closed alongside it. What's left isn't a build backlog —
it's a bookkeeping backlog that has been impersonating one.

---

## 1. Mission

The Praxis ledger is Cadence's own record of what is true about itself. It has drifted
from the repository it describes, in the same way `ROADMAP.md` drifted before phase 259
built `roadmap-currency` to catch it — **and for the same reason: no gate checks it.**

v1.58 does three things:

1. **Build the missing lifecycle path.** `rec-20260611-001` — filed 2026-06-11, still
   open — already names the root cause: the recommendation lifecycle has no terminal
   state for work that shipped out-of-band.
2. **Reconcile the corpus** against reality, with evidence per transition.
3. **Add the anti-recurrence gate**, so this is the last time it accumulates silently.

This is not cleanup for its own sake. Every prioritization decision made from this
ledger — yours, mine, and the tooling's — is currently being made from a record that
overstates open work by a material margin.

---

## 2. Measured context — verify before designing anything

Measured against `main` @ HEAD `2026-08-14T00:11Z`. **Re-run before relying on any of it.**

### CMD-A — open recommendation population by filing month

```bash
node -e "
const R=require('./.cadence/intelligence/recommendations.json');
const c={};for(const r of R.recommendations){const k=r.id.slice(4,10);c[k]=(c[k]||0)+1;}
for(const k of Object.keys(c).sort())console.log(' ',k.slice(0,4)+'-'+k.slice(4),c[k]);
console.log('open total:',R.recommendations.length,'| archived:',R.archived.length);
const old=R.recommendations.filter(r=>r.id<'rec-20260701');
console.log('open, filed before July:',old.length);
"
```

Measured: `2026-06: 21`, `2026-07: 35`, `2026-08: 44` — open 100, archived 148.
**21 open recommendations predate July.**

### CMD-B — triage worksheet: open pre-July recs with a name-matching settled phase

```bash
node -e "
const fs=require('fs');
const R=JSON.parse(fs.readFileSync('.cadence/intelligence/recommendations.json','utf8'));
const phases=fs.readdirSync('.cadence/phases').filter(d=>/^\d+-/.test(d));
const stop=new Set(['the','a','an','for','and','into','with','of','to','in','on','make','add','expose']);
for(const r of R.recommendations){
  if(r.id>='rec-20260701') continue;
  const key=((r.title||'').toLowerCase().match(/[a-z]{4,}/g)||[]).filter(w=>!stop.has(w));
  const hits=phases.filter(d=>key.filter(w=>d.toLowerCase().includes(w)).length>=2);
  if(hits.length) console.log(r.id,'['+r.priority+'] ->',hits.slice(0,3).join(', '));
}"
```

Measured: 13 of the 21 flagged. **This is a noisy heuristic, not a verdict** — it
matched `rec-20260607-001` (MCP Resources) to `12-rename-cadence` on shared tokens,
which is nonsense, while the true match is `75-mcp-resources`. Use it to order the
triage queue, never to drive a transition. Every closure in Phase Z needs evidence
a human or verifier can check.

### CMD-C — the two `high` conduction recs have no recorded evidence

```bash
node -e "
const R=require('./.cadence/intelligence/recommendations.json');
for(const r of R.recommendations) if(['rec-20260806-004','rec-20260813-002'].includes(r.id))
  console.log(r.id,'|',r.priority,'|',r.readiness,'| evidence:',JSON.stringify(r.evidence||null));
"
```

Measured: both `high`, both with **no evidence recorded** (`needs-decision` and
`needs-evidence` respectively).

I nearly built this release around `rec-20260806-004` ("real-provider gates silently
produce empty findings when touched files are already committed"). Before speccing it
I checked whether it had ever happened:

```bash
node -e "
const fs=require('fs'),p=require('path');const root='.cadence/phases';const c={};
for(const d of fs.readdirSync(root)){const dir=p.join(root,d);if(!fs.statSync(dir).isDirectory())continue;
for(const f of fs.readdirSync(dir)){if(!f.endsWith('-SUMMARY.json'))continue;
try{const j=JSON.parse(fs.readFileSync(p.join(dir,f),'utf8'));
for(const g of j.gates||[]) if(g.providerSelection) c[g.providerSelection]=(c[g.providerSelection]||0)+1;
}catch(e){}}}
console.log('providerSelection distribution:',JSON.stringify(c));"
```

Measured: `{"configured":3,"fallback":1}` — **`empty-diff` has fired zero times.**
Phase 263 already built the marker for exactly this failure mode, and it has never
triggered. My working hypothesis (that phase 267's zero findings were an empty-diff
artifact) is **disproven**: 267's diff was 73,689 bytes across 20 files. It was a real
review of real work that found nothing.

Real conduction is in fact producing findings — 3 of 5 conductions did:

| Phase | Finding |
|---|---|
| 256 | MEDIUM — runbook's "stop and report" path skips a step, leaving `securityAudit` misconfigured |
| 272 | HIGH — `grep` not guaranteed on Windows PATH; test throws ENOENT |
| 274 | MEDIUM — exported mutable gate tables can be mutated by any importer |

`rec-20260806-004` is a plausible hypothesis with zero corpus support and a working
detector already in place. **It does not warrant a build phase.** Phase AA treats both
recs as evidence questions, which is what their readiness states already say.

### CMD-D — standing health

```bash
node -e "
const fs=require('fs');const rx=(t,r)=>[...t.matchAll(r)].map(m=>+m[1]);
const disk=Math.max(...fs.readdirSync('.cadence/phases').map(d=>parseInt(d)).filter(Number.isFinite));
const r=Math.max(...rx(fs.readFileSync('.cadence/ROADMAP.md','utf8'),/^### Phase (\d+)/gm));
const m=Math.max(...rx(fs.readFileSync('.cadence/MILESTONES.md','utf8'),/^[ \t]*-[ \t]+\*\*Phase (\d+)/gm));
console.log('roadmap drift:',disk-Math.min(r,m),'(threshold 10)');"
```

Measured: drift 5 — OK. Force-settles: still 1 of 287. Conduction streak: 1.
**Phase-level record currency is healthy. Recommendation-level currency is not, and
nothing measures it.** That asymmetry is the whole point of this release.

---

## 3. Decisions to record before implementation

### D-J — What is the terminal state for out-of-band shipped work?

`rec-20260611-001` (open since 2026-06-11) names the gap. `dec-20260813-004` (W.3,
last release) confirmed it live: `cadence milestone close` refuses a milestone in
`proposed`, and no CLI path exists for a recommendation that shipped without going
through `accept → export → build`.

The normal path assumes work flows through the ledger. Phases 75–81 flowed the other
way: recommendation filed as a *plan*, phase built from the plan directly, release cut,
recommendation orphaned. That is a legitimate and probably common workflow — the ledger
just has no vocabulary for its ending.

Options:

1. **New terminal status** (e.g. `shipped-out-of-band`) distinct from `shipped`,
   preserving the distinction between "shipped through the ledger" and "shipped around it."
2. **Reuse `shipped`** with a required `shippedRef` naming the phase, no new status.
   Simpler; loses the provenance distinction.
3. **New CLI verb** (`cadence recommendation reconcile <id> --phase <n> --evidence <...>`)
   that lands option 2's shape but forces the evidence at the point of transition.

I lean option 3 — it makes the evidence non-optional, which is what keeps this
reconciliation from becoming a bulk status-flip that trades one kind of untruth for
another. But this is yours; `rec-20260611-001` is the anchor and its own framing should
carry weight over mine.

### D-K — Should there be a `recommendation-currency` doctor check?

Direct analogue to phase 259's `roadmap-currency` and phase 262's `release-currency`.
The house pattern is established twice over.

The hard part is what it measures. Unlike phase numbers, a recommendation's staleness
isn't computable from a max() — there's no ground truth to diff against. Candidate
signals, in rough order of how defensible they are:

- Age of the oldest open recommendation, against a threshold.
- Count of open recommendations older than N days at `high`+ priority.
- Open recs whose `readiness` is `ready-for-cadence-spec` and whose filing predates the
  most recent release by more than one minor version.

**Warning-only, never failing.** And it must not create pressure to close things to
get a green check — that would be strictly worse than the drift. If a defensible
signal can't be found, **record that finding and build nothing.** A check that
measures the wrong thing here is worse than no check.

### D-L — Priority integrity after reconciliation

Four of seven stale items are `high`. Once they close, the `high` open count drops
from 14 to roughly 10, and the remaining ones become the real queue. Decide whether
the surviving `high` items still merit that priority, or whether some were rated
against a backlog that no longer exists.

---

## 4. Entry conditions

- **E1** — `main` clean; `v1.57.0` tag present; npm shows `1.57.0` as `latest`; zero pending changesets.
- **E2** — `cadence doctor` captured verbatim before any work, into Phase Y's DRAFT.
- **E3** — CMD-A and CMD-B run, output recorded, **before** Phase Y is drafted.
- **E4** — `rec-20260611-001` confirmed open. It is this release's anchor; do not re-file it.
- **E5** — Confirm the phase↔rec mapping in §0 independently. I derived it from source
  inspection and settle dates, not from the ledger. **If any row is wrong, that row does
  not get reconciled** — record the discrepancy instead.

---

## 5. Phases in priority order

| # | Phase | Priority | Tier | Notes |
|---|---|---|---|---|
| Y | Recommendation lifecycle: terminal path | **P0** | complex + override | `rec-20260611-001`, D-J |
| Z | Corpus reconciliation | **P0** | standard | Evidence-gated, per-item |
| AA | Conduction evidence questions | **P2** | standard | `rec-20260806-004`, `rec-20260813-002` |
| AB | `recommendation-currency` check | **P2** | standard | D-K; may correctly build nothing |
| AC | v1.58.0 release | **P0** | standard | Last |

---

### Phase Y — Recommendation lifecycle: terminal path

**Refs:** `rec-20260611-001`, D-J. Tier `complex` with a DRAFT-level profile override
per `dec-20260803-001` — this changes ledger write paths and warrants real conduction.

**Tasks**

- **Y.1** — Implement D-J's chosen shape in the recommendation lifecycle. If option 3,
  the new verb requires both a phase reference and an evidence string; neither is optional.
- **Y.2** — Extend the milestone side to match. `mil-rec-rec-20260808-003` has been
  `proposed` with a shipped recommendation since v1.56 and is the standing test case —
  it should close through the new path without hand-editing JSON.
- **Y.3** — Verify the transition is idempotent and that re-running against an
  already-reconciled recommendation is a no-op, not a duplicate write.

**Acceptance criteria** — anchor every one to a committed test, a diff, or a touched
file. Nothing anchored to SUMMARY prose (v1.57's lesson; `dec-20260812-001`).

- **AC-1** — A recommendation shipped out-of-band transitions to a terminal state
  carrying its phase reference and evidence; asserted by test.
- **AC-2** — `mil-rec-rec-20260808-003` closes through the new path; asserted against
  the live ledger by test, with no hand-edit to `.cadence/intelligence/`.
- **AC-3** — Transition is idempotent; asserted by test.
- **AC-4** — Ledger file mode (`0o600`) and id-minting invariants preserved; asserted by test.
- **AC-5** — D-J recorded as a decision, referenced by id in the DRAFT.
- **AC-6** — This phase's `SUMMARY.json` records `code-review: ran, provider=host-cli,
  providerSelection=configured`, **anchored to a task** (v1.56's AC-7 failure mode).
- **AC-7** — `gateBypasses` is `null`. If this phase force-settles, stop and report.

---

### Phase Z — Corpus reconciliation

**Every transition needs evidence. No bulk flips.**

- **Z.1** — Reconcile the seven §0 items, each with the phase directory, its
  `completedAt`, and the source path that satisfies it. Verify each independently first
  (E5) — `rec-20260607-007` in particular names "observability docs + release v1.17.0",
  and **there is no `82-` phase directory**, so the docs half may be genuinely open.
  If so, split it: reconcile what shipped, re-file what didn't.
- **Z.2** — Triage the remaining 14 pre-July open recs using CMD-B's worksheet as an
  ordering, not a verdict. Several look likely-shipped on inspection —
  `rec-20260604-001` (expose Cadence as an MCP server surface), `rec-20260604-003`
  (`cadence doctor`), `rec-20260604-004` (recommendation promotion CLI),
  `rec-20260605-003` (`cadence explain`) — but **each needs its own evidence**, and
  some will legitimately still be open.
- **Z.3** — For each item that is *not* shipped, confirm its priority and readiness
  still reflect reality, then leave it open. **Closing something because it's old is
  the failure mode this phase exists to prevent.**
- **Z.4** — Record the before/after open count and the `high` count, with the
  transitions itemized.

**Acceptance criteria**

- **AC-1** — Every transition carries a phase ref and evidence; asserted by a test that
  walks the reconciled records and fails on any terminal-state record missing either.
- **AC-2** — Before/after counts recorded, derived from CMD-A re-run.
- **AC-3** — No recommendation transitioned without evidence — same test as AC-1,
  stated as a corpus-wide invariant.
- **AC-4** — Any item found *not* shipped is explicitly listed as remaining open with
  its reason.

**Bar:** no hand-edits to `.cadence/intelligence/`. Everything goes through Phase Y's
path. If the path can't express a case, that's a Phase Y defect — go back, don't reach
for an editor.

---

### Phase AA — Conduction evidence questions

**Not a build phase.** Both recs are `needs-evidence`/`needs-decision` with no evidence
recorded, and CMD-C shows the corpus does not currently support either.

- **AA.1** — `rec-20260806-004`: record CMD-C's finding as evidence — `empty-diff` has
  fired 0 times across 287 settles, and phase 263's detector already covers the case.
  Then either downgrade from `high`, or record what evidence *would* change the picture.
- **AA.2** — `rec-20260813-002`: the concern is that `deep-verify`'s new
  `observedProvider` (phase 275) carries no selection field, so a configured `mock`
  and a silent fallback-to-`mock` look identical there — even though `code-review`
  distinguishes them via `providerSelection`. Confirm against the live corpus, record
  the evidence, and decide whether to extend `observedProvider` with a selection field
  or accept the asymmetry.
- **AA.3** — Record the finding that real conduction produced findings on 3 of 5
  conductions (256, 272, 274), with the corrected count and its derivation. This is a
  positive signal about verifier value and it currently exists nowhere in the ledger.

---

### Phase AB — `recommendation-currency` doctor check

**Conditional on D-K finding a defensible signal.** If it doesn't, record that and skip —
`dec-20260813-002`'s handling of the skipped Phase U is the precedent for how to close
out a conditional phase honestly.

If built: warning-only, never fails the exit code, follows the
`roadmap-currency`/`release-currency` house pattern, and handles the `indeterminate`
severity rung explicitly (`dec-20260810-005`).

---

### Phase AC — v1.58.0 release

Standard pattern. `changeset:version` across the `fixed` lockstep group; all five public
packages to `1.58.0` with testkit still `ignore`d; `Release` workflow with provenance;
tag; `scripts/release-integrity.mjs`; `release-currency` and `roadmap-currency` both `ok`.

`conduction-drift-streak` at `ok`, **or** `warning` with the value recorded — do not
suppress it or run a complex phase solely to reset it.

---

## 6. Non-goals

- **The MCP surface arc.** It shipped in v1.17–v1.23. Phase Z closes the paperwork.
- **The observability cluster.** Phases 80–81 shipped 2026-06-07; only the phase-82
  docs half may remain, and Z.1 determines that.
- **Building anything for `rec-20260806-004`.** Evidence first (AA.1).
- **The kernel Phase 0 stragglers** (`rec-20260727-008/009/010`) — all `low`,
  `raw-idea`/`needs-evidence`. The kernel arc is complete.
- **`security-audit` reachability** — reaffirmed deferred twice (`dec-20260811-001`,
  `dec-20260812-003`). Leave it.
- **Closing anything to make a number look better.** If the reconciled open count barely
  moves because most items are genuinely open, that is a successful outcome.

---

## 7. Cross-cutting requirements

- **Evidence per transition.** Every closure names a phase and a checkable artifact.
  This release is about making the ledger true; a bulk flip would make it differently untrue.
- **Write observable ACs.** Anchor to committed tests, diffs, or touched files —
  never to SUMMARY prose (`dec-20260812-001`).
- **No predicted figures.** If §2's measurements have moved, yours are correct and this
  document is stale — say so.
- **No hand-edits to `.cadence/intelligence/`.**
- **Additive only.** No `schemaVersion` bump; historical records reinterpreted by nobody.
- **Do not force-settle.** If a phase needs `--force`, stop and report.

---

## 8. Report-back protocol

1. Verbatim `cadence doctor`, before and after.
2. CMD-A through CMD-D, with anything that moved called out.
3. Open/`high` counts before and after Phase Z, with every transition itemized by
   rec id, phase ref, and evidence.
4. Which options were taken for D-J, D-K, D-L, with decision ids.
5. Any §0 row that failed independent verification (E5).
6. Phase Y's `gateBypasses` value.
7. Whether Phase AB built a check or correctly declined to.

---

## 9. Framing

Cadence's thesis is that deterministic gates beat conversational shaping because shaping
drifts. This release is that thesis pointed at the project's own ledger.

`ROADMAP.md` drifted 113 phases once, and the answer was a gate. It drifted again to 37,
and the gate caught it at 37 instead of 113 — that gate working is why phase-level
currency reads 5 today. The recommendation ledger has been drifting the whole time with
no gate on it at all, and the cost has been real: it sent me, one pass ago, to recommend
building something that had already been built for two months.

The good news is the part worth saying plainly. **You have not been carrying a backlog
of unfinished expansion work.** You finished it. The record just never said so.
