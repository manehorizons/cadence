# CADENCE Context Packets — `review` + `agent` Scopes — Design

**Date:** 2026-05-18
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 7 (follow-on to Slice 5 — Context Packets)
**Parent design:** [`synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md`](../../../../synth/docs/superpowers/specs/2026-05-17-cadence-praxis-strategic-intelligence-design.md) §Context
**Predecessor slice design:** [`2026-05-17-cadence-context-packets-design.md`](2026-05-17-cadence-context-packets-design.md) (Slice 5)

## Summary

**Slice 7** extends `cadence context <scope>` to support two new scopes — **`review`** and **`agent`** — by adding two new policy branches to the existing `synthesizeContextPacket` switch + a single optional field on `ContextPacketZ`. No new files. No new commands. No new modules. No backend changes. The slice closes out the four-scope set the parent design hinted at ("compact context packets for phases, reviews, agents, or handoffs") and that Slice 5's Follow-On section explicitly anticipated as the cheapest next branch.

- **`review`** = backward-looking post-build audit context for a reviewer inspecting an in-flight-BUILD or just-settled phase. Surfaces a dedicated `needsAttention` bucket (superseded ∪ contradicted recs) alongside the ranked top-N. Open assumptions and decisions are NOT filtered — a reviewer audits all of them.
- **`agent`** = forward-looking subagent dispatch brief. Selects the top-3 ranked recs filtered to the dispatchable subset (`status='accepted'` ∩ `readiness ∈ {ready-for-milestone, ready-for-cadence-spec}`). Renders without the operator-facing `nextAction` / `stateError` lines a worker subagent doesn't need.

It does **not** add rec↔phase linkage (deferred — speculative until promotion tracking exists), change the CLI shape (`ContextScopeZ.safeParse` already accepts new enum members), add a new backend status field (`state.activePhase` is sticky-after-settle), read file contents, run a fresh fs/git scan, change `phase`/`handoff` output bytes, or transition the loop.

## Product Boundary (parent design's #1 risk: do not rebuild / drive the loop)

Identical to Slice 5 — re-affirmed:

- `cadence context <scope>` is read-broad / write-narrow.
- It **never** calls `cadence spec new`, **never** reads/writes `state.json` / `STATE.md`, **never** transitions `SPEC→DRAFT→BUILD→SETTLE`.
- Output stays under the Praxis-owned namespace `.cadence/intelligence/context/<scope>.{json,md}` — structurally disjoint from `.cadence/phases/` and `.cadence/state.json`.

Adding two scopes does not relax that boundary.

## Scope

### In scope

- Extend `ContextScopeZ` enum: `['phase','handoff']` → `['phase','handoff','review','agent']`.
- Add `needsAttention?: ContextRec[]` (optional) to `ContextPacketZ` — used by `review` only; other scopes omit.
- Extend `synthesizeContextPacket` switch with `'review'` and `'agent'` branches (selection policies in Data Model).
- Extend `renderContextMd`:
  - Emit `## Needs Attention` section when `packet.scope === 'review'` (`_(none)_` when bucket empty).
  - For `packet.scope === 'agent'`, omit `nextAction` and `stateError` Markdown lines from the loop block; JSON retains both.
- Reuse Slice-3 `partitionLedger` + `scoreRecommendation` — single source of truth for ranking.
- Reuse Slice-5 store readers (`readAssumptionLedger`, `readIntelligenceDecisionLedger`) and the existing module-private `oneLine`.
- Tests per CADENCE test idioms — see Testing.

### Out of scope (later / parked)

- Rec↔phase linkage (any mechanism to filter recs by phase membership) — deferred. `review` selects by status, not phase. A future slice can build linkage via `IntelligenceMilestone.exportTargets` → promoted SPEC.md → phase, once promotion tracking exists.
- Reading file *contents* / embedding snippets; any fresh filesystem / git scan (no Slice-2 scanner coupling).
- A character / token size budget or truncation algorithm (compactness stays bounded-by-construction).
- Per-rec or per-task arg (e.g. `cadence context agent <rec-id>`) — zero-arg only, mirrors `phase`/`handoff`.
- A new backend status field (e.g. `lastSettledPhase`) — `state.activePhase` is sticky after settle (evidence: project's live `state.json` shows `"activePhase":"38-spec-draft-autoseed"` while `"loopPosition":"IDLE"`).
- Any new top-level CLI command — Phase-31.1 cli-reference drift guard stays untripped.
- Auto-dispatching the subagent (the parent design's "Premature Agent Orchestration" risk explicitly defers routing — Slice 7 is the *packaging* side).
- A second backend.

## Architecture

Three changed files. Additive only. No new files / modules.

### `packages/types/src/intelligence.ts`

```ts
export const ContextScopeZ = z.enum(['phase', 'handoff', 'review', 'agent']);

export const ContextPacketZ = z.object({
  // ...existing fields unchanged...
  needsAttention: z.array(ContextRecZ).optional(),
});
```

`schemaVersion` stays `1` (additive optional field; Slice-4a/4b precedent for additive enum/field changes within a major).

### `packages/core/src/intelligence/context.ts`

Two new constants, two new switch branches inside the existing `synthesizeContextPacket`. No reshape of the function signature; no new exports.

```ts
const TOP_N_PHASE   = 7;   // existing
const TOP_N_HANDOFF = 5;   // existing
const TOP_N_REVIEW  = 5;   // new
const TOP_N_AGENT   = 3;   // new
```

`partitionLedger` already returns `{ ranked, parked, needsAttention, excludedCount }` (`excludedCount` is a number, not an array). The Flow pseudocode partial-destructures `{ ranked, needsAttention }`; `review` consumes the `needsAttention` bucket directly (rescored + sorted), so no new pure helper is added.

### `packages/core/src/intelligence/render-context.ts`

Two new render branches keyed off `packet.scope`. No new files.

### Lightly touched

- `cli/commands/context.ts` — TWO hardcoded user-facing strings updated to list the four scopes (argument parsing and control flow UNCHANGED; `ContextScopeZ.safeParse` accepts the expanded enum on its own):
  - `.description('Emit a compact, read-only context packet (scope: phase | handoff | review | agent)')` (was `phase | handoff`)
  - invalid-scope stderr: `context: invalid scope "<scope>" (expected: phase | handoff | review | agent)\n` (was `expected: phase | handoff`)
  - Existing CLI test at `packages/core/tests/cli/context.test.ts:64` matches `/invalid scope "bogus"/` (does not pin the "expected: …" tail) → safe to extend the expected-list without breaking it; a new positive assertion pins the new tail.

### Untouched

- `intelligence/store.ts` — Slice 5 readers cover the new scopes' needs.
- `intelligence/backend/cadence.ts` — `state.activePhase` is sticky-after-settle; no new field.
- `cli/commands/context.ts` action body, `safeParse` parsing, exit codes, JSON branch — only the two strings above change.
- `cli/register.ts` — no top-level CLI change → Phase-31.1 cli-reference drift guard untripped.

## Data Model

### Per-scope selection policy

| Aspect | `phase` (frozen) | `handoff` (frozen) | **`review`** | **`agent`** |
|---|---|---|---|---|
| Intent | Forward pre-build: phase carries this | Cross-session resume trail | Backward post-build: reviewer audits this | Subagent dispatch brief |
| Anchor | `state.activePhase` (current build) | current loop snapshot | `state.activePhase` (sticky → covers in-flight + last-settled) | `state.activePhase` (situational awareness) |
| `recommendations[]` base | `partitionLedger.ranked` | `partitionLedger.ranked` | `partitionLedger.ranked` | `partitionLedger.ranked` ∩ `status='accepted'` ∩ `readiness ∈ {ready-for-milestone, ready-for-cadence-spec}` |
| TOP_N | `TOP_N_PHASE = 7` | `TOP_N_HANDOFF = 5` | `TOP_N_REVIEW = 5` | `TOP_N_AGENT = 3` |
| `needsAttention[]` | omitted (field absent) | omitted | **emitted (always, even when empty `[]`)** — full `partitionLedger.needsAttention` bucket, rescored, sorted score↓ then `createdAt↑` then `id↑`, no TOP_N cap | omitted |
| `assumptions[]` filter | `status='open'` ∧ tied to selected recs | `status='open'` (all) | **`status='open'` (all — reviewer audits everything)** | **`status='open'` ∧ tied to selected (top-3) recs** |
| `decisions[]` filter | tied to selected recs | all | **all (reviewer audits decision rationale)** | **tied to selected recs (top-3) only** |
| `files[]` source | `affectedFiles` ∪ evidence paths, from selected recs | from all ranked recs | **from selected ∪ `needsAttention` recs** (`affectedFiles` ∪ evidence paths) | from selected (top-3) recs only |
| `loop` block (JSON) | full | full | full | full |
| `loop` block (Markdown) | full | full | full | **omits `nextAction` + `stateError`** (render-only strip) |

**Tie-break for ranking** (all scopes, identical to Slice 5): `score↓`, then `createdAt↑`, then `id↑`.

**`needsAttention` empty representation:** field present with `needsAttention: []` for `review` scope; field absent for other scopes. Choice: making the field a scope-discriminant in JSON is unambiguous for any downstream consumer.

### Schema delta on `ContextPacketZ`

```ts
needsAttention: z.array(ContextRecZ).optional(),
```

Other fields unchanged. `totals` is **NOT** extended — `needsAttention` does not get its own count; consumers that want it can read `packet.needsAttention?.length`. (Justification: `totals` is a five-key shape Slice 5 froze; extending it now would touch every existing test's golden. The bucket's size is trivially derivable from the array itself.)

### Ready-filter precision for `agent`

Applied AFTER `partitionLedger`:

```
ready = ranked
  .filter(r =>
    r.status === 'accepted' &&
    (r.readiness === 'ready-for-milestone' ||
     r.readiness === 'ready-for-cadence-spec'))
selected = ready.sort(score↓, createdAt↑, id↑).slice(0, TOP_N_AGENT)
```

`partitionLedger` already drops `rejected`/`converted`/`superseded`/`contradicted`/`deferred` into other buckets, so this filter doesn't re-state existing exclusions — it only narrows to *dispatchable*.

## Flow

```
runContext(root, scope, now)
  ├─ Promise.all:
  │    readRecommendationLedger(root)       → recs[]
  │    readEvidenceLedger(root)             → ev[]
  │    readAssumptionLedger(root)           → as[]    (honest-empty if no intake)
  │    readIntelligenceDecisionLedger(root) → dec[]   (honest-empty if no intake)
  │    cadenceBackend.readStatus(root)      → backend (present:false if state absent)
  │
  ├─ synthesizeContextPacket(scope, sources, now)
  │    ├─ { ranked, needsAttention } = partitionLedger(recs)
  │    ├─ scored = ranked.map(scoreRecommendation).sort(score↓, createdAt↑, id↑)
  │    ├─ switch (scope) {
  │    │     'phase'   : selected = scored.slice(0, 7)            // frozen
  │    │     'handoff' : selected = scored.slice(0, 5)            // frozen
  │    │     'review'  : selected = scored.slice(0, 5)
  │    │                 attn     = needsAttention
  │    │                              .map(scoreRecommendation)
  │    │                              .sort(score↓, createdAt↑, id↑)
  │    │     'agent'   : ready    = scored.filter(s =>
  │    │                              s.rec.status === 'accepted' &&
  │    │                              (s.rec.readiness === 'ready-for-milestone' ||
  │    │                               s.rec.readiness === 'ready-for-cadence-spec'))
  │    │                 selected = ready.slice(0, 3)
  │    │ }
  │    ├─ assumptions, decisions, files = per-scope filter (table above)
  │    ├─ loop = built from backend.readStatus (graceful-degrade)
  │    └─ ContextPacketZ.parse({
  │         ...packet,
  │         ...(scope === 'review' ? { needsAttention: attn } : {})
  │       })
  │
  ├─ mkdir -p .cadence/intelligence/context/
  ├─ atomicWriteJSON  .cadence/intelligence/context/<scope>.json
  ├─ atomicWriteText  .cadence/intelligence/context/<scope>.md   (renderContextMd)
  └─ return packet                            (CLI also prints rendered .md to stdout)
```

Render extension (only the diff from Slice 5):

```
renderContextMd(packet):
  ├─ ...existing header + loop + recommendations + assumptions + decisions + files...
  │
  ├─ if packet.scope === 'review':
  │     emit "## Needs Attention" header
  │     if packet.needsAttention && packet.needsAttention.length > 0:
  │       render as the same-column rec table as ranked recommendations
  │     else:
  │       emit "_(none)_"
  │
  └─ if packet.scope === 'agent':
        in the loop block, OMIT the lines that surface
        loop.nextAction and loop.stateError. JSON is untouched.
```

## Error Handling

| Failure | Behavior |
|---|---|
| `.cadence/state.json` absent | `cadenceBackend.readStatus` returns `present:false`; loop block degrades; synth/render proceed normally for both scopes |
| `.cadence/state.json` corrupt | `BackendStatus.stateError` populated; loop block carries it; review/agent JSON keeps it; agent render strips it from .md only (not from JSON) |
| Recommendation ledger absent / empty | Honest-empty packet (`recommendations: []`, `totals.recommendations: 0`); for `review` `needsAttention: []`; no throw |
| Assumption / decision ledger absent | Honest-empty (Slice-5 precedent — documented "no intake yet" gap; the same gap holds for these new scopes) |
| `ContextPacketZ.parse` fails | Throws — synth is the schema contract enforcer; a parse failure is a real bug, not a runtime condition |
| `mkdir` / `atomicWrite` fails (disk / perm) | Throws unchanged — same surface as Slice 5; operator-visible |
| Invalid scope from CLI | `ContextScopeZ.safeParse` (existing Slice-5 path) → `process.exitCode = 2` with hand-written stderr line `context: invalid scope "<scope>" (expected: phase \| handoff \| review \| agent)\n` (no `_zod` formatting, no Commander `.choices()`); see AC-7 for the authoritative exact format |
| Zero ready recs for `agent` | `recommendations: []`, `totals.recommendations: 0`; render emits `_(none)_`; not a refusal |
| `state.activePhase` null (fresh project, no phase ever started) | `loop.activePhase` ∈ null/absent; review/agent selection unaffected (status-based, not phase-based) |
| Empty `needsAttention` bucket for `review` | `needsAttention: []` (field present); render emits `## Needs Attention` then `_(none)_` |

**Strict read-only audit (re-affirmed):**

- No write outside `.cadence/intelligence/context/<scope>.{json,md}`.
- No `state.json` mutation, no `cadence spec new`, no loop transition.
- No `affectedFiles` content read — paths only.
- No fresh fs / git scan.

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | Types: `ContextScopeZ.parse('review')` and `ContextScopeZ.parse('agent')` succeed; unknown scope rejected. `ContextPacketZ` accepts and round-trips optional `needsAttention: ContextRec[]`. | `packages/types/src/intelligence.test.ts` (extend Slice-5 block) |
| AC-2 | Synth `review`: TOP_N_REVIEW=5 ranked recs (rescored, sorted score↓, createdAt↑, id↑); `needsAttention` = full partition bucket (rescored + sorted; no TOP_N); open assumptions = ALL; decisions = ALL; files = dedup of `affectedFiles` ∪ evidence paths from selected ∪ needsAttention recs. | `packages/core/src/intelligence/context.test.ts` |
| AC-3 | Synth `agent`: selected = ranked ∩ `status='accepted'` ∩ `readiness ∈ {ready-for-milestone, ready-for-cadence-spec}`, slice(0,3); assumptions = open ∧ tied-to-selected; decisions = tied-to-selected; files = from selected recs only. | `context.test.ts` |
| AC-4 | Render: `review` scope emits `## Needs Attention` section — ALL `packet.needsAttention` entries rendered, no TOP_N cap (mirrors synth-side; if synth gives N rows, render emits N rows); `_(none)_` when empty. `agent` scope render OMITS `nextAction` and `stateError` lines from .md; JSON retains both. | `render-context.test.ts` |
| AC-5 | Regression: `phase` + `handoff` JSON+MD bytes are stable (existing fixtures and goldens untouched after this slice). Explicit guard test asserts the absence of the `needsAttention` key in `phase`/`handoff`/`agent` JSON. | `context.test.ts` + `render-context.test.ts` |
| AC-6 | Graceful: backend `present:false` → loop block degrades, both new scopes succeed; null `state.activePhase` → both scopes succeed; zero ready recs for `agent` → `recommendations: []`, `totals.recommendations: 0`, no throw. | `context.test.ts` |
| AC-7 | IO + CLI: `runContext` writes `.cadence/intelligence/context/{review,agent}.{json,md}` (atomic); CLI `cadence context review` and `cadence context agent` print the .md to stdout (and `--json` prints JSON); invalid scope → `process.exitCode = 2` with stderr line `context: invalid scope "<scope>" (expected: phase | handoff | review | agent)\n` (extends the Slice-5 hand-written message to the four-scope list); CLI `--help` output mentions all four scopes via the updated `.description(...)` string. | `cli/context.test.ts` (spawned-CLI idiom) |

## Testing (per CADENCE test idioms)

- **Spawned-CLI pattern** for CLI tests (AC-7).
- **Pure-function vitest** for synth + render (AC-2, AC-3, AC-4, AC-5, AC-6).
- **Test-coverage gate (Phase 14):** every AC above maps to at least one linked test. AC-5 is explicit byte-stability regression.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16). Lint must be in every per-task check — Slice-4a/Slice-6 gotcha: subset checks miss `no-unused-vars` lint regressions.
- Fixture safety: see Decision Log #4 below — `mkRec` defaults audit before writing exact-array `toEqual` assertions on `agent`-scope output.

## Commit Convention

Mirror Slice 5 / Slice 6 conventional commits, one per task:

```
refactor(types): expand ContextScopeZ enum + optional needsAttention (Slice 7)
test(core): synth `review` scope policy + needsAttention bucket (Slice 7)
feat(core): synth `review` + `agent` policy branches (Slice 7)
test(core): render `review` needsAttention + `agent` loop-strip (Slice 7)
feat(core): render `review` + `agent` (Slice 7)
test(core): IO + CLI for `review` + `agent` scopes (Slice 7)
feat(core): CLI accepts `review` + `agent` (Slice 7)
docs: design + plan; reconcile Slice-5 follow-on (Slice 7)
```

Final SETTLE — none. Slice 7 is not a phase under the loop; it's a Praxis slice on the long-lived branch, same convention as Slices 1–6.

## Success Criteria

The slice succeeds if:

1. All 7 ACs pass.
2. Full turbo gate green at every task's done-bar (16/16; lint included).
3. `phase` and `handoff` JSON+MD byte-stable (AC-5 the canary).
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched (boundary audit).
5. Branch HEAD pushes clean through pre-push to `origin/praxis-intelligence-ledger`; PR #9 remains draft and unmerged.
6. Slice-5 design doc's Follow-On section reconciled: `~~review and agent scopes~~ — shipped in Slice 7 (this doc)`.

## Decision Log

1. **Both scopes in one slice** — shared architecture (one enum, one synth switch, one render); semantics designed coherently together; matches Slice 5's framing as "two new branches".
2. **`review` semantics = code/phase-review prep, backward-looking** — pairs cleanly with CADENCE's existing code-review phases (24, 35, 37); distinct from forward-looking `phase`.
3. **`review` anchors on `state.activePhase`** — sticky-after-settle in `state.json` (evidence: live `state.json` shows `activePhase` populated while `loopPosition='IDLE'`). Smart default reduces to a single anchor expression; no new backend field needed.
4. **No rec↔phase linkage in this slice** — speculative until promotion tracking exists; would breach Slice-5 read-narrow boundary if done via fresh fs/git scan. `review` selects by status, not phase.
5. **`agent` filter = ranked ∩ accepted ∩ ready-*** — selects only dispatchable recs; TOP_N=3 = small dispatch slate (top-1 too brittle; top-5 defeats "sharpest brief" framing).
6. **`needsAttention` as new optional schema field** (additive, schemaVersion=1) — vs render-only or inline-discriminant. JSON consumers (e.g. a hosted review agent) can read the bucket without title-parsing. Matches Slice-4a/4b precedent for additive optional fields.
7. **`needsAttention` empty representation: `[]` for review, omitted for other scopes** — makes the field a scope-discriminant in JSON.
8. **`totals` shape not extended** — five-key shape Slice 5 froze; bucket size derivable from `needsAttention.length`; avoids touching every Slice-5 golden.
9. **`agent` render-strip is render-only** — JSON keeps `nextAction`/`stateError` for any future consumer that wants them; markdown drops them as operator-facing chrome a worker subagent doesn't need.
10. **Fixture-neutralization audit applies to `agent` tests** — Slice-6 meta-lesson: when a new filter keys off rec status/readiness defaults, every exact-array `toEqual` golden must use explicit (non-default) fixture values + an in-file comment naming the trap. Boundary test pinned (ready-for-milestone ✓ included; needs-evidence ✗ excluded).
11. **No new top-level CLI command + no `register.ts` change** — Phase-31.1 cli-reference drift guard untripped.

## Follow-On (not in this slice)

- Rec↔phase linkage (`IntelligenceMilestone.exportTargets` → promoted SPEC.md → phase). Would let `review` filter recs by phase membership, not just status. Requires promotion tracking design.
- An assumption / decision intake command — would densify both new scopes' assumptions/decisions sections (Slice 5's documented gap applies here verbatim).
- A per-rec arg for `cadence context agent <rec-id>` — would let an operator dispatch a subagent against an explicit rec rather than the top-3 ranked.
- A size-budget / truncation mode if real packets ever overflow practical limits.
- Auto-dispatch / subagent routing — explicitly the parent design's deferred risk; out of slice forever until CADENCE's packaging is proven well-fitted.
