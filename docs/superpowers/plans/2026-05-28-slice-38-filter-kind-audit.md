# Slice 38 — `--filter-kind` on `intelligence audit` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `--filter-kind <kind>` to `cadence intelligence audit` to surface a single finding kind at a time, with strict validation and tailored output (kind-echoed header, single section, narrowed Remediation, house-style empty echo, type-stable narrowed JSON).

**Architecture:** CLI-layer post-compute filter — `computeIntelligenceAudit` stays pure. `store.ts` exports its existing `AUDIT_KINDS` const (+ a derived `AuditKind` type) as the single source of truth for both validation and the renderer's remediation map. The renderer gains an optional `{ filterKind }` arg that is byte-identical to today when omitted.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), commander, vitest, `@cadence/testkit`'s `tempRepo`, `pnpm turbo`.

**Upstream design source:** `docs/superpowers/specs/2026-05-28-cadence-audit-filter-kind-design.md` (committed `398c8aa` on `main`, unpushed).

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/core/src/intelligence/store.ts` | Modify | `export` the existing `AUDIT_KINDS` const; add `export type AuditKind = (typeof AUDIT_KINDS)[number];`. No logic change. |
| `packages/core/src/intelligence/render-intelligence-audit.ts` | Modify | Add optional 2nd arg `opts?: { filterKind?: AuditKind }`. Extract the 4 Remediation bullets to named consts + a `REMEDIATION_BY_KIND` map. Kind-echoed header + empty message + narrowed Remediation under filter. Byte-identical when `filterKind` omitted. |
| `packages/core/src/cli/commands/intelligence.ts` | Modify | Import `AUDIT_KINDS`, `type AuditKind`, `type IntelligenceAuditReport`. Add `--filter-kind <kind>` option (help derived from `AUDIT_KINDS`), action typing `filterKind?: string`, fail-fast validation, post-compute narrowing, pass `filterKind` to renderer. |
| `packages/core/tests/intelligence/render-intelligence-audit.test.ts` | Modify (append) | 4 renderer unit tests for the `filterKind` param. |
| `packages/core/tests/cli/intelligence-audit.test.ts` | Modify (append) | 6 CLI behavior tests (AC-kind-1…6). |
| `docs/reference/commands.md` | Modify | Update the `audit` command-row (line ~962) + the `**audit**` prose paragraph (line ~980) to document `--filter-kind`. |

**No new files. No `@cadence/types` / schema change. No `computeIntelligenceAudit` logic change.**

**Total new tests:** 10 (4 renderer + 6 CLI). `@cadence/core` test count target: **1132 → 1142**.

**Commit shape (Praxis):** design (`398c8aa`, done) → plan (Task 0) → `feat(core)` (Task 3) → `docs` (Task 4). No `Co-Authored-By` trailer on any commit (verify `git log -1 --format=%B | grep -c Co-Authored-By` → `0` before each push; the phrase must not appear even as prose in a commit body).

---

## Task 0: Commit this plan

**Files:** Stage only `docs/superpowers/plans/2026-05-28-slice-38-filter-kind-audit.md`.

- [ ] **Step 0.1: Confirm working tree**

```bash
git status --porcelain
```
Expected: exactly one entry — `?? docs/superpowers/plans/2026-05-28-slice-38-filter-kind-audit.md`. If anything else is modified, STOP and report.

- [ ] **Step 0.2: Commit the plan**

```bash
git add docs/superpowers/plans/2026-05-28-slice-38-filter-kind-audit.md
git commit -m "docs: Slice 38 implementation plan (--filter-kind on intelligence audit)"
```

- [ ] **Step 0.3: Verify clean commit**

```bash
git log -1 --format=%B | grep -c Co-Authored-By
git log --oneline origin/main..HEAD
```
Expected: `0`; and `origin/main..HEAD` shows the design (`398c8aa`) + this plan commit (both unpushed — they ship with Task 6's push).

---

## Task 1: Export `AUDIT_KINDS` + add the renderer `filterKind` param

**Files:**
- Modify: `packages/core/src/intelligence/store.ts`
- Modify: `packages/core/src/intelligence/render-intelligence-audit.ts`
- Test: `packages/core/tests/intelligence/render-intelligence-audit.test.ts`

### Step 1.1: Write the failing renderer unit tests

- [ ] **Step 1.1**

Append inside the top-level `describe('renderIntelligenceAudit (Slice 19)', ...)` block in `packages/core/tests/intelligence/render-intelligence-audit.test.ts`, just before its final closing `});`. These use the existing `mkReport(...)` helper already defined at the top of the file.

```typescript
  describe('Slice 38: --filter-kind tailored render', () => {
    it('AC-kind-2 (render): empty report + filterKind → kind-echoed empty message', () => {
      const md = renderIntelligenceAudit(mkReport([]), { filterKind: 'orphan-decision' });
      expect(md).toBe('No intelligence audit findings of kind "orphan-decision".\n');
    });

    it('AC-kind-1 (render): non-empty filtered → kind-echoed header + only that section', () => {
      const md = renderIntelligenceAudit(
        mkReport([
          { kind: 'orphan-decision', decisionId: 'dec-1', missingRecId: 'rec-gone' },
        ]),
        { filterKind: 'orphan-decision' },
      );
      expect(md).toMatch(/Found 1 integrity issue\(s\) of kind "orphan-decision":/);
      expect(md).toMatch(/## Orphan Decisions \(1\)/);
      expect(md).toMatch(/- dec-1 references missing rec: rec-gone/);
    });

    it('AC-kind-6 (render): filtered Remediation shows ONLY the relevant family bullet', () => {
      const md = renderIntelligenceAudit(
        mkReport([
          { kind: 'orphan-decision', decisionId: 'dec-1', missingRecId: 'rec-gone' },
        ]),
        { filterKind: 'orphan-decision' },
      );
      expect(md).toMatch(/## Remediation/);
      expect(md).toMatch(/For orphan subjects:/);
      expect(md).not.toMatch(/For broken rec→subject links:/);
      expect(md).not.toMatch(/cadence decision reactivate <id>/);
      expect(md).not.toMatch(/For stale converted-to-phase refs:/);
    });

    it('AC-kind-7 (render): omitting filterKind is byte-identical to the legacy call', () => {
      const findings: IntelligenceAuditFinding[] = [
        { kind: 'broken-assumption-link', recId: 'rec-1', assumptionId: 'as-missing' },
        { kind: 'stale-supersededby', decisionId: 'dec-1', missingTargetId: 'dec-x' },
      ];
      expect(renderIntelligenceAudit(mkReport(findings))).toBe(
        renderIntelligenceAudit(mkReport(findings), {}),
      );
      // And the full 4-bullet Remediation block is present unfiltered.
      const md = renderIntelligenceAudit(mkReport(findings));
      expect(md).toMatch(/For broken rec→subject links:/);
      expect(md).toMatch(/For orphan subjects:/);
      expect(md).toMatch(/cadence decision reactivate <id>/);
      expect(md).toMatch(/For stale converted-to-phase refs:/);
    });
  });
```

### Step 1.2: Run the renderer tests, verify FAIL

- [ ] **Step 1.2**

```bash
pnpm --filter @cadence/core test -- render-intelligence-audit.test
```
Expected: the 4 new tests FAIL — `renderIntelligenceAudit` currently takes one argument and ignores the second; the empty-message test fails (returns `Audit clean: no integrity issues.\n`) and the header test fails (no "of kind" suffix). TypeScript may also error on the unknown 2nd arg until Step 1.4.

### Step 1.3: Export `AUDIT_KINDS` + add the `AuditKind` type in `store.ts`

- [ ] **Step 1.3**

In `packages/core/src/intelligence/store.ts`, change the existing declaration (currently `const AUDIT_KINDS = [` near line 814) to add `export`, and add the derived type immediately after the closing `] as const;`:

```typescript
export const AUDIT_KINDS = [
  'broken-assumption-link',
  'broken-decision-link',
  'broken-evidence-link',
  'orphan-assumption',
  'orphan-decision',
  'orphan-evidence',
  'stale-supersededby',
  'stale-converted-phase',
] as const;

export type AuditKind = (typeof AUDIT_KINDS)[number];
```

Verification:
```bash
grep -n "export const AUDIT_KINDS\|export type AuditKind" packages/core/src/intelligence/store.ts
```
Expected: two matches.

### Step 1.4: Add the `filterKind` param to the renderer

- [ ] **Step 1.4**

Open `packages/core/src/intelligence/render-intelligence-audit.ts`.

(a) Extend the type import at the top to add `AuditKind`:
```typescript
import type {
  AuditKind,
  IntelligenceAuditFinding,
  IntelligenceAuditReport,
} from './store.js';
```

(b) Add the four Remediation-bullet consts + a per-kind map immediately above the `renderIntelligenceAudit` function (after `renderFindingLine`). The bullet strings are copied verbatim from the current Remediation block so unfiltered output stays byte-identical:
```typescript
const REMEDIATION_BROKEN =
  '- For broken rec→subject links: run `cadence intelligence reconcile` to re-derive link arrays from current subject ledgers.';
const REMEDIATION_ORPHAN =
  '- For orphan subjects: manually inspect; either restore the missing recommendation or remove/re-tag the subject. `reconcile` does NOT auto-remove orphans (operator decision).';
const REMEDIATION_STALE_SUPERSEDED =
  '- For stale supersededBy refs: restore the missing decision, OR run `cadence decision reactivate <id>` to clear the dangling `supersededBy` edge (reactivate clears the field per Slice 28).';
const REMEDIATION_STALE_CONVERTED =
  '- For stale converted-to-phase refs: verify the phase id is correct (typo?), OR hand-edit the rec to clear `convertedToPhaseId` then run `cadence intelligence reconcile`.';

const REMEDIATION_BY_KIND: Record<AuditKind, string> = {
  'broken-assumption-link': REMEDIATION_BROKEN,
  'broken-decision-link': REMEDIATION_BROKEN,
  'broken-evidence-link': REMEDIATION_BROKEN,
  'orphan-assumption': REMEDIATION_ORPHAN,
  'orphan-decision': REMEDIATION_ORPHAN,
  'orphan-evidence': REMEDIATION_ORPHAN,
  'stale-supersededby': REMEDIATION_STALE_SUPERSEDED,
  'stale-converted-phase': REMEDIATION_STALE_CONVERTED,
};
```

(c) Replace the entire `export function renderIntelligenceAudit(...)` body (currently lines 49–85) with this version. The empty-message branch and header gain the `filterKind` echo; the Remediation block emits one bullet when filtered, all four (byte-identical to today) when not:
```typescript
export function renderIntelligenceAudit(
  report: IntelligenceAuditReport,
  opts?: { filterKind?: AuditKind },
): string {
  const filterKind = opts?.filterKind;
  if (report.findings.length === 0) {
    return filterKind
      ? `No intelligence audit findings of kind "${filterKind}".\n`
      : 'Audit clean: no integrity issues.\n';
  }
  const lines: string[] = [];
  lines.push('# CADENCE Intelligence Audit');
  lines.push('');
  lines.push(
    filterKind
      ? `Found ${report.findings.length} integrity issue(s) of kind "${filterKind}":`
      : `Found ${report.findings.length} integrity issue(s):`,
  );
  lines.push('');

  for (const kind of SECTION_ORDER) {
    const items = report.byKind[kind];
    if (items.length === 0) continue;
    lines.push(`## ${SECTION_HEADERS[kind]} (${items.length})`);
    lines.push('');
    for (const f of items) lines.push(renderFindingLine(f));
    lines.push('');
  }

  lines.push('## Remediation');
  lines.push('');
  if (filterKind) {
    lines.push(REMEDIATION_BY_KIND[filterKind]);
  } else {
    lines.push(REMEDIATION_BROKEN);
    lines.push(REMEDIATION_ORPHAN);
    lines.push(REMEDIATION_STALE_SUPERSEDED);
    lines.push(REMEDIATION_STALE_CONVERTED);
  }
  lines.push('');

  return lines.join('\n');
}
```

### Step 1.5: Run the renderer tests, verify PASS

- [ ] **Step 1.5**

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- render-intelligence-audit.test
```
Expected: ALL renderer tests pass — the 12 pre-existing (Slice 19/30/34.2) plus the 4 new = 16. The pre-existing tests passing confirms the unfiltered path is byte-identical.

### Step 1.6: Do NOT commit

- [ ] **Step 1.6**

```bash
git status --porcelain
```
Expected: three modified files — `store.ts`, `render-intelligence-audit.ts`, `render-intelligence-audit.test.ts`. Task 3 bundles the feat commit.

---

## Task 2: `--filter-kind` option + validation + filter on the CLI

**Files:**
- Modify: `packages/core/src/cli/commands/intelligence.ts`
- Test: `packages/core/tests/cli/intelligence-audit.test.ts`

### Step 2.1: Write the failing CLI tests

- [ ] **Step 2.1**

Append a new nested `describe` inside the top-level `describe('cadence intelligence audit (Slice 19)', ...)` block in `packages/core/tests/cli/intelligence-audit.test.ts`, just before its final closing `});`. The orphan-assumption seeding mirrors the existing AC-11 pattern.

```typescript
  describe('Slice 38: --filter-kind', () => {
    async function plantOrphanAssumption(root: string): Promise<void> {
      const rec = await addRecommendation(root, {
        title: 't', summary: 's', priority: 'medium', readiness: 'raw-idea',
        affectedAreas: [], affectedFiles: [],
      });
      await addAssumption(root, { recommendationId: rec.id, text: 'A' });
      const asPath = join(root, '.cadence/intelligence/assumptions.json');
      const asJson = JSON.parse(await readFile(asPath, 'utf8'));
      asJson.assumptions.push({
        id: 'as-orphan-001',
        recommendationId: 'rec-missing',
        text: 'orphan',
        status: 'open',
        createdAt: '2026-05-20T00:00:00.000Z',
      });
      await writeFile(asPath, JSON.stringify(asJson));
    }

    it('AC-kind-1: --filter-kind matching → only that section, kind-echoed header, exit 1', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(['intelligence', 'audit', '--filter-kind', 'orphan-assumption'], active.root);
      expect(r.code).toBe(1);
      expect(r.stdout).toMatch(/Found 1 integrity issue\(s\) of kind "orphan-assumption":/);
      expect(r.stdout).toMatch(/## Orphan Assumptions \(1\)/);
      expect(r.stdout).toMatch(/as-orphan-001 references missing rec: rec-missing/);
    });

    it('AC-kind-2: --filter-kind with zero of that kind (others present) → echo + exit 0', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(['intelligence', 'audit', '--filter-kind', 'orphan-decision'], active.root);
      expect(r.code).toBe(0);
      expect(r.stdout).toBe('No intelligence audit findings of kind "orphan-decision".\n');
    });

    it('AC-kind-3: --filter-kind matching + --quiet → exit 0, still prints the section', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(
        ['intelligence', 'audit', '--filter-kind', 'orphan-assumption', '--quiet'],
        active.root,
      );
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(/Found 1 integrity issue\(s\) of kind "orphan-assumption":/);
    });

    it('AC-kind-4: --filter-kind + --format json → type-stable narrowed report', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(
        ['intelligence', 'audit', '--filter-kind', 'orphan-assumption', '--format', 'json'],
        active.root,
      );
      expect(r.code).toBe(1);
      const report = JSON.parse(r.stdout);
      expect(report.findings).toHaveLength(1);
      expect(report.findings[0].kind).toBe('orphan-assumption');
      // byKind keeps all 8 keys; only the filtered kind is populated.
      expect(Object.keys(report.byKind)).toHaveLength(8);
      expect(report.byKind['orphan-assumption']).toHaveLength(1);
      expect(report.byKind['broken-assumption-link']).toEqual([]);
      expect(report.byKind['stale-supersededby']).toEqual([]);
    });

    it('AC-kind-5: invalid --filter-kind → exit 1 + allowlist error, no ledgers needed', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      const r = await run(['intelligence', 'audit', '--filter-kind', 'bogus'], active.root);
      expect(r.code).toBe(1);
      expect(r.stdout).toBe('');
      expect(r.stderr).toBe(
        "intelligence audit failed: invalid kind: 'bogus' (allowed: broken-assumption-link, broken-decision-link, broken-evidence-link, orphan-assumption, orphan-decision, orphan-evidence, stale-supersededby, stale-converted-phase)\n",
      );
    });

    it('AC-kind-6: filtered terminal Remediation shows ONLY the relevant family bullet', async () => {
      active = await tempRepo({ initialized: true, projectName: 'slice38' });
      await plantOrphanAssumption(active.root);
      const r = await run(['intelligence', 'audit', '--filter-kind', 'orphan-assumption'], active.root);
      expect(r.stdout).toMatch(/For orphan subjects:/);
      expect(r.stdout).not.toMatch(/For broken rec→subject links:/);
      expect(r.stdout).not.toMatch(/cadence decision reactivate <id>/);
      expect(r.stdout).not.toMatch(/For stale converted-to-phase refs:/);
    });
  });
```

### Step 2.2: Run the build + CLI tests, verify FAIL

- [ ] **Step 2.2**

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence-audit.test
```
Expected: the 6 new tests FAIL — commander rejects the unknown `--filter-kind` option (non-zero exit, AC-kind-1/3/4/6 fail on output/exit assertions; AC-kind-2/5 fail because the expected stdout/stderr aren't produced).

### Step 2.3: Extend the `store.js` import in `intelligence.ts`

- [ ] **Step 2.3**

In `packages/core/src/cli/commands/intelligence.ts`, extend the existing import block (currently lines 5–13) to add `AUDIT_KINDS` (value) and the two types (inline `type` specifiers satisfy `consistent-type-imports`):

```typescript
import {
  AUDIT_KINDS,
  computeIntelligenceAudit,
  computeIntelligenceStats,
  readAssumptionLedger,
  readEvidenceLedger,
  readIntelligenceDecisionLedger,
  readRecommendationLedger,
  runIntelligenceReconcile,
  type AuditKind,
  type IntelligenceAuditReport,
} from '../../intelligence/store.js';
```

### Step 2.4: Add the `--filter-kind` option + action typing

- [ ] **Step 2.4**

Locate the `audit` subcommand registration (currently lines 114–120). Add the new option immediately after the `--format` option line, and add `filterKind?: string` to the action typing. The block becomes:

```typescript
    .command('audit')
    .description(
      'Enumerate integrity issues (broken links + orphan subjects) across the intelligence layer',
    )
    .option('--quiet', 'Exit 0 even when findings are present (script-friendly)', false)
    .option('--format <format>', 'Output format: terminal | json', 'terminal')
    .option(
      '--filter-kind <kind>',
      `Filter audit findings to a single finding kind. Allowed: ${AUDIT_KINDS.join(', ')}.`,
    )
    .action(async (opts: { quiet?: boolean; format?: string; filterKind?: string }) => {
```

### Step 2.5: Add fail-fast validation before any ledger I/O

- [ ] **Step 2.5**

Immediately after the existing `--format` validation block (the `if (format !== 'terminal' && format !== 'json') { … }` that ends at the line `}` before `const root = process.cwd();`, currently line 129), insert the kind validation:

```typescript
        if (
          opts.filterKind !== undefined &&
          !(AUDIT_KINDS as readonly string[]).includes(opts.filterKind)
        ) {
          process.stderr.write(
            `intelligence audit failed: invalid kind: '${opts.filterKind}' (allowed: ${AUDIT_KINDS.join(', ')})\n`,
          );
          process.exitCode = 1;
          return;
        }
```

This runs before the `intelDir` existence check, so a bad kind refuses even in a repo with no ledgers.

### Step 2.6: Narrow the report after compute and feed both outputs

- [ ] **Step 2.6**

Replace the post-compute output block (currently lines 177–186, from `if (format === 'json') {` through the `process.exitCode = 1;` exit-code line) with the version below. It builds `view` (the original report when no filter, else a type-stable narrowing), passes `view` + `filterKind` to the renderer, and bases the exit code on the filtered findings:

```typescript
        const filterKind = opts.filterKind as AuditKind | undefined;
        const view: IntelligenceAuditReport =
          filterKind === undefined
            ? report
            : {
                findings: report.byKind[filterKind],
                byKind: Object.fromEntries(
                  AUDIT_KINDS.map((k) => [k, k === filterKind ? report.byKind[k] : []]),
                ) as IntelligenceAuditReport['byKind'],
              };
        if (format === 'json') {
          process.stdout.write(JSON.stringify(view, null, 2) + '\n');
        } else {
          const md = renderIntelligenceAudit(
            view,
            filterKind === undefined ? undefined : { filterKind },
          );
          process.stdout.write(md);
          if (!md.endsWith('\n')) process.stdout.write('\n');
        }
        if (view.findings.length > 0 && !opts.quiet) {
          process.exitCode = 1;
        }
```

Note: `filterKind` has already been validated in Step 2.5, so the `as AuditKind` cast is sound. The no-dir / all-empty short-circuits earlier in the action are unchanged and still fire before this block.

### Step 2.7: Run the build + CLI tests, verify PASS

- [ ] **Step 2.7**

```bash
pnpm --filter @cadence/core build
pnpm --filter @cadence/core test -- intelligence-audit.test
```
Expected: ALL `intelligence audit` tests pass — the 14 pre-existing (Slice 19/20/34.2) plus the 6 new = 20.

### Step 2.8: Do NOT commit

- [ ] **Step 2.8**

```bash
git status --porcelain
```
Expected: five modified files — `store.ts`, `render-intelligence-audit.ts`, `render-intelligence-audit.test.ts` (Task 1) + `intelligence.ts`, `intelligence-audit.test.ts` (Task 2).

---

## Task 3: Full turbo gate + bundled feat commit

**Files:** None modified directly — validates and commits Tasks 1–2 atomically.

### Step 3.1: Run the full turbo gate

- [ ] **Step 3.1**

```bash
pnpm turbo run lint typecheck test build
```
Expected: **16/16 green**.
- `typecheck` risk: the `Object.fromEntries(...) as IntelligenceAuditReport['byKind']` cast is required (fromEntries returns a loose record). The `(AUDIT_KINDS as readonly string[]).includes(...)` cast is required (`.includes` on the `as const` tuple rejects an arbitrary string arg otherwise).
- `lint` risk: ensure `AuditKind` / `IntelligenceAuditReport` use inline `type` specifiers (consistent-type-imports).

### Step 3.2: Verify no `Co-Authored-By` in the working diff

- [ ] **Step 3.2**

```bash
git diff | grep -c Co-Authored-By
```
Expected: `0`.

### Step 3.3: Sanity-check the diff scope

- [ ] **Step 3.3**

```bash
git status --porcelain
```
Expected exactly five files: `packages/core/src/intelligence/store.ts`, `packages/core/src/intelligence/render-intelligence-audit.ts`, `packages/core/src/cli/commands/intelligence.ts`, `packages/core/tests/intelligence/render-intelligence-audit.test.ts`, `packages/core/tests/cli/intelligence-audit.test.ts`. If anything else appears, STOP and report.

### Step 3.4: Commit the bundled feat

- [ ] **Step 3.4**

```bash
git add \
  packages/core/src/intelligence/store.ts \
  packages/core/src/intelligence/render-intelligence-audit.ts \
  packages/core/src/cli/commands/intelligence.ts \
  packages/core/tests/intelligence/render-intelligence-audit.test.ts \
  packages/core/tests/cli/intelligence-audit.test.ts
git commit -m "$(cat <<'EOF'
feat(core): --filter-kind on intelligence audit (Slice 38)

Add `--filter-kind <kind>` to `cadence intelligence audit` to surface a
single finding kind at a time. Exact single-kind match against the
existing 8-kind taxonomy; strict fail-fast validation (unknown kind
refuses with exit 1, naming the kind + listing the allowed set, before
any ledger I/O).

The filter is applied at the CLI layer after computeIntelligenceAudit
(the pure engine is unchanged). Output is tailored under filter: a
kind-echoed header (Found N integrity issue(s) of kind "<kind>":), only
the matching section, a Remediation block narrowed to the relevant
family bullet, and a house-style empty echo (No intelligence audit
findings of kind "<kind>".). JSON emits a type-stable narrowed report
(all 8 byKind keys present, only the filtered kind populated); null
stays reserved for "no ledgers present". Exit code reflects the filtered
view, so the flag doubles as a script-friendly per-kind probe and
composes with --quiet.

store.ts exports its existing AUDIT_KINDS const (+ a derived AuditKind
type) as the single source of truth for validation and the renderer's
remediation map. renderIntelligenceAudit gains an optional { filterKind }
arg that is byte-identical to the prior output when omitted.

10 new tests (4 renderer + 6 CLI) covering all 7 ACs including the
unfiltered-byte-identical regression guard.

Design source: docs/superpowers/specs/2026-05-28-cadence-audit-filter-kind-design.md
EOF
)"
```

### Step 3.5: Verify the commit body is clean

- [ ] **Step 3.5**

```bash
git log -1 --format=%B | grep -c Co-Authored-By
git log -1 --oneline
git status --porcelain
```
Expected: `0`; top commit reads `<sha> feat(core): --filter-kind on intelligence audit (Slice 38)`; working tree clean. If the count is non-zero, `git commit --amend` to remove the trailer before proceeding.

---

## Task 4: Documentation update

**Files:**
- Modify: `docs/reference/commands.md`

### Step 4.1: Update the `audit` command-row

- [ ] **Step 4.1**

In `docs/reference/commands.md`, find the command-list row (currently line ~962):

```markdown
| `audit [--quiet]` | Enumerate integrity issues (broken links + orphan subjects). Exit 1 on findings unless `--quiet`. |
```

Replace it with:

```markdown
| `audit [--quiet] [--filter-kind <kind>]` | Enumerate integrity issues (broken links + orphan subjects). `--filter-kind` narrows output to one finding kind. Exit 1 on findings unless `--quiet`. |
```

### Step 4.2: Extend the `**audit**` prose paragraph

- [ ] **Step 4.2**

Find the detailed `**`audit`**` paragraph (currently line ~980). It ends with the sentence about `reconcile` repairing broken link arrays. Append the following sentence to the END of that paragraph (same line/block), before the blank line that precedes `**Exit codes**`:

```markdown
 `--filter-kind <kind>` narrows the report to a single finding kind (one of the eight: `broken-assumption-link`, `broken-decision-link`, `broken-evidence-link`, `orphan-assumption`, `orphan-decision`, `orphan-evidence`, `stale-supersededby`, `stale-converted-phase`); an unknown kind refuses with exit 1 naming the allowed set (validated before any ledger read). Under a filter the header echoes the kind (`Found N integrity issue(s) of kind "<kind>":`), only the matching section renders, the Remediation block shows only the relevant family hint, and an empty filtered result prints `No intelligence audit findings of kind "<kind>".` (exit 0; JSON emits the narrowed report — all eight `byKind` keys present, only the filtered kind populated). Filtering composes with `--quiet` (the filtered findings drive the exit code). (Slice 38)
```

### Step 4.3: Sanity-check the doc edits

- [ ] **Step 4.3**

```bash
grep -n "filter-kind" docs/reference/commands.md
```
Expected: at least two matches (the command-row + the prose sentence).

### Step 4.4: Run the full gate

- [ ] **Step 4.4**

```bash
pnpm turbo run lint typecheck test build
```
Expected: **16/16 green** (docs change is inert to tests/build; turbo likely full-cache except nothing rebuilds).

### Step 4.5: Commit the docs

- [ ] **Step 4.5**

```bash
git add docs/reference/commands.md
git commit -m "$(cat <<'EOF'
docs: document --filter-kind on intelligence audit (Slice 38)

Reference docs for the new --filter-kind flag: the command-row now shows
[--filter-kind <kind>], and the audit prose paragraph describes the
8-kind allowlist, fail-fast validation, tailored terminal output
(kind-echoed header, single section, narrowed Remediation, house-style
empty echo), the type-stable narrowed JSON shape, and composition with
--quiet.
EOF
)"
```

### Step 4.6: Verify the docs commit is clean

- [ ] **Step 4.6**

```bash
git log -1 --format=%B | grep -c Co-Authored-By
git log -1 --oneline
git status --porcelain
```
Expected: `0`; top commit reads `<sha> docs: document --filter-kind on intelligence audit (Slice 38)`; working tree clean.

---

## Task 5: Final verification + push

### Step 5.1: Run the full turbo gate

- [ ] **Step 5.1**

```bash
pnpm turbo run lint typecheck test build
```
Expected: **16/16 green**.

### Step 5.2: Confirm the Praxis commit shape

- [ ] **Step 5.2**

```bash
git log --oneline -5
```
Expected (most recent first): `docs: document --filter-kind …` → `feat(core): --filter-kind …` → `docs: Slice 38 implementation plan …` → `docs: design — --filter-kind … (Praxis Slice 38)` → (the Slice 37 docs follow-up commit).

### Step 5.3: Verify `@cadence/core` test count grew by 10

- [ ] **Step 5.3**

```bash
pnpm --filter @cadence/core test 2>&1 | grep -E "Tests.*passed" | tail -1
```
Expected: total passed = **1142** (1132 baseline + 10 new). If the number differs, reconcile against the enumerated tests (4 renderer + 6 CLI) before pushing.

### Step 5.4: Verify no `Co-Authored-By` across the Slice 38 commits

- [ ] **Step 5.4**

```bash
git log --format=%B 398c8aa..HEAD | grep -c Co-Authored-By
```
Expected: `0`. (Scans the design commit's children: plan, feat, docs.) If non-zero, identify and amend the offending commit before pushing:
```bash
for sha in $(git log --format=%H 398c8aa..HEAD); do
  echo "$sha: $(git show -s --format=%B "$sha" | grep -c Co-Authored-By)"
done
```

### Step 5.5: Push and confirm CI green

- [ ] **Step 5.5**

```bash
git push origin main
```
The pre-push hook runs the full local gate; if it fails, fix and retry (do NOT `--no-verify`). Then confirm CI on the self-hosted `cadence-dev` runner:
```bash
gh run list --branch main --limit 1
gh run watch "$(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
```
Expected: CI completes green.

### Step 5.6: Confirm the runner is healthy

- [ ] **Step 5.6**

```bash
gh api repos/manehorizons/cadence/actions/runners --jq '.runners[] | {name, status, busy}'
```
Expected: `cadence-dev` is `online`.

---

## Spec coverage check (self-review)

| Design requirement | Covered by |
|---|---|
| `--filter-kind <kind>` option on `intelligence audit` | Task 2.4 |
| Help string derived from `AUDIT_KINDS` (no drift) | Task 2.4 |
| Strict fail-fast validation, before ledger I/O | Task 2.5; AC-kind-5 (Step 2.1) |
| Exact single-kind match (no aliases/multi) | Single `<kind>` value; validation against `AUDIT_KINDS` |
| CLI-layer post-compute filter (engine pure) | Task 2.6; `computeIntelligenceAudit` untouched |
| Export `AUDIT_KINDS` + `AuditKind` (single source of truth) | Task 1.3 |
| Type-stable narrowed `byKind` (all 8 keys) | Task 2.6 `Object.fromEntries(AUDIT_KINDS.map(...))`; AC-kind-4 |
| Filtered exit code (filtered findings drive exit) | Task 2.6 `view.findings.length`; AC-kind-3 (quiet) |
| Kind-echoed non-empty header | Task 1.4; AC-kind-1 (render + CLI) |
| House-style empty echo (`No … of kind "<kind>".`) | Task 1.4; AC-kind-2 |
| Narrowed Remediation (relevant family bullet only) | Task 1.4 `REMEDIATION_BY_KIND`; AC-kind-6 (render + CLI) |
| JSON empty-filtered = `{findings:[],byKind:{…}}`, not `null` | Task 2.6 (null short-circuit is earlier, unchanged) |
| Unfiltered output byte-identical (regression) | Task 1.4 (omitted param path); AC-kind-7; pre-existing render + CLI tests pass |
| No `@cadence/types` / schema change | No `packages/types` edits in any task |
| No `computeIntelligenceAudit` logic change | `store.ts` edit is export-only (Task 1.3) |
| Docs updated (command-row + prose) | Task 4.1 / 4.2 |
| Praxis four-commit shape | design `398c8aa` → plan (Task 0) → feat (Task 3) → docs (Task 4) |
| No `Co-Authored-By` trailer | Tasks 0.3 / 3.2 / 3.5 / 4.6 / 5.4 |
| 10 new tests (4 renderer + 6 CLI) | Step 1.1 + Step 2.1; count verified Step 5.3 |

**Gaps found:** none. Every design requirement maps to a task or step.
