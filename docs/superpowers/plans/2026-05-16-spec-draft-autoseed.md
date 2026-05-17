# SPEC→DRAFT Auto-Seed (#1b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `cadence draft new <phase> <num>` auto-seeds the new DRAFT's Objective + Acceptance Criteria (lossless, incl. each AC's name) from the sibling same-id `APPROVED` `<id>-SPEC.md`; byte-identical legacy scaffold when no/non-APPROVED/unparseable SPEC; warn+empty fallback, never refuses.

**Architecture:** Additive `name: z.string().default('')` on the shared `AcceptanceCriterionZ` (back-compat — every existing producer → `name: ''`); `spec-parser` populates `name` from the AC head it already captures. New pure `parse/draft-scaffold.ts` exporting `renderDraftBody(phase,id,tier,title,spec?)` (the current inline scaffold literal lifted **verbatim** — byte-identical when `spec` absent) + `frontmatterStatus(raw)`. The `draft new` action probes the sibling `<id>-SPEC.md`, branches on frontmatter status, and delegates body construction to `renderDraftBody`. No `state.json`/`config`/`gates/engine.ts` change; no new flag/loop-position/anomaly.

**Tech Stack:** TypeScript, Zod, commander, vitest, pnpm+turbo monorepo (`@cadence/{core,types}`).

**Execution note (CADENCE dogfood — READ FIRST, overrides per-task git steps):**
Runs as CADENCE phase `38-spec-draft-autoseed` / draft `38-01` on `main` (no worktree — project convention, same override as 32.x–37.1) under the **two-commit-per-phase convention**: ONE substantive commit (src+tests+docs, NOT `.cadence/*`) then ONE `chore: settle …` commit (`.cadence/phases/38-spec-draft-autoseed/*` + STATE + state.json). **Never one commit per task.** Future commits land under the pseudonymous git identity (commits show `nullrook` — do not echo/alter/rewrite).

Per-task "Checkpoint" = stage-and-record, NOT commit: run the verification, `git add` the touched files, then `node packages/core/bin/cadence.cjs build task T<n> --status=DONE --notes "…"`. Do **not** `git commit` until Task 6. **Verify the FULL gate** at Task 6 (`pnpm turbo run lint typecheck test build`) — the pre-push hook is the whole gate, not just `test` (32.2/35.1/36.1/37.1 lesson: the byte-identical scaffold contract + draft-parser round-trips + the Phase 31.1 cli-reference drift guard are invisible to spec/plan review; the full gate is the only safety net). This phase **adds `packages/**` tests** → settle does **NOT** use `--allow-missing-coverage`; the DRAFT's AC tokens `AC-1`…`AC-5` must each literally appear in a test file (the coverage gate greps test globs per AC id; `auto×standard` carries `test-coverage`).

Loop: `node packages/core/bin/cadence.cjs draft new 38-spec-draft-autoseed 01 --title="SPEC→DRAFT auto-seed"` → fill DRAFT (ACs from the bottom section; **auto×standard** default — DO NOT add `profile:`/`requiredSkills:` frontmatter — so no gate fires on this phase's own settle; no bootstrap) → `draft check .cadence/phases/38-spec-draft-autoseed/38-01-DRAFT.md` → `draft approve 38-spec-draft-autoseed 01` → Tasks 1–5 (`build task T<n> --status=DONE` each) → Task 6 (substantive commit → `settle run --auto` → settle commit). Push USER-GATED; also push any already-committed pending spec/plan-doc commits. Survey item #1b — closes #1 fully; after this v1.2 feature-expansion has **no** non-parked work left.

**Self-referential note:** `draft new 38-spec-draft-autoseed 01` runs the *pre-#1b* `draft new` (the feature isn't built yet) → it scaffolds the **empty** DRAFT as today. Fill it by hand from the bottom "Acceptance Criteria (for the cadence DRAFT)" section. (Once shipped, *future* phases that ran `spec new` get the auto-seed; this phase does not, and that's expected.)

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/types/src/plan.ts` | `AcceptanceCriterionZ += name: z.string().default('')` (shared by Spec/Draft/Plan) | Modify |
| `packages/types/tests/spec.test.ts` | AC `name` back-compat (absent→`''`; populated round-trips) | Modify (extend) |
| `packages/core/src/parse/spec-parser.ts` | `parseAcceptanceCriteria` populates `name` from the head it already captures | Modify |
| `packages/core/tests/parse/spec-parser.test.ts` | update the ONE exact `.toEqual` AC expectation to include `name` | Modify |
| `packages/core/src/parse/draft-scaffold.ts` | pure `renderDraftBody` (verbatim legacy literal + seeded branch) + `frontmatterStatus` | **Create** |
| `packages/core/tests/parse/draft-scaffold.test.ts` | pure unit incl. the byte-identical lock (TDD) | **Create** |
| `packages/core/src/cli/commands/draft.ts` | `draft new` probes sibling SPEC, delegates body to `renderDraftBody` | Modify |
| `packages/core/tests/cli/draft-new-seed.test.ts` | integration paths e–h (spawned-CLI) | **Create** |
| `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md` | docs + #1b ✓ | Modify |

**NOT touched (deliberate):** `packages/core/src/parse/draft-parser.ts` — it has the *same* `parseAcceptanceCriteria` shape and also discards the head name; leaving it pushes `{id,given,when,then}` so Zod's `.default('')` fills `name:''` (draft/plan AC name stays `''` — a true no-op, per spec). `packages/types/src/spec.ts` (`SpecZ.acceptanceCriteria` is `z.array(AcceptanceCriterionZ)` — inherits the field, no edit). `packages/types/tests/plan.test.ts` (constructs ACs without `name`, asserts via `.not.toThrow()`/`.toThrow()` only → green via the default). No `state.json`/`config`/`gates/engine.ts`.

---

## Task 1: additive `AcceptanceCriterionZ.name` + back-compat test

**Files:** `packages/types/src/plan.ts`, `packages/types/tests/spec.test.ts`

- [ ] **Step 1: Add the field.** `packages/types/src/plan.ts` — the current schema (lines 5–10):

```ts
export const AcceptanceCriterionZ = z.object({
  id: z.string().regex(/^AC-\d+$/),
  given: z.string(),
  when: z.string(),
  then: z.string(),
});
```

Change to (insert `name` after `id`):

```ts
export const AcceptanceCriterionZ = z.object({
  id: z.string().regex(/^AC-\d+$/),
  name: z.string().default(''),
  given: z.string(),
  when: z.string(),
  then: z.string(),
});
```

(Additive `.default('')` — the 34.1/35.1/36.1 additive-zod precedent. Every existing producer that builds `{id,given,when,then}` keeps working: Zod fills `name:''`. `SpecZ`/`DraftZ`/`PlanZ` all use `z.array(AcceptanceCriterionZ)` → inherit. Do NOT touch `TaskZ` or anything else in the file.)

- [ ] **Step 2: Extend back-compat test.** `packages/types/tests/spec.test.ts` — after the existing `it('AC-2: reuses AcceptanceCriterionZ shape (rejects AC missing then)', …)` block (ends ~line 30, before the closing `});` of the describe), insert. **Test names MUST contain the token `AC-4`** (coverage gate):

```ts
  it('AC-4: AC without name defaults to "" (back-compat)', () => {
    const parsed = SpecZ.parse(valid);
    expect(parsed.acceptanceCriteria[0]!.name).toBe('');
  });
  it('AC-4: a populated AC name round-trips', () => {
    const parsed = SpecZ.parse({
      ...valid,
      acceptanceCriteria: [
        { id: 'AC-1', name: 'convergence wrap', given: 'g', when: 'w', then: 't' },
      ],
    });
    expect(parsed.acceptanceCriteria[0]!.name).toBe('convergence wrap');
  });
```

(`valid` at `spec.test.ts:4` builds an AC `{id,given,when,then}` with no `name` — proves the default. Existing `it('AC-2: accepts a minimal valid spec')` stays green: `SpecZ.parse(valid)` now fills `name:''`, still `.not.toThrow()`.)

- [ ] **Step 3:** Run: `pnpm -C packages/types test && pnpm -C packages/types build`
  Expected: all green incl. the 2 new `AC-4` cases; clean tsc; `dist/` rebuilt.

- [ ] **Step 4: Checkpoint (stage only — NO commit)**

```bash
git add packages/types/src/plan.ts packages/types/tests/spec.test.ts
```

Then: `node packages/core/bin/cadence.cjs build task T1 --status=DONE --notes "AcceptanceCriterionZ += name (additive default ''); spec.test back-compat + populated round-trip (AC-4)"`

---

## Task 2: `spec-parser` populates `name` + update the one existing test

**Files:** `packages/core/src/parse/spec-parser.ts`, `packages/core/tests/parse/spec-parser.test.ts`

- [ ] **Step 1: Populate `name`.** `packages/core/src/parse/spec-parser.ts` — in `parseAcceptanceCriteria`, the per-AC push currently reads:

```ts
    const id = head[1]!;
    const given = /Given\s+(.+)/.exec(block)?.[1]?.trim() ?? '';
    const when = /When\s+(.+)/.exec(block)?.[1]?.trim() ?? '';
    const then = /Then\s+(.+)/.exec(block)?.[1]?.trim() ?? '';
    out.push({ id, given, when, then });
```

Change to (the head regex `/^### (AC-\d+):\s*(.*)$/m` in `parseAcceptanceCriteria` already captures the name in group 2 — `head[2]` — just use it):

```ts
    const id = head[1]!;
    const name = head[2]?.trim() ?? '';
    const given = /Given\s+(.+)/.exec(block)?.[1]?.trim() ?? '';
    const when = /When\s+(.+)/.exec(block)?.[1]?.trim() ?? '';
    const then = /Then\s+(.+)/.exec(block)?.[1]?.trim() ?? '';
    out.push({ id, name, given, when, then });
```

(Only `spec-parser.ts` changes. `draft-parser.ts` has the identical shape but is **left unchanged** — its ACs stay `{id,given,when,then}` → Zod fills `name:''`, a deliberate no-op per spec.)

- [ ] **Step 2: Update the ONE existing test.** `packages/core/tests/parse/spec-parser.test.ts:37` — the fixture's AC head is `### AC-1: a` (line 18, name = `a`). Current line 37:

```ts
    expect(s.acceptanceCriteria).toEqual([{ id: 'AC-1', given: 'g', when: 'w', then: 't' }]);
```

Change to (Vitest `.toEqual` is exact recursive equality — the now-populated `name` must be in the expectation):

```ts
    expect(s.acceptanceCriteria).toEqual([{ id: 'AC-1', name: 'a', given: 'g', when: 'w', then: 't' }]);
```

This is the **only** existing test that changes (it doubles as the parseSpecMd populate-path lock). The second test in the file (`it('AC-2: absent optional sections → []')`) asserts only `constraints`/`openQuestions` → stays green. (Coverage-token note: this DRAFT's `AC-4` token is supplied by the two `it('AC-4: …')` cases added to `spec.test.ts` in Task 1 — this `spec-parser.test.ts` change adds no `AC-4` token and is not relied on for AC-4 coverage; it is purely the populate-path lock.)

- [ ] **Step 3:** Run: `pnpm -C packages/core build && pnpm -C packages/core test -- run parse/spec-parser`
  Expected: clean tsc; both `parseSpecMd` cases PASS (the updated `.toEqual` now matches `name:'a'`).

- [ ] **Step 4: Checkpoint** — `git add packages/core/src/parse/spec-parser.ts packages/core/tests/parse/spec-parser.test.ts` ; `node packages/core/bin/cadence.cjs build task T2 --status=DONE --notes "spec-parser populates AC name from head[2]; updated the one exact-.toEqual spec-parser test (AC-4)"`

---

## Task 3: pure `draft-scaffold.ts` (`renderDraftBody` + `frontmatterStatus`) — TDD + byte-identical lock

**Files:** Create `packages/core/src/parse/draft-scaffold.ts` + `packages/core/tests/parse/draft-scaffold.test.ts`

- [ ] **Step 1: Write failing tests** — `packages/core/tests/parse/draft-scaffold.test.ts`. The `LEGACY` constant below is the pre-#1b inline scaffold from `draft.ts:77` reproduced **verbatim** (with sample args) — it is the byte-identical regression contract. Test names carry `AC-1`:

```ts
import { describe, it, expect } from 'vitest';
import { renderDraftBody, frontmatterStatus } from '../../src/parse/draft-scaffold.js';
import type { Spec } from '@cadence/types';

// Verbatim pre-#1b scaffold (draft.ts:77) for phase='p' id='99-01' tier='standard' title='T'.
const LEGACY =
  `---\nphase: p\nid: 99-01\ntier: standard\nstatus: PENDING\n---\n\n` +
  `# 99-01 — T\n\n## Objective\n\n_(one sentence)_\n\n` +
  `## Acceptance Criteria\n\n### AC-1: _(name)_\nGiven _(precondition)_\nWhen _(action)_\nThen _(outcome)_\n\n` +
  `## Tasks\n\n### T1: _(task name)_\n- files: \`path/to/file.ts\`\n- action: _(what to do)_\n- verify: _(how to verify)_\n- done: AC-1\n\n` +
  `## Boundaries\n\n- _(DO NOT change …)_\n`;

const spec1: Spec = {
  schemaVersion: 1, id: '99-01', phase: 'p',
  objective: 'Build the widget.',
  acceptanceCriteria: [{ id: 'AC-1', name: 'happy path', given: 'a fresh repo', when: 'run it', then: 'it works' }],
  constraints: [], openQuestions: [], status: 'APPROVED',
};

describe('renderDraftBody (AC-1)', () => {
  it('AC-1: no spec → byte-identical to the legacy scaffold', () => {
    expect(renderDraftBody('p', '99-01', 'standard', 'T')).toBe(LEGACY);
  });
  it('AC-1: spec → seeds objective + AC (id, name, GWT); tasks/boundaries placeholder; title from arg', () => {
    const out = renderDraftBody('p', '99-01', 'standard', 'My Title', spec1);
    expect(out).toContain('## Objective\n\nBuild the widget.\n');
    expect(out).toContain('### AC-1: happy path\nGiven a fresh repo\nWhen run it\nThen it works');
    expect(out).toContain('# 99-01 — My Title\n');               // title = arg, not spec
    expect(out).toContain('### T1: _(task name)_');               // tasks still placeholder
    expect(out).toContain('## Boundaries\n\n- _(DO NOT change …)_\n');
    expect(out).not.toContain('_(one sentence)_');
  });
  it('AC-1: multiple ACs render in order, blank-line separated', () => {
    const s: Spec = { ...spec1, acceptanceCriteria: [
      { id: 'AC-1', name: 'one', given: 'g1', when: 'w1', then: 't1' },
      { id: 'AC-2', name: 'two', given: 'g2', when: 'w2', then: 't2' },
    ]};
    const out = renderDraftBody('p', '99-01', 'standard', 'T', s);
    expect(out).toContain('### AC-1: one\nGiven g1\nWhen w1\nThen t1\n\n### AC-2: two\nGiven g2\nWhen w2\nThen t2\n\n## Tasks');
  });
  it('AC-1: empty AC name → "### AC-1: " (no junk)', () => {
    const s: Spec = { ...spec1, acceptanceCriteria: [{ id: 'AC-1', name: '', given: 'g', when: 'w', then: 't' }] };
    expect(renderDraftBody('p', '99-01', 'standard', 'T', s)).toContain('### AC-1: \nGiven g');
  });
});

describe('frontmatterStatus (AC-1)', () => {
  it('AC-1: reads status from frontmatter', () => {
    expect(frontmatterStatus('---\nphase: p\nid: 99-01\nstatus: APPROVED\n---\n\n# x')).toBe('APPROVED');
    expect(frontmatterStatus('---\nstatus: PENDING\n---\n')).toBe('PENDING');
  });
  it('AC-1: no frontmatter / no status → undefined', () => {
    expect(frontmatterStatus('# no frontmatter')).toBeUndefined();
    expect(frontmatterStatus('---\nphase: p\n---\n')).toBeUndefined();
  });
});
```

- [ ] **Step 2:** Run: `pnpm -C packages/core test -- run parse/draft-scaffold`
  Expected: FAIL (module `draft-scaffold` missing).

- [ ] **Step 3: Implement** `packages/core/src/parse/draft-scaffold.ts`:

```ts
import type { Spec } from '@cadence/types';

/**
 * Phase 38.1 (#1b) — pure DRAFT.md body renderer. The `spec`-absent branch is
 * a VERBATIM lift of the pre-#1b inline scaffold (was `draft.ts`'s
 * `const body = \`…\``) and MUST stay byte-identical (existing `draft new` /
 * `draft check` / draft-parser round-trips depend on the exact bytes — the
 * unit test locks this). With a `spec`, only `## Objective` and the
 * `## Acceptance Criteria` block are seeded; Tasks/Boundaries stay placeholder
 * and the title is always the caller's arg (never the SPEC title).
 */
export function renderDraftBody(
  phase: string,
  id: string,
  tier: string,
  title: string,
  spec?: Spec,
): string {
  const objective = spec ? spec.objective : '_(one sentence)_';
  const acBlock = spec
    ? spec.acceptanceCriteria
        .map(
          (ac) =>
            `### ${ac.id}: ${ac.name}\nGiven ${ac.given}\nWhen ${ac.when}\nThen ${ac.then}`,
        )
        .join('\n\n')
    : '### AC-1: _(name)_\nGiven _(precondition)_\nWhen _(action)_\nThen _(outcome)_';
  return (
    `---\nphase: ${phase}\nid: ${id}\ntier: ${tier}\nstatus: PENDING\n---\n\n` +
    `# ${id} — ${title}\n\n` +
    `## Objective\n\n${objective}\n\n` +
    `## Acceptance Criteria\n\n${acBlock}\n\n` +
    `## Tasks\n\n### T1: _(task name)_\n- files: \`path/to/file.ts\`\n- action: _(what to do)_\n- verify: _(how to verify)_\n- done: AC-1\n\n` +
    `## Boundaries\n\n- _(DO NOT change …)_\n`
  );
}

/** First-frontmatter-block `status:` value, trimmed; undefined if absent. */
export function frontmatterStatus(raw: string): string | undefined {
  const fm = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (!fm) return undefined;
  return /(^|\n)status:\s*(.+)/.exec(fm[1]!)?.[2]?.trim();
}
```

- [ ] **Step 4:** Run: `pnpm -C packages/core build && pnpm -C packages/core test -- run parse/draft-scaffold`
  Expected: clean tsc; all cases PASS (the **byte-identical lock** green — proves the verbatim lift).

- [ ] **Step 5: Checkpoint** — `git add packages/core/src/parse/draft-scaffold.ts packages/core/tests/parse/draft-scaffold.test.ts` ; `node packages/core/bin/cadence.cjs build task T3 --status=DONE --notes "pure renderDraftBody (verbatim legacy lift + seeded branch) + frontmatterStatus; byte-identical lock + seed unit tests TDD (AC-1)"`

---

## Task 4: wire `draft new` probe + integration

**Files:** Modify `packages/core/src/cli/commands/draft.ts`; create `packages/core/tests/cli/draft-new-seed.test.ts`

- [ ] **Step 1: Imports.** `draft.ts` already imports `readFile` (line 2: `import { readFile, mkdir, writeFile } from 'node:fs/promises';`), `existsSync` (3), `join` (4) — add NO duplicates. Add ONLY these two new imports (e.g. after line 6 `import { parseDraftMd } from '../../parse/draft-parser.js';`):

```ts
import { parseSpecMd } from '../../parse/spec-parser.js';
import { renderDraftBody, frontmatterStatus } from '../../parse/draft-scaffold.js';
```

- [ ] **Step 2: Replace the inline scaffold with the probe.** In the `draft new` action, the current `draft.ts:77` is the single line:

```ts
        const body = `---\nphase: ${phase}\nid: ${id}\ntier: ${opts.tier}\nstatus: PENDING\n---\n\n# ${id} — ${opts.title}\n\n## Objective\n\n_(one sentence)_\n\n## Acceptance Criteria\n\n### AC-1: _(name)_\nGiven _(precondition)_\nWhen _(action)_\nThen _(outcome)_\n\n## Tasks\n\n### T1: _(task name)_\n- files: \`path/to/file.ts\`\n- action: _(what to do)_\n- verify: _(how to verify)_\n- done: AC-1\n\n## Boundaries\n\n- _(DO NOT change …)_\n`;
```

Replace **that one line** with (everything above — the `id`/`dir`/`path`/`existsSync(path)`-exit-2 guard at `draft.ts:67–75` and `await mkdir(dir,…)` at 76 — and below — `await writeFile(path, body);` at 78, the state transitions 80–87, `console.log(\`Created ${path}\`)` 89 — stays UNCHANGED; note `dir`, `id`, `opts.tier`, `opts.title` are all already in scope):

```ts
        const specPath = join(dir, `${id}-SPEC.md`);
        let body: string;
        if (existsSync(specPath)) {
          const rawSpec = await readFile(specPath, 'utf8');
          if (frontmatterStatus(rawSpec) === 'APPROVED') {
            try {
              const spec = parseSpecMd(rawSpec);
              body = renderDraftBody(phase, id, opts.tier, opts.title, spec);
              console.log(
                `draft new: seeded objective + ${spec.acceptanceCriteria.length} AC(s) from approved SPEC ${id}`,
              );
            } catch (err) {
              process.stderr.write(
                `draft new: SPEC ${id} APPROVED but unparseable (${err instanceof Error ? err.message : String(err)}) — scaffolding empty\n`,
              );
              body = renderDraftBody(phase, id, opts.tier, opts.title);
            }
          } else {
            process.stderr.write(
              `draft new: SPEC ${id} present but not APPROVED — scaffolding empty\n`,
            );
            body = renderDraftBody(phase, id, opts.tier, opts.title);
          }
        } else {
          body = renderDraftBody(phase, id, opts.tier, opts.title);
        }
```

(`dir = join(cwd,'.cadence','phases',phase)` is `draft.ts:67`; `${id}-SPEC.md` is the strict same-id sibling — identical id derivation to `spec new`. No new flag; no refusal path; the existing `existsSync(path)`-DRAFT-exists exit-2 guard above is untouched so seeding only ever runs on a fresh scaffold; state transitions unchanged.)

- [ ] **Step 3:** Run: `pnpm -C packages/core build`
  Expected: clean tsc.

- [ ] **Step 4: Write integration tests** — `packages/core/tests/cli/draft-new-seed.test.ts`, spawned-CLI idiom (mirror an existing `tests/cli/*` harness — `tempRepo`, spawned `run()`, `initGitRepo`; reuse the exact `run`/`initGitRepo` helpers from `tests/cli/settle-code-review.test.ts`). Describe `{ timeout: 60_000 }` (spawned-CLI/5s-default flake lesson). **First line of the file:**

```ts
// AC-5 is covered by the Task 5 docs changes (DESIGN §10 + §4.1 Spec-stage
// note, CHANGELOG, .cadence/ROADMAP.md); no runtime assertion — this token
// satisfies the per-AC test-coverage grep for the docs-only criterion.
```

Helper to write a SPEC at the sibling path (the CLI derives `id = ${phase.slice(0,2)}-${padded}`; for `phase='01-foundation' num='01'` → `id='01-01'`, sibling `.cadence/phases/01-foundation/01-01-SPEC.md`). Cases (each `it` name carries its AC token):

  - **(e)** `it('AC-2: approved same-id SPEC → DRAFT seeded + stdout notice', …)`: `tempRepo({initialized:true})`; write `.cadence/phases/01-foundation/01-01-SPEC.md` with frontmatter `status: APPROVED` and a real Objective + 2 ACs (`### AC-1: alpha` / `### AC-2: beta` with Given/When/Then); `draft new 01-foundation 01 --title=Demo`; assert `code===0`; stdout matches `/draft new: seeded objective \+ 2 AC\(s\) from approved SPEC 01-01/`; read `.cadence/phases/01-foundation/01-01-DRAFT.md` → contains the SPEC objective line, `### AC-1: alpha\nGiven …`, `### AC-2: beta`, and still `### T1: _(task name)_` + `## Boundaries\n\n- _(DO NOT change …)_`.
  - **(f)** `it('AC-3: PENDING sibling SPEC → warn + empty scaffold', …)`: same but SPEC frontmatter `status: PENDING`; assert `code===0`; stderr matches `/draft new: SPEC 01-01 present but not APPROVED — scaffolding empty/`; DRAFT contains `## Objective\n\n_(one sentence)_` and `### AC-1: _(name)_`.
  - **(g)** `it('AC-3: APPROVED but unparseable SPEC → warn + empty scaffold', …)`: write the sibling SPEC with frontmatter `phase: 01-foundation\nid: nope\nstatus: APPROVED` (an **invalid `id`** — not `\d{2}-\d{2}`) plus any minimal body. This is the reliable fixture: `frontmatterStatus` keys only off the `status:` line so it returns `'APPROVED'` (probe enters the APPROVED branch), but `parseSpecMd` runs `SpecZ.parse` which **rejects the bad `id`** and throws → the `catch` fires. Assert `code===0`; stderr matches `/draft new: SPEC 01-01 APPROVED but unparseable .* — scaffolding empty/`; DRAFT = empty placeholder. **Do NOT use a "no `## Objective`/no `### AC-`" body — that parses successfully** (objective `''`, ACs `[]`, no throw); **and do NOT omit the frontmatter** — then `frontmatterStatus` returns `undefined` and the probe takes the *not-APPROVED* branch (case f), not the unparseable `catch`. Verify by running that stderr is the `unparseable` line, not the `not APPROVED` line.
  - **(h)** `it('AC-3: no sibling SPEC → empty scaffold, silent (unchanged)', …)`: no SPEC file; `draft new 01-foundation 01 --title=Demo`; assert `code===0`; stderr has NO `draft new: SPEC` line; DRAFT = empty placeholder (today's behavior preserved).

- [ ] **Step 5:** Run: `pnpm -C packages/core build && pnpm -C packages/core test -- run cli/draft-new-seed parse/draft-scaffold parse/spec-parser`
  Expected: new integration suite + draft-scaffold + spec-parser all green.

- [ ] **Step 6: Regression — existing suites unchanged.** Run: `pnpm -C packages/core test -- run parse/draft-parser cli/draft`
  Expected: existing draft-parser and draft-command tests PASS with **zero edits** (draft AC `name` stays `''` via the Zod default; the no-spec `renderDraftBody` output is byte-identical to the old inline literal). If anything here fails: STOP — the verbatim lift was not byte-identical; re-check Task 3 `renderDraftBody` against `draft.ts:77`.

- [ ] **Step 7: Checkpoint** — `git add packages/core/src/cli/commands/draft.ts packages/core/tests/cli/draft-new-seed.test.ts` ; `node packages/core/bin/cadence.cjs build task T4 --status=DONE --notes "draft new probes sibling same-id SPEC → renderDraftBody seed/fallback (approved/PENDING/unparseable/absent); 4-path integration (AC-2/3); existing draft-parser+draft tests green unchanged"`

---

## Task 5: docs + ROADMAP

**Files:** `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`

> Numbering-drift caution (35.1/36.1/37.1 lesson): the §10 punchlist number increments per phase. Do NOT hardcode — first read the actual last item (`grep -nE '^3[0-9]\.' DESIGN.md | tail -3`); #1b is the next integer after the Phase 37.1 item (≈ 39). Anchor the §4.1 edit on the existing **Spec stage (Phase 36.1)** blockquote; CHANGELOG at the END of `## [Unreleased] → ### Added`.

- [ ] **Step 1: DESIGN.md §10** — append a new item after the current last (`~~Phase 37.1 …~~ ✓`, item 38), before the blank line preceding `Sequencing rationale:` (use the next integer):

```
39. ~~Phase 38.1 (v1.2 feature-expansion #1b — closes #1) — SPEC→DRAFT auto-seed: `cadence draft new` reads the sibling same-id `APPROVED` `<id>-SPEC.md` and pre-fills the DRAFT Objective + ACs (lossless incl. AC name) via a pure `renderDraftBody`; byte-identical legacy scaffold when no/non-APPROVED/unparseable SPEC; warn+empty fallback, never refuses. Additive `AcceptanceCriterionZ.name` (back-compat default); no state.json/config/gate change~~ ✓
```

- [ ] **Step 2: DESIGN.md §4.1 — update the Spec-stage note.** Find the existing `> **Spec stage (Phase 36.1)** …` blockquote and replace its trailing sentence `The SPEC→DRAFT content auto-seed is deferred (#1b).` with:

```
The SPEC→DRAFT content auto-seed is delivered (Phase 38.1, #1b): `draft new` reads the sibling same-id `APPROVED` SPEC and pre-fills the DRAFT Objective + ACs (lossless, via a pure `renderDraftBody`; byte-identical legacy scaffold otherwise).
```

- [ ] **Step 3: CHANGELOG.md** — at the END of `## [Unreleased] → ### Added` (after the Phase 37.1 code-review-convergence bullet, before the blank line preceding `### Fixed`), append:

```
- SPEC→DRAFT auto-seed: `cadence draft new <phase> <num>` now pre-fills the new DRAFT's Objective + Acceptance Criteria from the sibling **same-id** `APPROVED` `<id>-SPEC.md` (lossless — each AC's name is carried via a new additive `AcceptanceCriterionZ.name`, default `''`, back-compat for every existing Spec/Draft/Plan consumer). Body construction moved to a pure `renderDraftBody`; with no / non-`APPROVED` / unparseable sibling SPEC it is **byte-identical** to the previous scaffold and warns to stderr (never refuses, no new flag, no state/config/gate change). Closes survey #1 fully (the auto-seed deferred from #1's minimal v1 as #1b); v1.2 feature-expansion now has no non-parked work remaining. (Phase 38.1.)
```

- [ ] **Step 4: `.cadence/ROADMAP.md`** — in `## v1.2.0 — Feature expansion (superpowers-inspired)`: (i) replace the `- **#1b SPEC→DRAFT auto-seed** — …` line with `- **#1b SPEC→DRAFT auto-seed** — ✓ **delivered Phase 38.1** (\`draft new\` reads the sibling same-id APPROVED SPEC → pre-fills DRAFT Objective + ACs via pure \`renderDraftBody\`; additive \`AcceptanceCriterionZ.name\`; byte-identical legacy fallback). Closes #1 fully.`; (ii) replace the `Sequence: …` line with `Sequence: #6 ✓ → #2 ✓ → #1 ✓ → #4 ✓ → #1b ✓ ; #3/#5 parked (host-agnostic-anchor conflict). v1.2 feature-expansion COMPLETE — no non-parked work remains.`

- [ ] **Step 5:** Run: `git diff --stat -- DESIGN.md CHANGELOG.md .cadence/ROADMAP.md`
  Expected: exactly those 3 files; eyeball `git diff .cadence/ROADMAP.md` (both edits present).

- [ ] **Step 6: Checkpoint** — `git add DESIGN.md CHANGELOG.md .cadence/ROADMAP.md` ; `node packages/core/bin/cadence.cjs build task T5 --status=DONE --notes "DESIGN §10 item + §4.1 Spec-stage note (#1b delivered); CHANGELOG Added; ROADMAP #1b ✓ / sequence COMPLETE (AC-5)"`

---

## Task 6: full gate + two-commit settle

**Files:** none new — consolidates T1–T5.

- [ ] **Step 1: Confirm staging.** Run: `git diff --cached --name-only`
  Expected EXACTLY: `packages/types/src/plan.ts`, `packages/types/tests/spec.test.ts`, `packages/core/src/parse/spec-parser.ts`, `packages/core/tests/parse/spec-parser.test.ts`, `packages/core/src/parse/draft-scaffold.ts`, `packages/core/tests/parse/draft-scaffold.test.ts`, `packages/core/src/cli/commands/draft.ts`, `packages/core/tests/cli/draft-new-seed.test.ts`, `DESIGN.md`, `CHANGELOG.md`, `.cadence/ROADMAP.md`. **Nothing under `.cadence/phases/`, STATE, state.json.** `graphify-out/` stays untracked.

- [ ] **Step 2: Full pre-push gate** (32.2/35.1/36.1/37.1 lesson — the WHOLE hook; catches the byte-identical scaffold contract + draft-parser round-trips + the cli-reference drift guard, all invisible to spec/plan review):

Run: `pnpm install && pnpm -C packages/types build && pnpm -C packages/core build && pnpm turbo run lint typecheck test build`
Expected: 16/16 green. New `packages/**` tests satisfy `test-coverage`; do **NOT** pass `--allow-missing-coverage`. (No new top-level CLI command → cli-reference drift guard unaffected; full gate confirms.)

- [ ] **Step 3: Substantive commit:**

```bash
git commit -m "$(cat <<'EOF'
feat(core+types): SPEC→DRAFT auto-seed (Phase 38.1, v1.2 #1b)

`cadence draft new <phase> <num>` now pre-fills the new DRAFT's Objective +
Acceptance Criteria from the sibling same-id APPROVED <id>-SPEC.md, lossless
incl. each AC's name. AcceptanceCriterionZ gains an additive
name: z.string().default('') (shared by Spec/Draft/Plan — back-compat, every
existing producer → name:''); spec-parser populates it from the AC head it
already captured (the one existing exact-.toEqual spec-parser test updated
accordingly; draft-parser/types-pkg tests unchanged). Body construction
moved to a pure renderDraftBody (parse/draft-scaffold.ts) — byte-identical
to the prior inline scaffold when there is no / non-APPROVED / unparseable
sibling SPEC (regression-locked by a unit test). Probe warns to stderr and
falls back to the empty scaffold; never refuses, no new flag, no
state/config/gate change. Closes survey #1 fully (#1b was the auto-seed
deferred from #1's minimal v1); v1.2 feature-expansion has no non-parked
work remaining. Full `pnpm turbo run lint typecheck test build` green.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Settle:** Run: `node packages/core/bin/cadence.cjs settle run --auto`
  (NO `--allow-missing-coverage` — adds `packages/**` tests. `38-01` is `auto×standard`; no gate bootstraps on its own settle. `--allow-stale-draft` only if the DRAFT was edited after `draft approve`.)
  Expected: `Settled 38-01`; loop IDLE.

- [ ] **Step 5: Settle commit:**

```bash
git add .cadence/phases/38-spec-draft-autoseed/ .cadence/STATE.md .cadence/state.json
git commit -m "chore: settle Phase 38.1 — SPEC→DRAFT auto-seed"
```

- [ ] **Step 6: Verify + surface push (USER-GATED — stop and ask).** Run: `git log --oneline -6` (feat+settle pair under `nullrook`, plus any pending spec/plan-doc `docs:` commits), `node packages/core/bin/cadence.cjs progress` (IDLE), `git rev-list --count origin/main..HEAD`. Report green + the commits-ahead list; do **NOT** push without explicit user confirmation (auto-mode classifier blocks direct `main` push; the user's `Bash(git push:*)` allow rule lets a confirmed retry through — the pre-push hook self-allows when the full gate is green).

---

## Done criteria

- `AcceptanceCriterionZ` has additive `name: z.string().default('')`; every existing Spec/Draft/Plan producer/consumer back-compat (`name:''`); only `spec-parser.test.ts`'s one exact-`.toEqual` AC expectation changed; draft-parser/types-package tests green unchanged.
- `spec-parser` populates `name` from the AC head; `draft-parser` deliberately untouched (draft AC `name` stays `''`).
- Pure `renderDraftBody(phase,id,tier,title,spec?)`: no spec → **byte-identical** to the pre-#1b inline scaffold (unit-locked); spec → Objective + ACs (id/name/GWT) seeded, Tasks/Boundaries placeholder, title from arg. `frontmatterStatus` pure + tested.
- `draft new` seeds from the sibling **same-id** `APPROVED` SPEC with a stdout notice; PENDING/unparseable → stderr warn + empty scaffold; absent → silent empty (unchanged); never refuses; state transitions unchanged; no new flag.
- DESIGN §10 item + §4.1 Spec-stage note (#1b delivered); CHANGELOG Added; ROADMAP #1b ✓, sequence `#6✓→#2✓→#1✓→#4✓→#1b✓` COMPLETE.
- Full `pnpm turbo run lint typecheck test build` green; settled two-commit (no `--allow-missing-coverage`). Push user-gated.

## Acceptance Criteria (for the cadence DRAFT — `38-01` is auto×standard; DO NOT add `requiredSkills`/`profile` frontmatter)

- **AC-1:** pure `renderDraftBody(phase,id,tier,title,spec?)` in `parse/draft-scaffold.ts` — `spec` absent → **byte-identical** to the pre-#1b inline scaffold; `spec` set → `## Objective` = `spec.objective`, `## Acceptance Criteria` = each `### <id>: <name>` + Given/When/Then, Tasks/Boundaries placeholder, title from the arg; `frontmatterStatus(raw)` returns the frontmatter status (undefined if none).
- **AC-2:** `draft new` seeds Objective + ACs from the sibling **same-id** `APPROVED` `<id>-SPEC.md` (`parseSpecMd`) and prints `draft new: seeded objective + N AC(s) from approved SPEC <id>`.
- **AC-3:** non-`APPROVED` sibling SPEC → stderr `present but not APPROVED — scaffolding empty` + empty scaffold; `APPROVED` but `parseSpecMd` throws → stderr `APPROVED but unparseable … — scaffolding empty` + empty scaffold; absent SPEC → empty scaffold, silent; `draft new` never refuses due to a SPEC; state transitions unchanged in all cases.
- **AC-4:** `AcceptanceCriterionZ` gains additive `name: z.string().default('')` (back-compat — old Spec/Draft/Plan files & every existing runtime AC producer/consumer → `name:''`, no runtime behavior change); `parseSpecMd` populates `name` from the AC head; the one existing exact-`.toEqual` `spec-parser.test.ts` expectation is updated; draft-parser/types-package tests unchanged; no `state.json`/`config`/`gates/engine.ts` change, no new flag/loop-position/anomaly.
- **AC-5:** DESIGN (§10 punchlist item + §4.1 Spec-stage note updated — #1b delivered, no longer "deferred"), CHANGELOG (Added), ROADMAP (#1b ✓ delivered Phase 38.1; #1 fully delivered; sequence `#6✓→#2✓→#1✓→#4✓→#1b✓`; v1.2 feature-expansion COMPLETE, only #3/#5 parked + the deferred "Public release" track remain).
