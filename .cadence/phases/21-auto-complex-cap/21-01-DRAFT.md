---
phase: 21-auto-complex-cap
id: 21-01
tier: standard
status: APPROVED
---

# 21-01 — Enforce auto × complex soft cap (M2)

## Objective

DESIGN.md §4 decision M2 locked: "Soft cap. Refuse by default; override with `--allow-auto-complex`." The engine (`gatesFor(...)`) already returns `gateSet.softCap = true` for the `auto × complex` cell, but nothing reads that flag — settle and `draft approve` happily proceed today. Wire the soft-refuse at both entry points so the locked decision is honored. The runaway-LLM scenario (high blast radius + zero supervision) deserves at least one explicit "yes I know" gate.

## Acceptance Criteria

### AC-1: `cadence settle run` refuses on auto × complex without override
Given an active draft whose effective `(tier, profile)` resolves to `(complex, auto)` (e.g., `tier: complex` in DRAFT frontmatter + default `auto` profile from `.cadence/config.json`)
When `cadence settle run` (with or without `--auto`) is invoked
Then settle refuses with exit 1, prints `settle run refused: auto × complex is soft-capped (DESIGN.md §4 M2). Pass --allow-auto-complex to override.` to stderr, and does not write a SUMMARY or transition state. Loop position remains `BUILD`. The check runs before the coverage / deep / interactive gates so wasted work is avoided.

### AC-2: `--allow-auto-complex` bypasses the cap
Given the same `(complex, auto)` draft
When `cadence settle run --allow-auto-complex` is invoked (alone or with `--auto` / `--force` / other flags)
Then settle proceeds normally through the rest of the gate chain. The override is per-invocation only — it does not flip any persistent state. The override is also logged once to stderr at INFO level: `settle: --allow-auto-complex set; proceeding past soft cap (auto × complex).` so the user (and any audit log following stderr) sees the explicit bypass.

### AC-3: `cadence draft approve` refuses on auto × complex without override
Given a PENDING draft whose `(tier, profile)` resolves to `(complex, auto)`
When `cadence draft approve <phase> <num>` is invoked
Then approve refuses with exit 1, prints `draft approve refused: auto × complex is soft-capped (DESIGN.md §4 M2). Pass --allow-auto-complex to override, or bump the draft's profile to standard/strict.` to stderr, leaves `loopPosition` at IDLE (or whatever it was), and does not transition the draft to APPROVED. `--allow-auto-complex` on the approve subcommand bypasses identically to AC-2. Profile override in DRAFT frontmatter (e.g., `profile: standard`) is the cleaner alternative and is unaffected.

### AC-4: Other (tier × profile) cells unchanged
Given any cell where the effective `gateSet.softCap` is `false` — i.e., everything except `auto × complex`
When settle or approve runs
Then no new refusal fires. `--allow-auto-complex` is a no-op outside the capped cell (accepted but does nothing). The standard / strict profiles never trigger this gate at any tier.

### AC-5: docs + dogfood
Given Phase 21.1 lands
When the suite runs and DESIGN.md is read
Then ~388 tests + ~6-8 new soft-cap tests pass. DESIGN.md §4 M2's "Cap shape" row keeps the "Soft cap" decision but adds `**Shipped — Phase 21.1.**` to the rationale cell. §10 punchlist gains a `Phase 21.1 — auto × complex soft cap` tick. AC-1..AC-5 each referenced by ≥1 test file. Self-dogfood: 21.1's own settle runs cleanly (it is `tier: standard`, profile `auto` → not capped).

## Tasks

### T1: settle soft-cap refusal + override flag
- files: `packages/core/src/cli/commands/settle.ts`, `packages/core/tests/cli/settle.test.ts` (or new `settle-soft-cap.test.ts`)
- action: After `gateSet` is computed but before any coverage / interactive / deep work, check `if (gateSet.softCap && !opts.allowAutoComplex)` → write refusal to stderr per AC-1, set `process.exitCode = 1`, `return`. Add `--allow-auto-complex` option on `cadence settle run` (commander `.option('--allow-auto-complex', '...')`). When set + cap active, emit the INFO line per AC-2 then continue. The check runs even when `--ac` overrides are supplied — the cap is structural (blast-radius gate), not per-AC. Add a new test file `tests/cli/settle-soft-cap.test.ts` mirroring the existing settle-auto pattern: cover (a) auto × complex draft refused without flag; (b) flag bypasses + stderr INFO line; (c) auto × standard not affected; (d) strict × complex not affected (softCap=false).
- verify: vitest green; spawned-CLI tests via the existing `tempRepo` fixture.
- done: AC-1, AC-2

### T2: `draft approve` soft-cap refusal + override flag
- files: `packages/core/src/cli/commands/draft.ts`, `packages/core/tests/cli/draft-approve.test.ts`
- action: Inside `draft approve <phase> <num>`, after parsing the draft and loading state + config, compute `gateSet = effectiveGateSet(state, cfg, draft)`. If `gateSet.softCap && !opts.allowAutoComplex` → write refusal per AC-3, exit 1, do not transition. Add `--allow-auto-complex` option on the approve subcommand. Note: approve does not currently set tier in state until *after* the cap could fire, so we use `draft.tier` (which the draft frontmatter requires) directly via the existing `effectiveGateSet` call. Update existing draft-approve tests if any cover an auto × complex case (likely none); add new test cases: (a) auto + complex draft refused; (b) --allow-auto-complex bypasses; (c) draft.profile: standard override avoids the cap; (d) auto + standard never hits cap.
- verify: vitest green.
- done: AC-3, AC-4

### T3: docs + dogfood
- files: `DESIGN.md`
- action: In §4.3 (Locked decisions on the matrix), the M2 row's "Decision" cell remains `**Soft cap.** Refuse by default; override with --allow-auto-complex. Tighten to notification-target cap once continuity-runtime ships.` — append `**Shipped — Phase 21.1.**` to that cell. §10 punchlist gains `Phase 21.1 — auto × complex soft cap (M2) ✓`. AC-1..AC-5 each referenced by ≥1 test file (T1/T2 test files will cover AC-1..AC-4; AC-5 is meta — gets a passing reference in one of the test file headers). Dogfood: this phase is `tier: standard, profile: auto` → softCap is false → settle runs without `--allow-auto-complex`.
- verify: visual read + full suite green + settle succeeds.
- done: AC-5

## Boundaries

- DO NOT change `gatesFor(...)` or the `gateSet.softCap` flag — those are correct; the engine already signals. This phase wires call-site enforcement only.
- DO NOT make the cap a hard refusal. M2 explicitly says soft cap with override. The flag must exist.
- DO NOT add the "tighten to notification-target cap" logic in this phase. That's a future tightening that depends on continuity-runtime. Per M2, ship the basic flag first; tightening is a separate phase.
- DO NOT add the flag to any subcommand outside `settle run` + `draft approve`. The cap is about *committing to BUILD* and *closing the loop* — those are the two gates. Other commands (status, progress, build task) are not gated.
- DO NOT couple the cap to anomaly-notify gate presence — that's the future tightening's domain, not 21.1's.
- DO NOT change the existing `--force` semantics or interact with it. `--force` bypasses AC verdict refusals; `--allow-auto-complex` bypasses the matrix cap. Orthogonal concerns.
