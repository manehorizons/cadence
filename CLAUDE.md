# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

CADENCE is a draft/build/settle framework for AI-assisted development with
configurable quality gates. It is a **meta-tool**: it scaffolds and runs the
DRAFT→BUILD→SETTLE loop on consumer projects, **and uses that same loop on
itself**. The `.cadence/` directory at the repo root is not example data —
it is the live state of CADENCE planning CADENCE.

Authoritative starting points (read these instead of restating them):

- `README.md` — install + quickstart
- `DESIGN.md` — locked decisions, anti-goals, phase history, gate semantics
- `docs/concepts.md` — the loop, profiles × tiers, the full gate matrix
- `docs/reference/commands.md`, `docs/reference/config.md` — CLI + config schemas
- `AGENTS.md` + `docs/agents/` — issue tracker, triage labels, domain docs

## Common commands

This is a pnpm + turbo monorepo. Run everything from the repo root.

```bash
pnpm install              # one-time setup
pnpm build                # turbo build, all packages
pnpm test                 # turbo test, all packages (vitest)
pnpm typecheck            # tsc --noEmit, all packages
pnpm lint                 # eslint, all packages

# Single-package work:
pnpm --filter @manehorizons/cadence-core test
pnpm --filter @manehorizons/cadence-core build
pnpm --filter @manehorizons/cadence-host-claude-code typecheck

# Run a single test file or grep test name:
pnpm --filter @manehorizons/cadence-core test -- path/to/file.test.ts
pnpm --filter @manehorizons/cadence-core test -- -t "name fragment"
```

Node `>=20` is required. `package.json` pins `pnpm@9.12.0`.

### The pre-push gate

`.githooks/pre-push` is wired via `git config core.hooksPath .githooks` and
runs `pnpm turbo run lint typecheck test build` before any push that updates
`refs/heads/main`, aborting on failure. GitHub Free repos have no branch
protection on this tier, so this is the enforcement layer. Bypass with
`git push --no-verify` only when you mean it.

The same four-command pipeline runs in `.github/workflows/ci.yml` on every
PR + push, on GitHub-hosted Ubuntu runners across Node 20 + 22. (macOS and
Windows legs are deferred pending a cross-platform test-harness fix — see the
`ci.yml` comment.)

## Architecture

Two-surface, four-package design. Source of truth for everything below is in
`pnpm-workspace.yaml` + each package's `package.json`.

### Packages

| Package | Role |
|---|---|
| `@manehorizons/cadence-core` | The engine. CLI (`cadence` binary), DRAFT→BUILD→SETTLE state machine, all gates, parsers, renderers. This is where ~all logic lives. |
| `@manehorizons/cadence-types` | Zod schemas + TypeScript types. Pure data layer — no logic, no I/O. Imported by every other package. |
| `@manehorizons/cadence-host-claude-code` | The Claude Code adapter. Installs lifecycle hooks + nine slash commands; shims abstract events to the core dispatcher. `cadence-host-claude-code install` writes into a consumer's `.claude/`. |
| `@manehorizons/cadence-testkit` | `private` (dev-only). Mock host + ephemeral-repo fixture + assertions used by every package's tests. Never published to npm. |

Three packages publish to npm (`access: public`): `core`, `types`,
`host-claude-code`. `testkit` is intentionally private. The publish path was
proven reversibly via `scripts/publish-proof.mjs` (ephemeral verdaccio), first
shipped to npm on 2026-05-30 at `1.1.1`, then republished as `1.4.0` on
2026-06-02 — the version-hygiene release: a version bump matching `main`, an
annotated `v1.4.0` git tag, and npm provenance via OIDC (v1.4 milestone
DELIVERED). `main` is now at the **unreleased `1.5.0`** (handoff/resume +
boundary-check fix), ahead of the published `1.4.0`. Releases are cut with
[changesets](https://github.com/changesets/changesets) and the manual `Release`
workflow (`.github/workflows/release.yml`, `workflow_dispatch`).

### Two-surface model

One engine, two ways to drive it:

1. **CLI**: `node packages/core/bin/cadence.cjs <subcommand>` — terminal use,
   host-agnostic. Entrypoint: `packages/core/src/cli/index.ts` registering
   commands from `packages/core/src/cli/commands/`.
2. **Claude Code adapter**: `cadence-host-claude-code install` writes hooks
   into `.claude/settings.json` and slash-command files into
   `.claude/commands/`. Hooks call back into the same `cadence` CLI;
   slash commands like `/cadence-progress` shell out to it.

The adapter never duplicates engine logic — it translates Claude Code
lifecycle events (`SessionStart`, `PreToolUse`, `Stop`, etc.) into abstract
event names the core dispatcher understands. See
`packages/host-claude-code/src/event-map.ts` and `shim.ts`.

### The loop and its artifacts

`IDLE → SPEC → DRAFT → BUILD → SETTLE → IDLE` (SPEC is optional). Per-phase artifacts live in
`.cadence/phases/<phase>/<id>-{DRAFT,PROGRESS,SUMMARY,PLAN-REVIEW,...}.{md,json}`.
Two state files are regenerated on every state write:

- `.cadence/state.json` — machine-readable
- `.cadence/STATE.md` — derived human view, **do not edit by hand**

### Gates

The gate universe (13 gates, 3 always-fire + 10 deltas) is defined in
`packages/core/src/gates/engine.ts`. The full matrix and bypass flags are
documented in `docs/concepts.md` — do not duplicate that table here when
making changes; update `engine.ts` and `docs/concepts.md` together.

Three AI verifier providers (`mock`, `anthropic`, `local`) live under
`packages/core/src/verify/`. `mock` is the default and is deterministic +
offline; tests must never depend on `anthropic` or `local`.

## Conventions specific to this repo

### Two-commit settle convention

A completed phase produces exactly two commits in order:

1. **Feature commit** (`feat:` / `fix:` / `docs:` etc.) — source + tests + docs
2. **Settle commit** (`chore: settle`) — `.cadence/phases/<phase>/*` artifacts
   plus `.cadence/state.json` + `.cadence/STATE.md`

Reason: keeps `git log --no-merges` readable and blame on source files
uncontaminated by mechanical state writes. The split is owned by the
operator; CADENCE does not enforce it via hook.

### TDD is the house style

`CONTRIBUTING.md` is explicit: every new feature starts with a failing test.
Tests live in `packages/<pkg>/tests/` (mirrors `src/` structure). Use
`@manehorizons/cadence-testkit` for ephemeral-repo fixtures rather than rolling your own.

### Test ↔ AC linkage

When working on the engine's settle path, remember the test-coverage gate
contract: each AC must be referenced by token (`AC-N`) somewhere in a test
file's text. Scanner walks `verification.testGlobs` from `.cadence/config.json`
(default: `packages/**/*.test.ts(x)`). Tests that exercise this gate live in
`packages/core/tests/verify/`.

### TypeScript strictness

`tsconfig.base.json` turns on `strict`, `noUncheckedIndexedAccess`, and
`exactOptionalPropertyTypes`. Indexed access is `T | undefined`; optional
fields cannot be set to `undefined` explicitly. ESLint enforces
`consistent-type-imports` — use `import type { ... }` for type-only imports.

### Vitest workers are capped

`vitest.shared.ts` is the single source of truth for test timeouts (20s) and
caps `maxForks: 12`. This is the root-cause fix for a recurring parallel-load
flake; do not re-add per-test timeout band-aids. Each package's
`vitest.config.ts` `mergeConfig`s the shared base and adds only `include`.

### Historical naming

Pre-Phase-12 artifacts under `.keel/` are intentionally preserved as a
transition narrative. The project was renamed KEEL → CADENCE in Phase 12
(`v0.2.0-rc.1`, 2026-05-14). Don't "clean up" `.keel/` references in design
docs — they're load-bearing context. `DESIGN.md §8.3` lists rejected names.

### `.cadence/` is live state, not example data

When changing the engine, you are also operating on the planning records of
the project itself. `.cadence/ROADMAP.md`, `.cadence/PROJECT.md`,
`.cadence/MILESTONES.md`, and `.cadence/phases/*` reflect actual work and
should be edited only when the work requires it. Don't regenerate or
"freshen" these files for cosmetic reasons.
