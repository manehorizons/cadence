# CADENCE `--filter-kind <kind>` on `intelligence audit` — Design

**Date:** 2026-05-28
**Status:** Approved design draft
**Workstream:** Praxis (strategic-intelligence layer)
**Slice:** 38 (Slice-30 follow-on; surfaces a single audit finding kind at a time)
**Predecessor slice docs:**
- [`2026-05-25-cadence-audit-stale-supersededby-design.md`](2026-05-25-cadence-audit-stale-supersededby-design.md) (Slice 30 — introduced the audit finding-kind taxonomy; § Anti-Scope / Follow-On explicitly named `--filter-kind <kind>` "surface a single dim at a time. Defer until operator asks.")
- [`2026-05-27-cadence-list-filter-regex-flags-design.md`](2026-05-27-cadence-list-filter-regex-flags-design.md) (Slice 37 — sibling filter slice; strict-validation + house-style empty-echo precedent this slice mirrors)
- [`2026-05-27-cadence-list-filter-text-exact-design.md`](2026-05-27-cadence-list-filter-text-exact-design.md) (Slice 36 — CLI-layer post-compute filter + empty-refuse precedent)

## Summary

**Slice 38** adds a `--filter-kind <kind>` flag to `cadence intelligence audit` so an
operator can surface one finding kind at a time instead of reading the full
multi-section report. The flag accepts exactly one of the eight existing audit
finding kinds; the filter is applied **at the CLI layer after**
`computeIntelligenceAudit` (the pure engine function is untouched). Output is
tailored under filter — a kind-echoed header, only the matching section, and a
Remediation block narrowed to the relevant hint.

- **One new flag** on the `intelligence audit` subcommand.
- **Exact single-kind match** — no family aliases, no multi/repeatable values.
- **Strict validation, fail-fast** — an unknown kind refuses (exit 1) naming the
  bad kind + listing the allowed kinds, **before any ledger I/O**.
- **Filtered exit code** — exit 1 iff the *filtered* findings are non-empty (and
  not `--quiet`); filtering to a kind with zero findings exits 0.
- **Tailored output** — house-style empty echo (`No intelligence audit findings of
  kind "<kind>".`), kind-echoed non-empty header, narrowed Remediation.
- **No schema / engine change** — kinds are a TypeScript union in `store.ts`; no
  `@cadence/types` change, no `computeIntelligenceAudit` logic change.

## Product Boundary

`intelligence audit` enumerates integrity issues across the intelligence layer.
This slice adds a read-time presentation filter; it does not change what is
detected, how findings are computed, or any ledger state. It is a sibling to the
list-command filter flags (Slices 33–37) applied to the audit surface.

## Scope

### In scope
- `--filter-kind <kind>` option on the `intelligence audit` subcommand.
- Strict validation against the canonical eight-kind allowlist (`AUDIT_KINDS`).
- CLI-layer narrowing of the computed `IntelligenceAuditReport` to the matched kind.
- Tailored terminal render under filter (header, single section, narrowed Remediation).
- Tailored empty-filtered message (house-style kind echo).
- Tailored JSON output under filter (type-stable narrowed report).
- Composition with the existing `--quiet` and `--format` flags.
- Reference-doc row in `docs/reference/commands.md`.

### Out of scope
- **Family aliases** (`broken` / `orphan` / `stale` expanding to sub-kinds) — rejected for YAGNI + smallest surface.
- **Multiple / repeatable / comma-list kinds** — no precedent in the recent single-value filter slices.
- **Compute-layer filtering** — `computeIntelligenceAudit` stays pure; filtering is a presentation concern handled at the CLI layer.
- **New finding kinds** — taxonomy unchanged.
- **Changes to `cadence intelligence stats` or any other command.**
- **`@cadence/types` / Zod schema changes.**

## Architecture

### MODIFIED files
- `packages/core/src/intelligence/store.ts` — **export** the existing module-private `AUDIT_KINDS` const and add a derived `AuditKind` type (`typeof AUDIT_KINDS[number]`). No logic change.
- `packages/core/src/cli/commands/intelligence.ts` — add the `--filter-kind <flags>` option (help string derived from `AUDIT_KINDS`), action typing `filterKind?: string`, fail-fast validation, and the post-compute narrowing.
- `packages/core/src/intelligence/render-intelligence-audit.ts` — add an optional 2nd arg `opts?: { filterKind?: AuditKind }`; default (omitted) behavior is **byte-identical** to today. Under a filter: kind-echoed header, narrowed Remediation, kind-echoed empty message.
- `packages/core/tests/cli/intelligence-audit.test.ts` — new CLI behavior tests.
- `packages/core/tests/intelligence/render-intelligence-audit.test.ts` — new renderer unit tests for the `filterKind` param.
- `docs/reference/commands.md` — `--filter-kind` row in the `intelligence audit` options.

### Untouched
- `computeIntelligenceAudit` and the `IntelligenceAuditFinding` union (no new kinds, no logic change).
- `@cadence/types`, all ledger stores, all other commands.
- `tests/intelligence/compute-intelligence-audit.test.ts` (no compute change).

## Implementation Pattern

### CLI option (illustrative)
```ts
.option(
  '--filter-kind <kind>',
  `Filter audit findings to a single finding kind. Allowed: ${AUDIT_KINDS.join(', ')}.`,
)
```
Action typing gains `filterKind?: string`. Option placed after `--format`.

### Validation (fail-fast, BEFORE ledger I/O)
Immediately after the existing `--format` check, before the `intelDir` existence check:
```ts
if (opts.filterKind !== undefined && !(AUDIT_KINDS as readonly string[]).includes(opts.filterKind)) {
  process.stderr.write(
    `intelligence audit failed: invalid kind: '${opts.filterKind}' (allowed: ${AUDIT_KINDS.join(', ')})\n`,
  );
  process.exitCode = 1;
  return;
}
```
So a bad kind refuses even in a repo with no ledgers — bad input is bad input.

### Filter application (CLI layer, after compute)
```ts
const report = computeIntelligenceAudit(/* … */);
const view: IntelligenceAuditReport = opts.filterKind === undefined
  ? report
  : {
      findings: report.byKind[opts.filterKind as AuditKind],
      byKind: Object.fromEntries(
        AUDIT_KINDS.map((k) => [k, k === opts.filterKind ? report.byKind[k] : []]),
      ) as IntelligenceAuditReport['byKind'],
    };
```
`view.findings` drives both output and the exit code:
```ts
if (view.findings.length > 0 && !opts.quiet) process.exitCode = 1;
```
The no-dir / all-empty short-circuits remain **before** compute and are unchanged.

### Render under filter
`renderIntelligenceAudit(report, { filterKind })`:
- **Omitted** → byte-identical to today (existing tests pass unchanged).
- **Empty + filterKind** → `No intelligence audit findings of kind "<kind>".\n`.
- **Non-empty + filterKind** → header `Found N integrity issue(s) of kind "<kind>":`, the single matching section (the `SECTION_ORDER` loop skips empty kinds), then a **narrowed Remediation** showing only the relevant family bullet:
  - `broken-*` → reconcile bullet
  - `orphan-*` → orphan-subjects bullet
  - `stale-supersededby` → reactivate bullet
  - `stale-converted-phase` → converted-phase bullet

### JSON under filter
`format === 'json'` emits `JSON.stringify(view, null, 2)` — `findings` = matched
array; `byKind` = full type-stable Record with only `[filterKind]` populated. An
empty filtered result is `{"findings":[],"byKind":{…all empty…}}` — **not** `null`
(null stays reserved for "no ledgers present").

### Behavior matrix
| Invocation | stdout | exit |
|---|---|---|
| `--filter-kind orphan-decision` (findings exist) | header + Orphan Decisions section + reactivate/orphan bullet | 1 |
| `--filter-kind orphan-decision` (none of that kind; others exist) | `No intelligence audit findings of kind "orphan-decision".` | 0 |
| `--filter-kind orphan-decision --quiet` (findings exist) | same as row 1 | 0 |
| `--filter-kind orphan-decision --format json` | narrowed report JSON | 1 if matched findings else 0 |
| `--filter-kind bogus` | `intelligence audit failed: invalid kind: 'bogus' (allowed: …)` (stderr) | 1 |
| `--filter-kind <any>` in repo with no ledgers | validation passes if kind valid → `No intelligence ledgers present.` (kind valid) / invalid-kind error (kind invalid) | 0 / 1 |

## Acceptance Criteria
- **AC-kind-1:** `--filter-kind <k>` with matching findings prints only that kind's section (terminal), kind-echoed header, exit 1.
- **AC-kind-2:** `--filter-kind <k>` with no findings of `k` but findings of other kinds present prints `No intelligence audit findings of kind "<k>".` and exits 0.
- **AC-kind-3:** `--filter-kind <k> --quiet` exits 0 even when `k` has findings.
- **AC-kind-4:** `--filter-kind <k> --format json` emits a type-stable narrowed report (findings = only `k`; `byKind` has all 8 keys, only `k` populated).
- **AC-kind-5:** invalid `--filter-kind` refuses (exit 1) naming the kind + the allowed list, with no ledger read required.
- **AC-kind-6:** under filter, Remediation shows only the bullet for the displayed kind's family.
- **AC-kind-7:** unfiltered `intelligence audit` output (terminal + json) is byte-identical to pre-Slice-38 (regression guard).

## Testing
- `tests/cli/intelligence-audit.test.ts`: AC-kind-1…6 via the `run(['intelligence','audit',…])` harness + `tempRepo` fixtures seeding the relevant drift (e.g., an orphan decision, a stale `supersededBy`).
- `tests/intelligence/render-intelligence-audit.test.ts`: unit tests for the `filterKind` param (empty echo, narrowed remediation, kind-echoed header) + AC-kind-7 regression (omitted param ⇒ unchanged).
- ~7–8 new tests total. No change to `compute-intelligence-audit.test.ts`.

## Commit Convention
Praxis four-commit shape: design → plan → `feat(core): --filter-kind on intelligence audit (Slice 38)` → `docs: …`. **No `Co-Authored-By` trailer on any commit** (verified `0` per the Slice 37 Decision Log §11 precedent; every commit body checked before push).

## Success Criteria
- All seven ACs covered by tests; full turbo gate 16/16 green.
- `@cadence/core` test count grows by ~7–8.
- Unfiltered audit behavior provably unchanged (AC-kind-7).
- CI green on the `cadence-dev` self-hosted runner.

## Decision Log
1. **Exact single kind, not family aliases or multi-value.** Matches Slice-30's "surface a single dim at a time" and the single-value precedent of Slices 33–37. Aliases/multi deferred to a follow-on only if operators ask.
2. **CLI-layer filter, engine pure.** `computeIntelligenceAudit` is unchanged; filtering is a presentation concern, consistent with every list-filter slice.
3. **Export `AUDIT_KINDS` rather than duplicate the list.** Single command + the canonical list already lives beside the type ⇒ exporting beats copying. (Contrast Slice 37's deliberate per-command duplication across three symmetric files.)
4. **Tailored output under filter.** Kind-echoed header + single section + narrowed Remediation + house-style empty echo — coherent reading under a filter, consistent with the Slice 33–37 empty-echo pattern.
5. **Filtered exit code.** Exit status reflects the filtered view, so `--filter-kind` doubles as a script-friendly "are there any `<kind>` findings?" probe (composes with `--quiet`).
6. **Empty filtered JSON is `{findings:[],byKind:{…}}`, not `null`.** `null` stays reserved for "no ledgers to audit"; an audited-but-empty-for-this-kind result is a populated (empty) report.
7. **No `Co-Authored-By` trailer.** Hard rule per Slice 37 Decision Log §11.

## Follow-On
- **Family aliases / multi-kind** — only if operators repeatedly want category-level or multi-kind filtering.
- **Graph viewer optimization** (Slice 29 follow-on) — still on the Praxis polish list; independent; deferred until performance matters (short chains today).
