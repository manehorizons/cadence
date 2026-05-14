---
phase: 12-rename-cadence
id: 12-01
tier: standard
status: PENDING
---

# 12-01 — KEEL → CADENCE rename rollout

## Objective

Execute DESIGN.md D7: coordinated rename of every KEEL surface to CADENCE — packages, CLI binary, state directory, host installer outputs, slash commands, docs, and the companion `keel-dashboard` repo. Single-commit cutover behind tag `v0.2.0-rc.1`.

## Acceptance Criteria

### AC-1: package namespace renamed
Given the workspace
When inspected
Then every `package.json` `name` field reads `@cadence/*` (was `@keel/*`); cross-package `workspace:*` references resolve; `pnpm install` completes cleanly; `pnpm-lock.yaml` shows no stale `@keel/*` entries.

### AC-2: CLI binary renamed
Given a built workspace
When `node packages/core/bin/cadence.cjs --help` runs
Then exit 0 + help text is shown; the old `keel.cjs` shim is gone; `package.json` `bin` field reads `{ "cadence": "./bin/cadence.cjs" }`. host-claude-code's binary follows the same pattern (`cadence-host-claude-code`).

### AC-3: state directory renamed
Given an initialized project
When `cadence init` runs in a fresh dir
Then scaffold lands under `.cadence/` (was `.keel/`); state engine reads/writes `.cadence/state.json` + `.cadence/STATE.md`; existing source code references to `.keel` are 0 outside of historical phase artifacts.

### AC-4: host installer + slash commands renamed
Given a project with cadence host-claude-code installed
When inspected
Then `.claude/settings.local.json` hook commands invoke `cadence-host-claude-code` and `cadence` (no `keel-host-*` / `keel` strings); `.claude/commands/cadence-*.md` files exist (9 files, was `keel-*`); managed-by marker reads `managed-by: cadence`.

### AC-5: tests + build clean
Given the rename complete
When `pnpm turbo run build && pnpm turbo run test` runs
Then all packages build, all tests pass at the post-Phase-11 count (~196), no test file references the old `keel-*` strings except through historical phase artifacts.

### AC-6: companion dashboard renamed
Given keel-dashboard sibling project
When inspected after this phase
Then `package.json` name reads `cadence-dashboard`, CLI binary is `cadence-dashboard`, README + DESIGN references updated, hooks/slash commands re-installed via the new `cadence-host-claude-code` binary, tests pass.

### AC-7: GitHub repos renamed + commits pushed
Given local rename complete
When `gh repo view manehorizons/cadence` and `gh repo view manehorizons/cadence-dashboard` are run
Then both report PRIVATE with the new names; old `keel` / `keel-dashboard` URLs redirect; main branch on each is pushed and contains the rename commit + a `v0.2.0-rc.1` tag.

## Tasks

### T1: rename package directories + package.json names
- files: `packages/core/`, `packages/types/`, `packages/testkit/`, `packages/host-claude-code/`, every `package.json`, `pnpm-workspace.yaml` (glob already covers `packages/*`)
- action: Update each `package.json` `name` field from `@keel/*` to `@cadence/*`. Update cross-package `dependencies` / `devDependencies` to match. Run `pnpm install` to reconcile.
- verify: `grep -r "@keel/" packages/ --include="*.json"` returns 0 hits; `pnpm install` reports no resolution errors.
- done: AC-1

### T2: rename CLI binary + bin shims
- files: `packages/core/bin/keel.cjs` (rename to `cadence.cjs`), `packages/core/package.json` (bin field), `packages/host-claude-code/bin/keel-host-claude-code.cjs` (rename to `cadence-host-claude-code.cjs`), `packages/host-claude-code/package.json`
- action: Rename .cjs shim files. Update bin fields. Update any internal hardcoded references to "keel" binary names in CLI source (e.g. error messages, version output).
- verify: `node packages/core/bin/cadence.cjs --version` works; `keel.cjs` files do not exist; package.json bin fields point at new names.
- done: AC-2

### T3: rename `.keel/` state directory + parsers
- files: `packages/core/src/state/*.ts`, `packages/core/src/cli/commands/init.ts`, `packages/core/src/cli/commands/draft.ts`, `packages/core/src/cli/commands/build.ts`, `packages/core/src/cli/commands/settle.ts`, `packages/core/src/cli/commands/status.ts`, `packages/core/src/cli/commands/progress.ts`, `packages/core/src/build/record.ts`, `packages/core/src/render/state-md.ts`, any other `.keel`-string source references
- action: Replace every literal `.keel/` / `.keel` in src/ with `.cadence/` / `.cadence`. Update STATE.md template heading from "KEEL State" to "CADENCE State". **Do not rename** the existing `.keel/` directory in this repo — phase artifacts stay accurate to history (the project is mid-transition; new init = `.cadence/`).
- verify: `grep -rn "\.keel" packages/*/src` returns 0 hits; existing `.keel/phases/*/` artifacts untouched.
- done: AC-3

### T4: rename host-claude-code installer outputs
- files: `packages/host-claude-code/src/install.ts`, `packages/host-claude-code/src/install-commands.ts`, `packages/host-claude-code/src/locate-self.ts`, `packages/host-claude-code/src/shim.ts`
- action: Update slash command names from `keel-*` to `cadence-*` in COMMANDS array. Update managed-by marker. Update slash command bodies to invoke `cadence` (not `keel`). Update locate-self resolution paths if they referenced `keel-*` binaries. Update CLI verbiage strings ("Installed KEEL hooks" → "Installed CADENCE hooks").
- verify: `grep -rn "keel" packages/host-claude-code/src` returns 0 user-facing hits (history-only refs OK in comments).
- done: AC-4

### T5: sweep tests + remaining source for `keel` literals
- files: `packages/**/tests/**/*.ts`, `packages/**/src/**/*.ts`, `eslint.config.js`, `turbo.json`, `tsconfig.base.json`
- action: Update tests to invoke the new `cadence` CLI path (`packages/core/dist/cli/index.js` is the same; only the bin shim renamed). Update fixture strings, expected stderr messages, slash command name assertions. Anywhere the user-facing string "KEEL" appears (banners, error prefixes), change to "CADENCE".
- verify: `grep -rn "keel" packages/ --include="*.ts"` reports only historical comments / .keel/-path strings (which are now phase artifact paths, OK).
- done: AC-1, AC-4, AC-5

### T6: rebuild + run full test suite
- files: (no edits)
- action: `pnpm turbo run build` then `pnpm turbo run test`. Expect 196 tests still green. Fix any regressions before proceeding.
- verify: all packages green; binary counts match Phase 11.
- done: AC-5

### T7: README + DESIGN.md update
- files: root `README.md`, root `DESIGN.md`
- action: Replace project name + commands + sample output. Status banner: "Phases 1–12 shipped; renamed to CADENCE." Update CADENCE rename section in DESIGN.md from "pending physical rollout" to "complete as of Phase 12 / v0.2.0-rc.1." Note that historical phase artifacts under `.keel/` remain by design.
- verify: visual read; banner accurate against test output.
- done: AC-5

### T8: companion dashboard rename
- files: `C:/Users/Thomas/Documents/Projects/keel-dashboard/package.json`, `bin/`, `src/`, `tests/`, `README.md`, slash commands under `.claude/commands/`, `CLAUDE.md`
- action: Rename `keel-dashboard` package to `cadence-dashboard`. Rename CLI binary. Re-run host install via the new `cadence-host-claude-code` binary (or hand-rewrite `.claude/settings.local.json` + slash commands). Update README to reference CADENCE. Tests green. **Keep `.keel/` phase artifacts in keel-dashboard for the same historical-accuracy reason as T3.**
- verify: `pnpm build && pnpm test` green in keel-dashboard; `node dist/index.js render --cwd .` produces a CADENCE-branded digest.
- done: AC-6

### T9: commit, tag, GitHub repo rename, push
- files: (git/gh operations)
- action: In keel repo: single commit "feat: rename KEEL → CADENCE (Phase 12 / v0.2.0-rc.1)". Tag `v0.2.0-rc.1`. Push commit + tag. Then `gh repo rename cadence` (manehorizons/keel → manehorizons/cadence). Update local `git remote set-url origin`. Repeat for keel-dashboard.
- verify: `gh repo view manehorizons/cadence` shows PRIVATE + new name; `git push` works against new remote; v0.2.0-rc.1 tag visible on GitHub.
- done: AC-7

## Boundaries

- DO NOT rename historical `.keel/phases/` artifact directories. Those preserve the project's transition narrative.
- DO NOT bump major version. v0.2.0-rc.1 reflects the breaking package rename + codex removal, not a stability claim.
- DO NOT publish to npm in this phase. Local dev only; npm publish remains gated on the verifier hybrid landing first.
- DO NOT change behavior — purely identifier rename. No new features, no refactors, no API changes beyond name.
- DO NOT touch `keel-codex-archive` tag. It must keep pointing at the pre-removal commit under the old name.
