# CADENCE `cadence intelligence audit` — Integrity Enumeration — Design

**Date:** 2026-05-20
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer, dev codename; final product name = CADENCE)
**Slice:** 19 (follow-on to Slice 17 — `intelligence reconcile`; Slice 18 — `intelligence stats`)
**Predecessor slice docs:**
- [`2026-05-20-cadence-intelligence-stats-design.md`](2026-05-20-cadence-intelligence-stats-design.md) (Slice 18 — surfaces broken-link COUNTS; § Follow-On listed `audit` as enumeration sibling)
- [`2026-05-20-cadence-intelligence-reconcile-design.md`](2026-05-20-cadence-intelligence-reconcile-design.md) (Slice 17 — established `intelligence` parent; § Follow-On listed `audit`)
- [`2026-05-20-cadence-rec-link-backfill-design.md`](2026-05-20-cadence-rec-link-backfill-design.md) (Slice 11 — link arrays this slice enumerates broken refs in)

## Summary

**Slice 19** adds a read-only `audit` subcommand to the `cadence intelligence` parent. Where Slice-18 `stats` surfaces broken-link COUNTS, `audit` ENUMERATES specific broken refs with full id paths + remediation hints. Also surfaces orphan subjects (assumption/decision whose `recommendationId` references a missing rec) which `stats` does NOT count today. Exit code reflects audit findings: clean → 0; issues present → 1 unless `--quiet` is set.

- **`cadence intelligence audit`** — prints structured findings: broken link refs (rec → missing subject id) + orphan subjects (subject → missing rec). Exit 1 on any finding.
- **`--quiet`** — suppress exit-1 on findings (script-friendly). Always exits 0 on success-or-issues.
- **Empty workspace**: prints `No intelligence ledgers present.\n`, exit 0.
- **Clean ledgers**: prints `Audit clean: no integrity issues.\n`, exit 0.
- **Findings**: prints itemized list, exit 1 (unless `--quiet`).

It does **not** modify `@cadence/types` schemas, write any file (no auto-fix; Slice 17 `reconcile` is the fix path), change intake/transition surfaces, add a `--fix` flag (Slice-17 reconcile fixes link arrays; `audit` is diagnostic-only), `--format json`, touch `state.json` / `STATE.md` / loop transition, or perform a fresh fs/git scan.

## Product Boundary

- Writes nothing.
- Reads `.cadence/intelligence/{recommendations,evidence,assumptions,decisions}.json` only.
- **NEVER** calls `cadence spec new` / touches `state.json` / `STATE.md` / loop transition.

## Scope

### In scope

- New pure helper `computeIntelligenceAudit(recLedger, evLedger, asLedger, decLedger): IntelligenceAuditReport` in `intelligence/store.ts`.
- New pure renderer `renderIntelligenceAudit(report): string` in a new file `intelligence/render-intelligence-audit.ts`.
- New `cadence intelligence audit [--quiet]` subcommand on the existing `intelligence` parent.
- Tests per ACs.

### Findings detected

1. **Broken assumption links**: rec.assumptionIds[i] references id not present in `asLedger`.
2. **Broken decision links**: rec.decisionIds[i] references id not present in `decLedger`.
3. **Broken evidence links**: rec.evidenceIds[i] references id not present in `evLedger`.
4. **Orphan assumptions**: as.recommendationId references id not present in `recLedger`.
5. **Orphan tied decisions**: dec.recommendationId set + references id not present in `recLedger`. (Untied decisions are NOT orphans — they're valid Slice-8 entities.)
6. **Orphan evidence**: ev.recommendationId references id not present in `recLedger`.

Each finding lists the specific subject + the missing target id.

### Out of scope

- `--format json`.
- `--fix` (use `cadence intelligence reconcile` to repair link drift; orphan subjects require operator decision — fix not automatic).
- Severity classification (every finding is treated equal; defer until consumer needs ranks).
- Stale-data warnings (`updatedAt` older than threshold) — separate concern.
- Schema-drift warnings (Zod handles this at parse-time).
- Any `@cadence/types` schema change.

## Architecture

### MODIFIED files

- `packages/core/src/intelligence/store.ts`:
  - + `IntelligenceAuditReport` type.
  - + `computeIntelligenceAudit(recLedger, evLedger, asLedger, decLedger): IntelligenceAuditReport` pure.
- `packages/core/src/cli/commands/intelligence.ts`:
  - + `cmd.command('audit')` subcommand with `--quiet` option.

### NEW files

- `packages/core/src/intelligence/render-intelligence-audit.ts` — pure renderer.
- `packages/core/tests/intelligence/compute-intelligence-audit.test.ts` — pure-function vitest.
- `packages/core/tests/intelligence/render-intelligence-audit.test.ts` — pure-function vitest.
- `packages/core/tests/cli/intelligence-audit.test.ts` — spawn-CLI tests.

### Untouched

- `@cadence/types` — no schema change.
- All subject add/transition surfaces.
- Slice-17 `runIntelligenceReconcile` — separate concern (fix path).
- Slice-18 `computeIntelligenceStats` — separate concern (aggregates; this slice enumerates).
- `docs/reference/commands.md` marker block — UNCHANGED.
- `cli/register.ts` — `intelligence` parent already registered Slice 17.

## Data Model

```ts
export type IntelligenceAuditFinding =
  | { kind: 'broken-assumption-link'; recId: string; assumptionId: string }
  | { kind: 'broken-decision-link'; recId: string; decisionId: string }
  | { kind: 'broken-evidence-link'; recId: string; evidenceId: string }
  | { kind: 'orphan-assumption'; assumptionId: string; missingRecId: string }
  | { kind: 'orphan-decision'; decisionId: string; missingRecId: string }
  | { kind: 'orphan-evidence'; evidenceId: string; missingRecId: string };

export type IntelligenceAuditReport = {
  findings: IntelligenceAuditFinding[];
  /** Convenience: same array partitioned by kind. */
  byKind: Record<IntelligenceAuditFinding['kind'], IntelligenceAuditFinding[]>;
};
```

## Algorithm

```ts
computeIntelligenceAudit(rec, ev, as, dec):
  ├─ Build id sets: recIds, evIds, asIds, decIds.
  ├─ Walk rec.{assumption|decision|evidence}Ids → push `broken-*-link` for missing.
  ├─ Walk asLedger → push `orphan-assumption` for as.recommendationId ∉ recIds.
  ├─ Walk decLedger → for each `dec.recommendationId !== undefined && dec.recommendationId ∉ recIds`, push `orphan-decision`.
  ├─ Walk evLedger → push `orphan-evidence` for ev.recommendationId ∉ recIds.
  └─ Partition findings into byKind map.
```

Pure. No allocation in hot path (single pass per ledger).

## Render Policy

### Clean output

```
Audit clean: no integrity issues.
```

### Findings output

```
# CADENCE Intelligence Audit

Found N integrity issue(s):

## Broken Assumption Links (<n>)

- rec-X references missing assumption: as-Y
- ...

## Broken Decision Links (<n>)

- rec-X references missing decision: dec-Y

## Broken Evidence Links (<n>)

- rec-X references missing evidence: ev-Y

## Orphan Assumptions (<n>)

- as-A references missing rec: rec-Z

## Orphan Decisions (<n>)

- dec-A references missing rec: rec-Z

## Orphan Evidence (<n>)

- ev-A references missing rec: rec-Z

## Remediation

- For broken rec→subject links: run `cadence intelligence reconcile` to re-derive link arrays from current subject ledgers.
- For orphan subjects: manually inspect; either restore the missing recommendation or remove/re-tag the subject. `reconcile` does NOT auto-remove orphans (operator decision).
```

Empty sections are OMITTED (only sections with findings rendered). Header count = total findings.

## Flow

```
cadence intelligence audit [--quiet]:
  ├─ Check presence: no ledgers → exit 0 with empty message.
  ├─ Read all 4 ledgers.
  ├─ report = computeIntelligenceAudit(...)
  ├─ if findings.length === 0:
  │   ├─ stdout `Audit clean: no integrity issues.`
  │   └─ exit 0
  ├─ md = renderIntelligenceAudit(report)
  ├─ stdout.write(md)
  ├─ exit code: opts.quiet ? 0 : 1
```

## Acceptance Criteria

| AC | Statement | Linked test surface |
|---|---|---|
| AC-1 | `computeIntelligenceAudit` on clean ledgers → `findings: []`, all `byKind` arrays empty. | `compute-intelligence-audit.test.ts` |
| AC-2 | Broken assumption link: rec.assumptionIds references id not in asLedger → finding with `{kind: 'broken-assumption-link', recId, assumptionId}`. | `compute-intelligence-audit.test.ts` |
| AC-3 | Broken decision link + broken evidence link symmetric. | `compute-intelligence-audit.test.ts` |
| AC-4 | Orphan assumption: as.recommendationId references id not in recLedger → finding. | `compute-intelligence-audit.test.ts` |
| AC-5 | Orphan tied decision: dec.recommendationId set + missing in recLedger → finding. UNTIED decisions (`dec.recommendationId === undefined`) → NOT a finding. | `compute-intelligence-audit.test.ts` |
| AC-6 | Orphan evidence symmetric. | `compute-intelligence-audit.test.ts` |
| AC-7 | Multi-finding: every issue is enumerated exactly once; findings array order is rec-walk-first then orphan-walk. | `compute-intelligence-audit.test.ts` |
| AC-8 | `renderIntelligenceAudit({ findings: [] })` → `Audit clean: no integrity issues.\n`. | `render-intelligence-audit.test.ts` |
| AC-9 | Renderer emits only non-empty sections; header count matches total findings. Includes Remediation block. | `render-intelligence-audit.test.ts` |
| AC-10 | CLI `cadence intelligence audit` clean → exit 0, stdout `Audit clean: ...`. | `tests/cli/intelligence-audit.test.ts` |
| AC-11 | CLI with findings → exit 1, stdout has findings sections. | `intelligence-audit.test.ts` |
| AC-12 | CLI `--quiet` with findings → exit 0, same stdout. | `intelligence-audit.test.ts` |
| AC-13 | CLI empty workspace → exit 0, `No intelligence ledgers present.\n`. | `intelligence-audit.test.ts` |
| AC-14 | Phase-31.1 drift guard passes UNCHANGED. | `tests/docs/cli-reference.test.ts` |
| AC-15 | Strict read-only: no file writes during audit. | `intelligence-audit.test.ts` |

## Testing

- **Pure-function vitest** for compute (AC-1..AC-7) + render (AC-8, AC-9).
- **Spawn-CLI pattern** for AC-10..AC-13, AC-15.
- **Done-bar:** full `pnpm turbo run lint typecheck test build` (16/16).

## Commit Convention

```
docs: design + plan — cadence intelligence audit (Praxis Slice 19)
feat(core): computeIntelligenceAudit + renderIntelligenceAudit + CLI audit (Slice 19)
docs: document cadence intelligence audit + reconcile Slice-17/18 follow-refs (Slice 19)
```

Three commits.

## Success Criteria

1. All 15 ACs pass.
2. Full turbo gate green (16/16; lint included).
3. Slice-17 + Slice-18 § Follow-On `audit` entries reconciled.
4. No `state.json` / `STATE.md` / `cadence spec new` / loop transition touched.
5. Phase-31.1 drift guard passes UNCHANGED.
6. Branch HEAD pushes clean; PR #9 stays draft.

## Decision Log

1. **Exit 1 by default on findings**; `--quiet` for script-friendly. Inverse default would make CI usage clunky (script would need to grep stdout to detect issues).
2. **No `--fix` flag.** `cadence intelligence reconcile` (Slice 17) fixes link drift; orphan subjects need operator decision (restore the rec OR re-tag/delete the subject). Auto-fix would either silently lose data (delete orphans) or invent decisions (restore phantom recs).
3. **Six finding kinds.** Three rec→subject directions + three subject→rec directions. Symmetric coverage.
4. **`byKind` partition in the report**, not deferred to renderer. Renderer becomes dumb; downstream consumers (future `--format json`) get easy access.
5. **Empty sections OMITTED in render.** Unlike Slice-18 stats where zeros are diff-stable counts, audit's domain is "things to fix"; rendering 6 empty buckets when clean is noise.
6. **Untied decisions are NOT orphans.** Slice-8 explicitly defined untied decisions as valid (architectural decisions independent of any rec).
7. **No per-finding severity.** Add later if a consumer (e.g. CI gate) needs ranking.
8. **Remediation block always shown on findings.** Inline guidance > separate docs link; one-screen self-help.

## Follow-On

- **`--format json`** on audit + stats + show commands.
- **`--fix` for broken links** (orphan fixes still require operator decision).
- **Per-finding severity classifications.**
- **`updatedAt` staleness warnings.**
- **`supersededBy <id>`** field + supersession-graph audit.
- **Rec↔phase linkage** audit (cross-layer integrity).
- **Auto-dispatch / subagent routing** — forever-deferred.
