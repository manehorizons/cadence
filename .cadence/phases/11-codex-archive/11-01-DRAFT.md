---
phase: 11-codex-archive
id: 11-01
tier: standard
status: PENDING
---

# 11-01 — archive host-codex + collapse HostCapabilities

## Objective

Implement DESIGN.md D9: remove `@keel/host-codex` from the active codebase (preserved on `keel-codex-archive` tag) and collapse the multi-host `HostCapabilities` abstraction back into Claude-Code-specific code. v1 ships single-host; codex resurrection becomes a fresh future phase.

## Acceptance Criteria

### AC-1: host-codex package removed from active codebase
Given `keel-codex-archive` tag exists and is pushed
When the working tree is inspected
Then `packages/host-codex/` is deleted, `pnpm-workspace.yaml` no longer references it, and `pnpm install` completes without resolving codex deps. Existing `keel-codex-archive` tag still points at the pre-removal commit.

### AC-2: HostCapabilities abstraction collapsed
Given the multi-host abstraction is no longer needed
When the types + host-claude-code packages are inspected
Then the `HostCapabilities` Zod schema and type are removed from `@keel/types`, the portability test path is gone, and `@keel/host-claude-code` declares its capabilities inline (as a const, not a parsed schema). No external `HostCapabilities` interface survives in `@keel/types`.

### AC-3: README + docs reflect single-host reality
Given the codebase is now Claude-Code-only
When the README is read
Then the Codex section is gone (or shrunk to a one-line "Codex support archived — see tag `keel-codex-archive`" pointer), the "Host adapter contract" paragraph is removed, the status banner lists phases 1–10 (or notes Phase 11 = archive), and the test-count number is updated.

### AC-4: full test suite green, no orphan refs
Given `host-codex` and its tests are gone
When `pnpm turbo run test` runs
Then all surviving tests pass (expect ~200 vs the previous 285, since codex contributed 82 and portability 1 + capabilities schema tests are gone), no test file imports from `@keel/host-codex` or `@keel/types` `HostCapabilities`, and grep for `host-codex` returns only the archive-tag reference (or nothing).

## Tasks

### T1: remove `packages/host-codex/` + workspace wiring
- files: `pnpm-workspace.yaml`, `packages/host-codex/` (delete), root `README.md`
- action: Delete the package directory. Drop its entry from `pnpm-workspace.yaml`. Remove its section from README. Run `pnpm install` to reconcile lockfile.
- verify: `ls packages` no longer shows `host-codex`; `pnpm-lock.yaml` no longer references it.
- done: AC-1

### T2: collapse HostCapabilities into host-claude-code
- files: `packages/types/src/host-capabilities.ts` (delete), `packages/types/src/index.ts`, `packages/host-claude-code/src/capabilities.ts`, `packages/host-claude-code/src/index.ts`
- action: Delete the canonical schema file in `@keel/types`. Drop its re-exports from `packages/types/src/index.ts`. In `host-claude-code/src/capabilities.ts`, replace the Zod-parsed schema usage with a plain inline `const claudeCodeCapabilities = { ... }` typed via a local interface (or hand-rolled type). Update any internal imports.
- verify: `pnpm -r typecheck` clean; `grep -r HostCapabilities packages/` returns 0 matches in src/.
- done: AC-2

### T3: prune capabilities + portability tests
- files: `packages/host-claude-code/tests/capabilities.test.ts` (or equivalent), any other test that depended on the canonical schema
- action: Drop tests that validated the Zod schema shape (the schema is gone). Keep any test that asserts properties of the inline Claude-Code capabilities. Delete the host-codex portability test file (already gone with T1).
- verify: vitest green per package.
- done: AC-4

### T4: README pass + status banner update
- files: `README.md`
- action: Remove "Use with Codex CLI" section. Replace "Host adapter contract" paragraph with a brief "Capabilities" note that just describes Claude Code. Update status banner to list shipped phases through 11 (note: Phase 11 = archive). Update test-count number to match the post-removal suite.
- verify: visual read; banner accurate against `pnpm turbo run test` output.
- done: AC-3

### T5: full test suite + grep audit
- files: (no edits; verification only)
- action: Run `pnpm turbo run test`. Capture the new total. Then `grep -rn "host-codex\|HostCapabilities" .` outside `.keel/` and `.git/`; expected: 0 source hits (DESIGN.md mentioning is fine).
- verify: tests pass + grep clean.
- done: AC-4

## Boundaries

- DO NOT bump the version number yet (rename phase will do that — D7).
- DO NOT touch `.keel/phases/02-host-codex/` or `.keel/phases/09-host-shortcut-commands/`; those phase artifacts stay for historical accuracy.
- DO NOT delete the `keel-codex-archive` git tag — that's the resurrection point.
- DO NOT add any "TODO: re-add codex later" comments. The tag is the breadcrumb.
- DO NOT modify the keel-dashboard project in this phase; it's separate, already Claude-only, and unaffected.
