# SETTLE Summary — 51-01

**Completed:** 2026-06-04T00:01:27.704Z

## Acceptance Criteria

- AC-1: PASS
- AC-2: PASS
- AC-3: PASS
- AC-4: PASS
- AC-5: PASS

## Tasks

- T1: DONE — Scaffolded standalone website/ Astro+Starlight shell (commit 0745f39). Deviation: Astro 6 requires Node>=22.12 (site uses Node 22, independent of engine Node-20 floor); pinned pnpm@9.12.0 + website/pnpm-workspace.yaml packages:[] for isolation. Spec+quality reviews passed.
- T2: DONE — Build-time content sync (commit ffcc2be): routes.mjs (16 routes), TDD'd transform.mjs (13 tests), sync-docs runner, sidebar. Source edit: docs/concepts.md CONTEXT.md link -> GitHub blob URL (internal doc, not published). Hardened rewriteLinks vs image/title-attr corruption. Spec+quality reviews passed. Covers AC-2, AC-5.
- T3: DONE — API docs via starlight-typedoc (commit cf270fb). DEVIATION: cadence-core dropped from entry points — its src/index.ts is an empty barrel (CLI-only, no programmatic API); documenting it produced an empty section + dead link. API now covers cadence-types + cadence-host-claude-code (130+ pages); testkit excluded. Replaced base tsconfig+skipErrorChecking with website/tsconfig.typedoc.json (rootDir-correct) — clean build, no masked errors. AC-3 updated to record the deviation. Spec+quality reviews passed.
- T4: DONE — GitHub Pages deploy workflow .github/workflows/docs.yml (commit 8e87279) + committed website/pnpm-lock.yaml. Node 22 (Astro 6 floor), pnpm 9.12.0, --frozen-lockfile (verified in sync). Tests sync script + builds + deploys to Pages; independent of ci.yml. configure-pages moved before build per review. AC-4. One-time manual step needed: repo Settings->Pages->Source=GitHub Actions.

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
