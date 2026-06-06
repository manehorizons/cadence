---
phase: 69-codex-docs
id: 69-01
tier: standard
status: PENDING
---

# 69-01 — Codex adapter docs — host-adapters.md second example + package README/LICENSE

## Objective

Document the Codex adapter as the second worked example in the host-adapter
authoring guide (calling out where Codex genuinely differs from the Claude
reference), and give the new package the README + LICENSE it needs for a clean
npm publish — the doc half of phase 69, before the v1.13.0 release ceremony.

## Acceptance Criteria

### AC-1: host-adapters.md documents codexAdapter as a second worked example
Given the authoring guide `docs/host-adapters.md`
When a reader reaches the worked-example section
Then it presents `codexAdapter` alongside `claudeCodeAdapter`, naming the genuine
divergences the spike surfaced — `apply_patch` multi-file payload extraction
(vs Claude's `file_path`), global `~/.codex/prompts/` command install (vs the
project-scoped `.claude/commands/`), and the near-1:1 event map — and points at
`packages/host-codex/src/index.ts`.

### AC-2: the host-codex package is publish-ready
Given `@manehorizons/cadence-host-codex`
When it is packed for npm
Then it carries a `README.md` and a `LICENSE` (MIT, matching the other
packages), so the published tarball is self-describing.

## Tasks

### T1: Write failing doc-guard test
- files: `packages/host-codex/tests/docs-published.test.ts`
- action: assert `docs/host-adapters.md` contains `codexAdapter` and the Codex
  divergence keywords (`apply_patch`, `~/.codex/prompts`), and that the package
  ships `README.md` + `LICENSE`. Reference AC-1, AC-2.
- verify: `pnpm --filter @manehorizons/cadence-host-codex test` fails the new suite.
- done: AC-1, AC-2

### T2: Add the Codex worked example to host-adapters.md
- files: `docs/host-adapters.md`
- action: a "Second worked example — Codex" subsection covering the three
  divergences + the GO-on-contract-v1 portability point; reference the package.
- verify: AC-1 test passes.
- done: AC-1

### T3: Add package README + LICENSE
- files: `packages/host-codex/README.md`, `packages/host-codex/LICENSE`
- action: README mirroring the Claude adapter's (name, one-line purpose, monorepo
  link); LICENSE = MIT, Copyright (c) 2026 Thomas Powers.
- verify: AC-2 test passes; `pnpm --filter @manehorizons/cadence-host-codex test`.
- done: AC-2

## Boundaries

- DO NOT run the release ceremony (changeset / version bump / CLAUDE.md / publish)
  in this phase — that is the separate release step after settle.
- DO NOT modify the Claude adapter, the contract, or core.
- DO NOT bump versions here.
