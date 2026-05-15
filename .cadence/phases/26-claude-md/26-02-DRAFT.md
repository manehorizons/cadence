---
phase: 26-claude-md
id: 26-02
tier: standard
status: PENDING
---

# 26-02 — CLAUDE.md scaffold

## Objective

Have `cadence init` write a managed-marker `CLAUDE.md` at the repo root that primes Claude Code on the project's loop, gate profile, state location, and key commands — idempotently regeneratable via `cadence init --claude-md` while preserving any unmanaged user edits.

## Acceptance Criteria

### AC-1: init writes CLAUDE.md at repo root
Given a fresh `cadence init` (any preset / gate profile)
When scaffolding completes
Then a `CLAUDE.md` exists at the working-tree root containing a managed block delimited by `<!-- cadence:managed:start -->` / `<!-- cadence:managed:end -->`, and the post-init summary lists `CLAUDE.md` among the scaffolded files

### AC-2: Template content names profile + commands + paths
Given the generated managed block
When inspected
Then it states the project name, the resolved gate profile, points at `.cadence/ROADMAP.md` + `.cadence/STATE.md` + the project DESIGN/README, and lists the core loop commands (`draft new` → `draft approve` → `build task` → `settle run`) with a one-line description of the CADENCE loop

### AC-3: Idempotent regenerate, preserves unmanaged edits
Given an existing `CLAUDE.md`
When `cadence init --claude-md` runs (allowed even though `.cadence/` already exists)
Then if the file contains the managed markers only the managed block is rewritten (content outside the markers is preserved byte-for-byte); if the file has NO managed markers it is left untouched and a stderr note explains it was preserved; exit code 0 in both cases

### AC-4: `--claude-md` standalone mode reads existing config
Given a project already initialized (`.cadence/config.json` + `state.json` present)
When `cadence init --claude-md` runs without re-scaffolding
Then it does NOT refuse with "already initialized", does NOT touch `.cadence/`, and regenerates the managed block using the project name from `state.json` and the gate profile from `config.json`

### AC-5: Documented + tests green
Given the refreshed suite
When `tests/cli/init-claude-md.test.ts` runs
Then fresh-init-writes-CLAUDE.md, managed-block-regenerate-preserves-outside, no-marker-file-preserved, and standalone-`--claude-md`-on-existing-project cases are green; existing `init.test.ts` stays green; README documents the new file + flag

## Tasks

### T1: CLAUDE.md template generator + markers
- files: `packages/core/src/init/claude-md-template.ts`
- action: New module. Export `MANAGED_START = '<!-- cadence:managed:start -->'`, `MANAGED_END = '<!-- cadence:managed:end -->'`. `renderClaudeMd(opts: { projectName: string; gateProfile: Profile; preset: string }): string` returns a full default CLAUDE.md whose managed region (between the markers, inclusive) contains: project name, gate profile, the CADENCE loop one-liner, the command list (`cadence draft new` / `draft approve` / `build task <id> --status=DONE` / `settle run --auto`), and pointers to `.cadence/ROADMAP.md`, `.cadence/STATE.md`, `DESIGN.md`, README. Export `mergeManagedBlock(existing: string, opts): { content: string; mode: 'created' | 'regenerated' | 'preserved' }` — no file → full render (`created`); has both markers → replace inclusive span with the fresh managed block, keep prefix/suffix (`regenerated`); has content but no markers → return existing unchanged (`preserved`).
- verify: unit tests in tests/cli/init-claude-md.test.ts exercise the three merge modes.
- done: AC-2, AC-3

### T2: init.ts — write/merge CLAUDE.md + --claude-md standalone
- files: `packages/core/src/cli/commands/init.ts`
- action: Add `--claude-md` boolean option. NORMAL path (no `--claude-md`, `.cadence/` absent): after scaffolding, compute `CLAUDE.md` via `mergeManagedBlock(existingOrEmpty, { projectName: name, gateProfile, preset: opts.profile })`, write it, add `CLAUDE.md` to the summary's scaffolded list. STANDALONE path (`--claude-md` set): SKIP the "already initialized" refusal and the `.cadence/` scaffold entirely; read project name from `.cadence/state.json` (`project.name`, fallback `unnamed`) and gate profile from `.cadence/config.json` (`profile`, fallback `auto`) when present; merge/write `CLAUDE.md` at cwd; print which mode happened (`created` / `regenerated` / `preserved` — the last to stderr per AC-3). Both paths exit 0 (preset-unknown still exits 2).
- verify: tests/cli/init-claude-md.test.ts + existing init.test.ts green.
- done: AC-1, AC-3, AC-4

### T3: Tests
- files: `packages/core/tests/cli/init-claude-md.test.ts`
- action: New spawned-CLI suite (mirror init.test.ts harness). Cases: (a) fresh `init --name=demo --gate-profile=standard` → root `CLAUDE.md` exists with both markers, names `demo` + `standard`, stdout summary lists `CLAUDE.md`; (b) write a `CLAUDE.md` with markers + custom prefix/suffix, run `init --claude-md`, assert prefix/suffix preserved byte-for-byte and managed block refreshed; (c) write a `CLAUDE.md` with NO markers, run `init --claude-md`, assert file unchanged + stderr preserved-note + exit 0; (d) initialized fixture (`.cadence/` present) + `init --claude-md` does not error on "already initialized" and uses state/config values. Plus direct unit tests on `mergeManagedBlock` for the three modes.
- verify: `pnpm --filter @cadence/core exec vitest run tests/cli/init-claude-md.test.ts tests/cli/init.test.ts` green.
- done: AC-1, AC-3, AC-4, AC-5

### T4: README note
- files: `README.md`
- action: In the init / "Use with Claude Code" area, note that `cadence init` writes a managed `CLAUDE.md` and that `cadence init --claude-md` regenerates it in place (preserving content outside the `cadence:managed` markers and any marker-less user file).
- verify: `pnpm turbo run typecheck test build` green.
- done: AC-5

## Boundaries

- DO NOT overwrite a marker-less user `CLAUDE.md` — absence of the managed markers means hands-off; preserve byte-for-byte.
- DO NOT refuse `--claude-md` when `.cadence/` exists — that mode is explicitly for already-initialized projects.
- DO NOT change `--name` / `--profile` / `--gate-profile` semantics from Phase 26.1.
- DO NOT write CLAUDE.md anywhere but the working-tree root (cwd).
- DO NOT couple the template to live state reads at Claude-session time — it is a static snapshot regenerated by `--claude-md`.
