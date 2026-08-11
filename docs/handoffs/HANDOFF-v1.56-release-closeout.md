# HANDOFF — CADENCE v1.56.0 Release Closeout

**Author:** external audit peer (2026-08-10, pass 2)
**Target:** Claude Code, working session on `main`
**Predecessor:** `docs/handoffs/HANDOFF-v1.56-verifier-honesty.md` (Phases L–P, all landed)
**Scope:** close the four remaining pre-release items and cut `v1.56.0`. No new feature work.

---

## 1. Mission

Phases L–P are done. Phase 268 landed Phase O at 2026-08-10T20:34Z, and v1.56 is
feature-complete with 8 changesets staged.

What remains is not features. It is the unglamorous column: a stale public record,
one stray byte, one undecided gate, and one desynced milestone. Each is small. All
four are things an external reader would find, and three of them are in surfaces
this project has explicitly claimed to keep honest.

**Close them, then cut the release.** Do not add scope.

---

## 2. Measured context — verify before designing anything

Every figure below was measured against `main` @ HEAD `2026-08-10T22:05Z`.
**Re-run each command before relying on it.** If a number has moved, the number in
this document is stale and yours is correct — record yours in the DRAFT and say so.

### CMD-1 — roadmap currency drift

```bash
node -e "
const fs=require('fs');
const rx=(t,r)=>[...t.matchAll(r)].map(m=>+m[1]);
const disk=Math.max(...fs.readdirSync('.cadence/phases').map(d=>parseInt(d)).filter(Number.isFinite));
const r=Math.max(...rx(fs.readFileSync('.cadence/ROADMAP.md','utf8'),/^### Phase (\d+)/gm));
const m=Math.max(...rx(fs.readFileSync('.cadence/MILESTONES.md','utf8'),/^[ \t]*-[ \t]+\*\*Phase (\d+)/gm));
console.log('disk=%d roadmap=%d milestones=%d includedMin=%d drift=%d threshold=10',disk,r,m,Math.min(r,m),disk-Math.min(r,m));
"
```

Measured: `disk=268 roadmap=256 milestones=230 includedMin=230 drift=38 threshold=10`
→ **exceeds `ROADMAP_DRIFT_WARN_THRESHOLD` (`packages/core/src/doctor/run.ts:1289`); `roadmap-currency` is currently `warning` on this repo.**

Regexes are the check's own, from `doctor/run.ts:1355` and `:1371`.

### CMD-2 — NUL byte in `assurance-record.ts`

```bash
node -e "
const b=require('fs').readFileSync('packages/core/src/gates/assurance-record.ts');
const i=b.indexOf(0);
console.log('NUL count=%d firstOffset=%d line=%d size=%d', b.filter(x=>x===0).length, i, b.subarray(0,i).toString('utf8').split('\n').length, b.length);
"
```

Measured: `NUL count=1 firstOffset=4866 line=87 size=6651`
→ `file(1)` reports `data`, not text. `grep` reports `binary file matches` and
suppresses every line in this file.

### CMD-3 — conduction drift streak

```bash
node -e "
const fs=require('fs'),p=require('path');const root='.cadence/phases';let rows=[];
for(const d of fs.readdirSync(root)){const dir=p.join(root,d);if(!fs.statSync(dir).isDirectory())continue;
for(const f of fs.readdirSync(dir)){if(!f.endsWith('-SUMMARY.json'))continue;
try{const j=JSON.parse(fs.readFileSync(p.join(dir,f),'utf8'));
const rl=(j.assurance&&j.assurance.verifierRollup)||[];
rows.push([j.completedAt||'',d,rl.some(x=>x.provider&&x.provider!=='mock')]);}catch(e){}}}
rows.sort((a,b)=>a[0]<b[0]?-1:1);
let s=0;for(let i=rows.length-1;i>=0;i--){if(rows[i][2])break;s++;}
console.log('records=%d real=%d streak=%d',rows.length,rows.filter(r=>r[2]).length,s);
"
```

Measured: `records=281 real=3 streak=1` (threshold 3).

### CMD-4 — tier distribution

```bash
node -e "
const fs=require('fs'),p=require('path');const root='.cadence/phases';const c={};
for(const d of fs.readdirSync(root)){const dir=p.join(root,d);if(!fs.statSync(dir).isDirectory())continue;
for(const f of fs.readdirSync(dir)){if(!f.endsWith('-DRAFT.md'))continue;
const m=fs.readFileSync(p.join(dir,f),'utf8').slice(0,2500).match(/^[ \t]*tier:[ \t]*([A-Za-z-]+)/mi);
const k=m?m[1].toLowerCase():'none';c[k]=(c[k]||0)+1;}}
console.log(JSON.stringify(c));"
```

Measured: `{"complex":29,"standard":232,"quick-fix":20}` — standard tier is **82.6%** of 281 drafts.

### CMD-5 — milestone / recommendation status desync

```bash
node -e "
const fs=require('fs');
const R=JSON.parse(fs.readFileSync('.cadence/intelligence/recommendations.json','utf8'));
const M=JSON.parse(fs.readFileSync('.cadence/intelligence/milestones.json','utf8'));
const byId=Object.fromEntries([...(R.recommendations||[]),...(R.archived||[])].map(r=>[r.id,r]));
const ms=Array.isArray(M)?M:(M.milestones||[]);let hits=[];
for(const m of ms){const recs=m.recommendations||m.recommendationIds||[];if(!recs.length)continue;
if(recs.every(id=>byId[id]&&byId[id].status==='shipped')&&!['closed','shipped','exported'].includes(m.status))hits.push([m.id,m.status,recs.join(',')]);}
console.log('milestones total=%d desynced=%d',ms.length,hits.length);hits.forEach(h=>console.log('  ',h.join(' | ')));"
```

Measured: `milestones total=33 desynced=1` → `mil-rec-rec-20260808-003 | proposed | rec-20260808-003`
(the recommendation is `shipped` with `shippedRef: "268-conduction-drift-counter (268-01)"`).

### CMD-6 — staged changesets

```bash
ls .changeset/*.md | grep -v README | wc -l
```

Measured: `8`.

### Structural finding — `security-audit` gate reachability

`packages/core/src/gates/engine.ts:28`, `DELTAS: Record<Profile, Record<Tier, Gate[]>>`:

| profile × tier | quick-fix | standard | complex |
|---|---|---|---|
| `strict` | — | `code-review` | `code-review`, **`security-audit`**, `plan-review` |
| `standard` *(repo default)* | — | — | `code-review`, `deep-verify` |
| `auto` | — | — | — |

`security-audit` occupies **one of nine cells**. At `profile: standard` it is
unreachable at every tier. `.cadence/config.json` additionally sets
`securityAudit.provider: "mock"`. Corpus-wide, 0 of 281 settles carry a real
security-audit conduction. Verify with CMD-3's loop filtered to the
`security-audit` gate entry before treating this as fact.

---

## 3. Decisions to record before implementation

### D-E — `security-audit` reachability through v1.56

**This is an operator decision, not an implementation choice. Surface it; do not resolve it unilaterally.**

Three defensible options:

1. **Leave as-is, record why.** `security-audit` stays unreachable through v1.56;
   `dec-…` states the reason and the revisit trigger. Ship-no-code.
2. **Add `security-audit` to `standard × complex`.** Matrix change in `engine.ts`;
   requires `securityAudit.provider` off `mock` to mean anything, and a gate-matrix
   change touches `DESIGN.md §4.2`, which the DELTAS comment names as the source of truth.
3. **Move the repo to `profile: strict` for complex-tier work only,** via DRAFT-level
   override per `dec-20260803-001`, leaving the baseline alone.

The one option unavailable is silence. A project that ships a `security-success`
branch-protection job (phase 255), a `SECURITY.md`, and a `conduction-reachability`
check, while its own security review gate has never once run, should have that on
the record as a choice.

**Note:** option 2 is a behavior change to the gate matrix. If chosen, it is
**out of scope for v1.56** — file it for v1.57 and take option 1 for this release.

### D-F — Conduction on the release-critical phases

CMD-3 measures `streak=1`, threshold 3. Phases Q and R below are ordinary work;
if both settle at `standard` tier, the streak reaches 3 and
`conduction-drift-streak` will render `warning` at exactly the moment you run
`cadence doctor` before publishing.

**Recommendation:** run **Phase R at `complex` tier with a DRAFT-level profile
override**, per `dec-20260803-001`'s operator-initiated conduction convention.
This does two things at once — it puts a real `host-cli` reviewer on the last code
change before publish, and it resets the streak so the release-time doctor run is
clean for a real reason rather than a suppressed one.

Do not suppress, bypass, or lower the threshold to get a green doctor. If the
warning fires, it is correct.

---

## 4. Entry conditions

Verify each; do not assume.

- **E1** — `main` is synced and clean; the interrupted-session drift noted in
  `.cadence/handoff/SESSION-2026-08-10-resume-interrupted-main-drift-pending.md` is resolved.
- **E2** — Phases 261–268 all present under `.cadence/phases/` with a `SUMMARY.json` each.
- **E3** — CMD-6 reports 8 staged changesets, all under the `fixed` lockstep group
  in `.changeset/config.json`.
- **E4** — `cadence doctor` run captured **before** any work in this handoff, output
  saved verbatim into Phase Q's DRAFT. This is the before-image for §8's report-back.
- **E5** — §5 ledger entries filed under one scout ID before any phase DRAFT is written.

---

## 5. Ledger — file these first

**File before drafting any phase.** Per the file-never-apply rule, work that lives
only in handoff prose gets skipped; these must exist as ledger rows that the phases
below reference by id.

Use one scout ID for the batch. Check for existing duplicates first
(`cadence recommendation list --area core/gates`) — do not overwrite an existing scout ID.

```bash
cadence recommendation add --scout-id scout-20260810-audit2 --priority high \
  --readiness needs-decision --area core/gates --file packages/core/src/gates/engine.ts \
  --title "security-audit is reachable in only 1 of 9 profile x tier DELTAS cells" \
  --evidence "engine.ts:28 DELTAS: security-audit appears only under strict x complex; repo profile is standard, making it structurally unreachable at every tier; securityAudit.provider is additionally 'mock'; 0 of 281 SUMMARY records carry a real security-audit conduction"

cadence recommendation add --scout-id scout-20260810-audit2 --priority medium \
  --readiness ready-for-cadence-spec --area core/gates --file packages/core/src/gates/assurance-record.ts \
  --title "Raw NUL byte in assurance-record.ts makes the file grep-classify as binary" \
  --evidence "file(1) reports 'data'; one 0x00 at offset 4866 (line 87) used as a Map key delimiter in a template literal; no \\0 or \\u0000 escape convention elsewhere in packages/core/src; grep suppresses all matches in this file; unchanged across both 2026-08-10 audit passes"

cadence recommendation add --scout-id scout-20260810-audit2 --priority medium \
  --readiness needs-decision --area core/doctor --file packages/core/src/doctor/run.ts \
  --title "conduction-drift-streak will chronically warn: ~90% of phases cannot reset it by construction" \
  --evidence "tier distribution across 281 drafts: standard 232 (82.6%), complex 29 (10.3%), quick-fix 20 (7.1%); under profile=standard only complex tier includes code-review, so only ~10% of phases can reset the streak; threshold is 3; dec-20260803-001 designates conduction as deliberately operator-initiated, so the check flags as drift what a standing decision designates as policy"
```

The third is **v1.57 input, not v1.56 work.** It is the natural companion to
`dec-20260810-004`'s deferred O.3 measurement and `rec-20260806-008`. File it; do
not act on it in this release.

---

## 6. Phases in priority order

| # | Phase | Priority | Tier | Notes |
|---|---|---|---|---|
| Q | Pre-release record integrity | **P0** | standard | Blocks release |
| R | `assurance-record.ts` correctness pass | **P0** | complex (see D-F) | Blocks release |
| S | v1.56.0 release | **P0** | standard | Last |

---

### Phase Q — Pre-release record integrity

**Refs:** CMD-1, CMD-5. Closes the `roadmap-currency` warning and the single milestone desync.

**Tasks**

- **Q.1** — Update `.cadence/ROADMAP.md` with `### Phase N` entries for phases 257–268.
  Prose only; roadmap prose is never auto-generated (`doctor/run.ts:1391`). Each entry
  states what landed, not what was planned.
- **Q.2** — Update `.cadence/MILESTONES.md` with `- **Phase N**` entries through 268.
  CMD-1 shows this file is the binding constraint at 230 — it is 38 behind, further
  behind than `ROADMAP.md`.
- **Q.3** — Reconcile `mil-rec-rec-20260808-003` (CMD-5). Its sole recommendation is
  `shipped` with a `shippedRef`; the milestone is still `proposed`. **If no CLI path
  exists to close it** — `rec-20260803-001` reports exactly this gap for `shippedRef`
  on shipped recs — do **not** hand-edit the JSON. Record the blocker, link it to
  `rec-20260803-001`, and leave the desync; a documented one-row desync is better than
  an undocumented hand-edit to a ledger with `mode: 0o600` and id-minting invariants.
- **Q.4** — Confirm `[Unreleased]` in `CHANGELOG.md` remains empty and the 8 changesets
  remain the staging surface. Do not hand-write release notes into `CHANGELOG.md`;
  `changeset:version` owns that at Phase S.

**Acceptance criteria — gate on verbatim command output**

- **AC-1** — CMD-1 re-run reports `drift` ≤ 10. Paste the full verbatim stdout into the SUMMARY.
- **AC-2** — `cadence doctor` reports `roadmap-currency` at `ok`. Paste the verbatim check line.
- **AC-3** — CMD-5 re-run reports `desynced=0`, **or** the DRAFT carries a recorded
  blocker naming `rec-20260803-001` and CMD-5's verbatim output showing `desynced=1`.
  Both outcomes pass; a silent skip does not.
- **AC-4** — CMD-6 still reports `8`.

**Bar:** no source file under `packages/*/src` is touched by this phase. If one is,
scope has leaked.

---

### Phase R — `assurance-record.ts` correctness pass

**Refs:** the NUL-byte rec from §5; `rec-20260808-007` (high, open); `rec-20260801-006` (open).
**Tier: complex, with a DRAFT-level profile override per D-F.**

**Tasks**

- **R.1** — Replace the literal NUL at `packages/core/src/gates/assurance-record.ts:87`
  with an escaped `\u0000` in the template literal. **The delimiter value does not
  change** — this is an encoding fix, not a behavior change. Add a one-line comment
  naming why a NUL is the delimiter (provider/model names cannot contain it).
- **R.2** — Add a regression guard: a test asserting no file under
  `packages/*/src/**/*.ts` contains a raw `0x00` byte. This is the anti-recurrence
  gate; without it R.1 is a one-time cleanup rather than a fixed class of defect.
- **R.3** — Resolve `rec-20260801-006`: the `deriveAssuranceRecord` docstring/code
  mismatch on the `weak` classification, plus its untested branch. Same file.
- **R.4** — Address `rec-20260808-007` **as a decision, not an implementation.**
  Phase 263's changeset deliberately excluded `deep-verify`/`per-task-verify` from
  provenance persistence, with a stated rationale about not inflating
  `assurance.overall`. That rationale still holds. Record a decision either
  reaffirming the exclusion for v1.56 or scheduling it for v1.57 — **do not implement
  it in this release.** It changes `verifierRollup` semantics and belongs behind its
  own phase.

**Acceptance criteria — gate on verbatim command output**

- **AC-1** — CMD-2 re-run reports `NUL count=0`. Paste verbatim stdout.
- **AC-2** — `grep -c "" packages/core/src/gates/assurance-record.ts` returns a line
  count rather than `binary file matches`. Paste verbatim.
- **AC-3** — R.2's regression test fails against the pre-fix file (prove it red first —
  corpus-before-code) and passes after. Paste both runs.
- **AC-4** — `contentHash` verification still passes corpus-wide:
  `cadence summary verify-all` exits 0. Paste verbatim tail.
- **AC-5** — Gate provenance in this phase's own `SUMMARY.json` records
  `code-review: status=ran, provider=host-cli, providerSelection=configured`.
  This is D-F's real-conduction bar. If it records `skipped` with
  `"not in the active tier × profile gate set"`, the profile override did not take —
  fix the override, do not proceed.

**Bar:** `AssuranceRecordZ` / `GateProvenanceZ` schema unchanged, no `schemaVersion`
bump, and every historical `SUMMARY.json` still parses and content-hashes identically.

---

### Phase S — v1.56.0 release

**Refs:** the standing release-phase pattern (phases 87, 90, 97, and the v1.55.0 cut).

**Tasks**

- **S.1** — `changeset:version` across the `fixed` lockstep group; confirm all five
  published packages land on `1.56.0` together and `@thomas-powers-jr/cadence-testkit`
  stays `ignore`d.
- **S.2** — Verify the generated `CHANGELOG.md` `## [1.56.0]` section names all eight
  changesets' content and carries the phase numbers (261–268), matching the house
  format of prior releases.
- **S.3** — Run the `Release` workflow with provenance; tag `v1.56.0`.
- **S.4** — Post-publish: `scripts/release-integrity.mjs` verification. Note
  `rec-20260802-005` flags the 10-attempt budget as possibly insufficient for a
  first-ever publish under a new scope — this is not that case (v1.54.0 already
  published under `@thomas-powers-jr`), so the existing budget should hold. If it
  false-reds anyway, that is evidence for `rec-20260802-005`; record it there rather
  than raising the budget ad hoc.
- **S.5** — Confirm `release-currency` (phase 262's check) reports `ok` after publish —
  local `engines` matching npm's published `engines`, and zero pending changesets.

**Acceptance criteria — gate on verbatim command output**

- **AC-1** — `cadence doctor` before publish: paste the full verbatim output.
  `roadmap-currency` at `ok`. `conduction-drift-streak` at `ok`, **or** at `warning`
  with the streak value recorded and D-F's reasoning cited — a `warning` here is an
  acceptable, honest outcome and must not be suppressed.
- **AC-2** — All five published packages at `1.56.0`; paste `node -p` output per package.
- **AC-3** — `release-integrity.mjs` post-publish check exits 0. Paste verbatim tail.
- **AC-4** — CMD-6 reports `0` pending changesets after `changeset:version`.
- **AC-5** — `release-currency` reports `ok`. Paste the verbatim check line.

---

## 7. Non-goals

- Implementing `rec-20260808-007` (deep-verify/per-task-verify provenance) — R.4 records a decision only.
- Changing the `DELTAS` gate matrix (D-E option 2) — v1.57.
- Measuring O.3's real threshold — deferred by `dec-20260810-004`; the §5 tier-distribution rec is its input.
- Any change to `conduction-drift-streak`'s threshold, severity ladder, or wording.
- Lowering, suppressing, or bypassing any check to obtain a green `cadence doctor`.
- Hand-editing any file under `.cadence/intelligence/`.
- New verifier families, providers, or gates.

---

## 8. Cross-cutting requirements

- **No predicted figures.** Every number in a DRAFT, SUMMARY, or CHANGELOG entry is
  derived from a command whose verbatim output is pasted alongside it. If §2's
  measurements have moved, yours are correct and this document is stale — say so
  explicitly rather than silently using the newer number.
- **Citations in the artifact's own text.** SUMMARY prose embeds references to the
  committed artifacts it relies on, not only in handoff prose.
- **Corpus-before-code.** R.2's regression test is authored and proven red before R.1's fix.
- **No historical `SUMMARY.json` is reinterpreted.** Additive only; absent means absent.
- **No new refusal path** anywhere in the settle pipeline.
- **Every recommendation touched gets a status transition**, not a silent close.

---

## 9. Report-back protocol

On completion, report:

1. Verbatim `cadence doctor` output, before (E4) and after.
2. CMD-1 through CMD-6 re-run output, verbatim, with any figure that moved called out.
3. Phase R's `SUMMARY.json` gate-provenance line for `code-review` — the D-F conduction proof.
4. Which D-E option was taken, and the decision id recording it.
5. Any recommendation filed during the work, with its id and scout ID.
6. Anything in §2 that measured differently than stated here.

---

## 10. Framing

This handoff is bookkeeping, and that is the point. v1.56 is the release that makes
verification impossible to misread. Cutting it while the roadmap is 38 phases stale,
a source file is invisible to `grep`, and the security gate has never run would be a
small, private version of the exact failure the release exists to fix.

The four items are each an hour of work. Do them, then ship.
