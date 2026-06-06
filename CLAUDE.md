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
`refs/heads/main`, aborting on failure — this is the local enforcement layer.
Bypass with `git push --no-verify` only when you mean it. On the GitHub side,
`main` carries a ruleset requiring the `ci-success` status check, so PR merges
are gated on green CI (a flaky leg can block a merge until re-run).

### The doc-sync gate

A second, cheap git hook keeps the release narrative honest. `.githooks/pre-commit`
fires only when a commit changes the canonical version
(`packages/core/package.json`); if it did, **`CLAUDE.md` must mention the new
version** or the commit is aborted (`.githooks/pre-push` re-checks this as a
backstop for direct pushes to `main`). The shared, testable checker is
`.githooks/check-doc-sync.sh` (pure: *(version, doc text) → pass/fail*), covered
by `packages/core/tests/docs/doc-sync-hook.test.ts` — whose live-guard case also
fails CI on every OS if a version bump ever lands with a stale `CLAUDE.md`.
Bypass with `--no-verify` like the CI gate.

The same four-command pipeline runs in `.github/workflows/ci.yml` on every
PR + push, on GitHub-hosted Ubuntu + macOS + Windows runners across Node 20 +
22 — all three OS legs (macOS unblocked in phase 49 by realpath'ing the testkit
temp root; Windows in phase 50 via platform-aware test timeouts in
`vitest.shared.ts` + best-effort temp cleanup).

## Architecture

Two-surface, five-package design. Source of truth for everything below is in
`pnpm-workspace.yaml` + each package's `package.json`.

### Packages

| Package | Role |
|---|---|
| `@manehorizons/cadence-core` | The engine. CLI (`cadence` binary), DRAFT→BUILD→SETTLE state machine, all gates, parsers, renderers. This is where ~all logic lives. |
| `@manehorizons/cadence-types` | Zod schemas + TypeScript types. Pure data layer — no logic, no I/O. Imported by every other package. |
| `@manehorizons/cadence-host-claude-code` | The Claude Code adapter (reference `HostAdapter`). Installs lifecycle hooks + nine slash commands; shims abstract events to the core dispatcher. `cadence-host-claude-code install` writes into a consumer's `.claude/`. |
| `@manehorizons/cadence-host-codex` | The OpenAI Codex CLI adapter (second `HostAdapter`, phase 60 contract). Installs project `.codex/hooks.json` + global `~/.codex/prompts/` slash commands; `cadence-host-codex hook` shims Codex's stdin-JSON lifecycle to the core dispatcher. Added v1.13.0 (phases 65–69). |
| `@manehorizons/cadence-testkit` | `private` (dev-only). Mock host + ephemeral-repo fixture + assertions used by every package's tests. Never published to npm. |

Four packages publish to npm (`access: public`): `core`, `types`,
`host-claude-code`, `host-codex`. `testkit` is intentionally private. The publish path was
proven reversibly via `scripts/publish-proof.mjs` (ephemeral verdaccio), first
shipped to npm on 2026-05-30 at `1.1.1`, then republished as `1.4.0` on
2026-06-02 — the version-hygiene release: a version bump matching `main`, an
annotated `v1.4.0` git tag, and npm provenance via OIDC (v1.4 milestone
DELIVERED). `1.5.0` (2026-06-03, tag `v1.5.0` + provenance) added session
continuity (`cadence handoff`/`resume`) plus a boundary-check fix. The
**`1.5.1`** release (2026-06-03, tag `v1.5.1` + provenance) was
the onboarding-hardening patch (phase 48): a distinct `NotInitializedError`, a
Node `>=20` floor with a fast-fail guard, a loud mock-fallback banner under
`settle --deep`, and two scaffold/doc fixes. `1.6.0` (2026-06-04, commit
`dd3aa93`) bumped the three packages `1.5.1 → 1.6.0` for the `cadence init
--preset` flag rename (phase 52, `--profile` kept as a deprecated alias) and the
`/cadence-scout` host slash command (phase 53), bundling the cross-platform-CI
completion (phases 49/50) and the docs portal (phase 51). Then: `1.6.1`
(2026-06-04) — internal-only patch (intelligence/store god-module split, phase
54; re-export barrel removal, phase 55; behavior-preserving). `1.7.0`
(2026-06-04) — `cadence doctor` (phase 56) + `cadence recommendation promote`
(phase 57) + an `install --local` portability fix. `1.8.0` (2026-06-05) —
`cadence mcp serve`, an MCP server surface (a third drive surface alongside CLI
+ Claude Code hooks; phase 58). `1.9.0` (2026-06-05) — drift-decides brief/full
`cadence resume` (phase 59). `1.10.0` (2026-06-05, tag `v1.10.0` + provenance,
PR #51, merge commit `9b85b5f`) — changesets bumped the three packages
`1.9.0 → 1.10.0` for the explicit, versioned **host-adapter contract** in
`cadence-types` (phase 60: `HostAdapter`, `HostCapabilitiesZ`,
`ADAPTER_CONTRACT_VERSION`, `ExtractedPayload`) + `claudeCodeAdapter`
conformance, folding in the `commander` 13 → 14 bump (#49; commander pinned
`^14` to hold the Node `>=20` floor). Then
**`1.11.0`** (2026-06-05, tag `v1.11.0` + provenance): changesets bumped the
three packages `1.10.0 → 1.11.0` for two adoption-layer features — **phase 61**
first-class **scout-session grouping** (an optional `scoutId` on recommendations
+ `recommendation add --scout-id`, a `recommend --scout-id <id>` cluster filter,
a `- scout:` render line, and `/cadence-scout` auto-minting a session id; PR #53)
and **phase 62** the guided **first-loop nudge** in `cadence init` output (a
numbered "Your first loop" block + `cadence progress` escape hatch; PR #54). Then
**`1.12.0`** (2026-06-05, tag `v1.12.0` +
provenance): changesets bumped the three packages `1.11.0 → 1.12.0` for two more
adoption-layer **`cadence-core`** CLI features — **phase 63** **`cadence
tutorial`** (runs one real DRAFT→BUILD→SETTLE loop in a throwaway sandbox,
printing each step's command + the engine's actual output; the executable
companion to `init`'s "Your first loop" block) and **phase 64** **`cadence
explain [concept]`** (in-CLI, terminal-sized help for loop/gates/tiers/profiles,
with content embedded in the binary so it works from any install — bare lists
the concepts, unknown names get a did-you-mean nudge). `cadence-types` and
`cadence-host-claude-code` carried version-alignment bumps only (no functional
change). The latest published version is **`1.14.0`** (2026-06-06, tag `v1.14.0`
+ provenance): the **verifier-correctness** milestone (v1.14) — the `deep-verify`
gate now sends the AI verifier the **actual phase diff** (`git diff HEAD`, capped
by the new `verifier.diffCapBytes` config, default 256KB, truncated with an
explicit marker) instead of `diff: ''`, so deep verification judges the
implementation rather than test-linkage alone (DESIGN.md **D12**). Run-level
`deepVerifyMeta` provenance (`diffProvided`/`diffBytes`/`truncated`/`filesCount`/
`provider`/`model`) lands in the SUMMARY, and the mock-fallback banner now fires
on the gate's real firing condition (`--deep` **or** gate-set membership), not
just `--deep`, so a `standard × complex` settle never runs mock verification
silently. Phases 70 (keystone diff wiring + `capDiff` + provenance) → 71 (banner
honesty + docs + changeset); all four published packages bumped `1.13.0 → 1.14.0`
in lockstep. Prior: **`1.13.0`** (2026-06-05, tag `v1.13.0`
+ provenance): the **multi-host reach** milestone (v1.13) — a **fourth** published
package, **`@manehorizons/cadence-host-codex`**, the second consumer of the
phase-60 host-adapter contract (`ADAPTER_CONTRACT_VERSION = 1`, **unchanged** — a
differently-shaped host conformed without a contract bump). Built across phases
65–69 (spike → adapter core → install surface → hook shim → docs): `codexAdapter
satisfies HostAdapter` with `mapEvent` over Codex's near-1:1 lifecycle and
`extractPayload` parsing Codex's multi-file `apply_patch` envelope into
`ExtractedPayload.files`; `cadence-host-codex install` (project `.codex/hooks.json`
+ **global** `~/.codex/prompts/` slash commands) and `cadence-host-codex hook`
(the runtime shim → core dispatcher). The other three packages carried
version-alignment bumps only. Codex chosen over OpenCode for reach; Aider ruled
out (no hook system). Releases are cut with
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
