# Design — CADENCE user-guide documentation

**Date:** 2026-05-15
**Status:** Approved (brainstorming) — pending spec review + implementation plan
**Context:** CADENCE v1.1. The tool is badly under-documented for adopters: README is a status/changelog wall, DESIGN.md is an internal spec, there is no `docs/` user guide, nothing covering the two usage surfaces (the `cadence` CLI engine vs the Claude Code host integration).

## Problem

A new user cannot learn to use CADENCE from the repo. The README explains release history, not usage. DESIGN.md is the design/decision record, not a guide. The two-surface model (engine CLI + host adapter) is undocumented, so it is unclear whether cadence is "a CLI" or "a Claude Code thing" — it is both: one engine + one thin host adapter.

## Goals

- A navigable, plain-markdown `docs/` user guide for **people adopting CADENCE on their own projects**.
- Cover the two surfaces explicitly: the `cadence` CLI (engine; host/model-agnostic) and `cadence-host-claude-code install` (Claude Code hooks + slash commands over the same engine).
- Ground reference pages in live truth (CLI `--help`, `CadenceConfigZ`), not memory; add one cheap drift guard so the command reference cannot silently rot.
- Slim the README to an intro + the two-surface model + a pointer to `docs/`.
- Describe *current* behavior, including known carry-forwards (accurate over aspirational).

## Non-Goals (YAGNI)

VitePress/Docusaurus or any docs site/toolchain; a generated/introspected CLI reference; contributor/architecture docs (different audience); publish-pipeline docs (that phase is paused); API/typedoc; tutorials beyond one end-to-end quickstart.

## Ground truth (verified this session)

Top-level `cadence` commands (from `cadence --help`): `config`, `init`, `draft` (→ `new`/`check`/`approve`), `hook`, `build` (→ `task`), `done`, `block`, `needs-context`, `settle` (→ `run`), `progress`, `status` (plus Commander's auto `help`). Host (`cadence-host-claude-code --help`): `install`, `hook` (plus auto `help`). Config schema: `CadenceConfigZ` in `packages/types/src/config.ts` (presets `solo`/`team`/`production`).

Gate universe: `GateZ` in `packages/types/src/profile.ts` — **13 gates**. 3 always-fire ("free"): `coherence-check`, `structural-verifier`, `build-test-must-pass`. 10 profile×tier-gated, by cost band: cheap — `draft-read`, `test-coverage`, `anomaly-notify`; medium — `approve`, `per-task-verify`, `code-review`; expensive — `deep-verify`, `interactive-verdict`, `plan-review`, `security-audit`. Which of the 10 fire is decided by `packages/core/src/gates/engine.ts` (profiles strict/standard/auto × tiers quick-fix/standard/complex). The docs must use this full inventory — do not undercount or omit `deep-verify`.

## Structure

Plain markdown at repo `docs/` (sibling of `docs/superpowers/`). Diátaxis-lite: tutorial / explanation / how-to / reference.

```
docs/
  README.md       Index + nav. The two-surface model in ~3 sentences. Links to each page.
  quickstart.md   Tutorial. Install (local-dogfood today; note npx is post-publish/not yet).
                   One toy repo, one phase end-to-end: cadence init → draft new → fill
                   DRAFT → draft check → draft approve → build task → settle run.
                   Then the same via Claude Code: install + the slash-command flow.
  concepts.md     Explanation. The DRAFT→BUILD→SETTLE loop; the two-commit convention;
                   profiles (strict/standard/auto) × tiers (quick-fix/standard/complex)
                   and what each cell gates; the full gate universe (all 13: the 3
                   always-fire + the 10 profile×tier-gated, incl. deep-verify, grouped
                   free/cheap/medium/expensive) with when each fires; providers
                   (mock/anthropic/local) at a concept level; the
                   .cadence/ state + per-phase artifact files (DRAFT/PROGRESS/SUMMARY,
                   STATE.md, state.json, shakedown/, PLAN-REVIEW.json).
  cli.md          How-to: the `cadence` engine. Worked invocations for config, init,
                   draft new/check/approve, build task (+ done/block/needs-context
                   shortcuts), settle run (--auto/--deep/--interactive/--force and the
                   --allow-* bypasses), status, progress. The two-commit convention in
                   practice. Note the block/needs-context id-validation carry-forward.
  claude-code.md  How-to: `cadence-host-claude-code install` ([--cwd] [--local]
                   [--settings] [--no-hooks] [--no-commands] [--cadence] [--command]).
                   The hook groups + the 9 slash commands; how the agent drives the
                   same engine; the --local machine-absolute-paths warning + gitignore
                   guidance. (Author derives the exact hook-group set + count from the
                   host installer source — `packages/host-claude-code/src/` — not from
                   memory, per the accuracy principle.)
  providers.md    How-to: mock (offline default; deterministic floor), anthropic
                   (ANTHROPIC_API_KEY; messages.parse structured output),
                   local (CADENCE_LOCAL_BASE_URL + CADENCE_LOCAL_MODEL, OpenAI-compatible
                   /v1/chat/completions, e.g. Ollama; per-gate model override; warn+mock
                   fallback). Per-gate provider config; which gate fires in which cell.
  reference/
    commands.md   Per-command reference: arguments, options, exit codes, gate
                   interactions/bypasses. Authored from `cadence --help` +
                   `cadence-host-claude-code --help`.
    config.md     Every CadenceConfigZ field with type/default/meaning; the three
                   presets (solo/team/production) and how init writes profile +
                   layout-detected verification.testGlobs.
```

## Accuracy + drift guard

Reference content is written against the live CLI `--help` output and the `CadenceConfigZ` schema at authoring time. To prevent `reference/commands.md` from silently rotting, add **one** test, `packages/core/tests/docs/cli-reference.test.ts`, with a pinned contract (no latitude left to the implementer):

- **Doc-side marker (exact):** `reference/commands.md` contains a block delimited by the literal HTML comments `<!-- cadence:commands:start -->` and `<!-- cadence:commands:end -->`, with **one top-level command name per line** between them (bare token, no backticks/prose). The test extracts that set.
- **CLI-side set:** obtained by invoking the built CLI `node packages/core/dist/cli/index.js --help` and parsing the `Commands:` section (the implementer may instead import the command registrar if cleaner — either is acceptable, but the marker + exclusion rules below are fixed).
- **Exclusions (both sides):** Commander's auto-generated `help` command (and any `help [command]`) is excluded from both the documented set and the CLI set before comparison. `hook` IS included (it is a real registered command, not auto).
- **Assertion:** the two sets are exactly equal (no missing, no extra). On divergence the test fails, forcing the doc to be updated alongside any command change.

No generator, no toolchain. The existing `tests/docs/readme-shakedown.test.ts` is the precedent pattern (assert on doc file text).

## README slimming

Replace the long status/version-history block with: one-line description; the two-surface model (engine CLI + Claude Code host adapter); a ~6-line quickstart teaser; a prominent link to `docs/`. Keep the CI/enforcement (`.githooks/pre-push`) note. Version/milestone history is already in `CHANGELOG.md` — it is removed from README, not duplicated. **Consistency:** the slimmed teaser uses the same local-dogfood install as `quickstart.md` (the current README's aspirational `npx @cadence/*` lines are removed/replaced — `npx` is post-publish and that phase is paused); a one-line "not yet published — local install for now" note prevents the old npx-vs-reality mismatch.

## Affected files

- `docs/README.md`, `docs/quickstart.md`, `docs/concepts.md`, `docs/cli.md`, `docs/claude-code.md`, `docs/providers.md`, `docs/reference/commands.md`, `docs/reference/config.md` — new.
- `packages/core/tests/docs/cli-reference.test.ts` — new (drift guard).
- `README.md` — slimmed.
- `DESIGN.md` — §10 punchlist entry for the docs phase.
- `CHANGELOG.md` — `### Added` user documentation entry.

## Build sequence (for the plan)

1. `concepts.md` (the spine — everything else references it).
2. `reference/config.md` from `CadenceConfigZ`; `reference/commands.md` from `--help`.
3. Drift-guard test for `reference/commands.md`; make it green.
4. `cli.md`, `claude-code.md`, `providers.md` (how-to, lean on concepts + reference).
5. `quickstart.md` (tutorial, end-to-end, both surfaces).
6. `docs/README.md` index/nav.
7. Slim repo `README.md`; DESIGN §10 + CHANGELOG.
8. Full suite green; dogfood as a CADENCE phase (two-commit convention).

## Accuracy principle

Docs describe current behavior, including known carry-forwards (e.g. `block`/`needs-context` lack the Phase 29.8 `build task` id-validation; `npx @cadence/*` is not yet published — quickstart uses the local-dogfood install). Accurate-over-aspirational; no documenting of unshipped/paused work (publish pipeline).
