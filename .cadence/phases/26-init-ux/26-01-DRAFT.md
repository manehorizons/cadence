---
phase: 26-init-ux
id: 26-01
tier: standard
status: PENDING
---

# 26-01 — cadence init UX polish

## Objective

Polish `cadence init`: interactively prompt for project name when `--name` is absent, suggest a gate profile from git history (with override), and print a one-screen post-init summary — while staying non-interactive and default-driven under non-TTY (existing behaviour preserved).

## Acceptance Criteria

### AC-1: Interactive name prompt when `--name` absent
Given a TTY (or `CADENCE_PROMPTER_SCRIPT`) and no `--name` flag
When `cadence init` runs
Then it prompts `Project name [unnamed]: `; a non-empty reply becomes the project name, an empty reply falls back to `unnamed`; when `--name` IS supplied no name prompt appears and the supplied value is used verbatim

### AC-2: Gate-profile suggestion heuristic + override
Given no `--gate-profile` flag
When `cadence init` runs
Then it computes a suggestion from `git rev-list --count HEAD` (≥20 commits → `standard`, a reachable repo with fewer → `auto`, git failure / no commits → `auto`), and under an interactive prompter asks `Profile [<suggestion>] (strict|standard|auto): ` accepting empty (take suggestion) or one of `strict|standard|auto`; `--gate-profile <p>` skips the prompt and forces `p`; the resolved value is written to `config.profile` on top of the chosen preset

### AC-3: Post-init summary on stdout
Given a successful init
When scaffolding completes
Then stdout shows a one-screen summary: the `.cadence/` path, preset, resolved gate profile, the list of created dirs/files, and a `See .cadence/ROADMAP.md / README` pointer line; the legacy `Initialized CADENCE in <dir> (profile=<preset>)` line is retained for back-compat

### AC-4: Non-TTY skips prompts, defaults applied
Given no TTY and no `CADENCE_PROMPTER_SCRIPT`
When `cadence init` runs without `--name` / `--gate-profile`
Then no prompt is attempted (no hang, no throw), name defaults to `unnamed`, gate profile defaults to the heuristic suggestion, and exit code is 0

### AC-5: Existing behaviour + tests preserved
Given the Phase-12-era init test suite
When the refreshed `tests/cli/init.test.ts` runs
Then the original three cases still pass (team default; `--profile=production` → strict + preToolUseBuildGate; refuse overwrite), plus a new scripted-prompter TTY-mode case (name + profile via `CADENCE_PROMPTER_SCRIPT`) and a non-TTY-defaults case are green

## Tasks

### T1: init.ts — name prompt + gate-profile heuristic/override + summary
- files: `packages/core/src/cli/commands/init.ts`
- action: Drop the commander default on `--name` (so absence is detectable; treat `undefined` as "ask or default unnamed"). Add `--gate-profile <strict|standard|auto>` option. Build a prompter exactly like `draft.ts approve`: `CADENCE_PROMPTER_SCRIPT` (newline-split) → `ScriptedPrompter`; else `process.stdin.isTTY` → `StdinPrompter`; else `null` (non-interactive). Name resolution: `--name` wins; else if prompter ask `Project name [unnamed]: ` (empty → `unnamed`); else `unnamed`. Gate-profile resolution: `--gate-profile` wins (validate ∈ {strict,standard,auto}); else compute `suggestGateProfile(cwd)` via `execSync('git rev-list --count HEAD')` (≥20 → standard, parseable < 20 → auto, throw/NaN → auto); else if prompter ask `Profile [<sug>] (strict|standard|auto): ` (empty → suggestion; invalid → re-ask up to 3, then suggestion); else suggestion. Set `cfg = { ...presets[preset], profile: resolvedGateProfile }`. Keep all existing scaffolding + the legacy `Initialized CADENCE …` line; append a summary block (path, preset, gate profile, created entries, README/ROADMAP pointer). Close the prompter in a `finally`.
- verify: `pnpm --filter @cadence/core exec vitest run tests/cli/init.test.ts` green.
- done: AC-1, AC-2, AC-3, AC-4

### T2: refresh init.test.ts
- files: `packages/core/tests/cli/init.test.ts`
- action: Keep the three existing cases unchanged (they pass `--name`, spawn without TTY, no script → no prompts). Add: (a) scripted TTY-mode — spawn with `env.CADENCE_PROMPTER_SCRIPT="myproj\nstandard"` and NO `--name` / `--gate-profile`; assert `state.json` project = `myproj`, `config.json` profile = `standard`, summary lines on stdout. (b) non-TTY defaults — spawn with no script, no `--name`/`--gate-profile`; assert exit 0, project `unnamed`, profile = heuristic (`auto` in the fixture's bare/low-commit repo), no hang. (c) summary assertion — stdout matches the path + preset + profile + pointer lines.
- verify: `pnpm --filter @cadence/core exec vitest run tests/cli/init.test.ts` green.
- done: AC-5

### T3: README "Try it" block update
- files: `README.md`
- action: Update the init/"Try it" section to show the new interactive flow (name prompt, profile suggestion) and the post-init summary, plus the non-interactive form (`cadence init --name=demo --gate-profile=standard`) for CI.
- verify: `pnpm turbo run typecheck test build` green.
- done: AC-3

## Boundaries

- DO NOT change the `--profile <preset>` flag semantics (solo|team|production) — `--gate-profile` is the new, separate gate-profile control; existing tests depend on the preset flag.
- DO NOT block init on a non-TTY without a script — prompts must degrade to defaults, never throw or hang.
- DO NOT reimplement prompting — reuse `verify/prompter.ts` (`StdinPrompter` / `ScriptedPrompter`) and the `CADENCE_PROMPTER_SCRIPT` seam.
- DO NOT shell out to git for the count without a try/catch — a missing repo / zero commits must fall back to `auto`, not crash init.
- DO NOT remove the legacy `Initialized CADENCE in <dir> (profile=<preset>)` stdout line — keep it for back-compat ahead of the summary block.
