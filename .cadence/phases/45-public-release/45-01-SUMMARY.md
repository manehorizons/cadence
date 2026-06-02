# SETTLE Summary — 45-01

**Completed:** 2026-06-02T18:42:41.031Z

## Acceptance Criteria

- AC-1: PASS
- AC-2: PASS
- AC-3: PASS
- AC-4: PASS
- AC-5: PASS

## Tasks

- T1: DONE — changesets adopted: @changesets/cli, .changeset/config.json (access public, testkit ignored), scripts
- T2: DONE — all 4 packages bumped 1.1.1->1.4.0; build green; pnpm -r publish --dry-run validates 1.4.0 shape (testkit skipped)
- T3: DONE — already satisfied: release.yml (2026-05-30) has id-token:write + pnpm -r publish --provenance + NPM_CONFIG_PROVENANCE; inline gate (build+typecheck+lint+test) instead of needs:ci-success
- T4: DONE — CHANGELOG [1.4.0] section dated 2026-06-02 with prominent zod ^3->^4 breaking-deps callout + version-drift reconciliation note; docs install lines verified
- T5: DONE — published @manehorizons/cadence-{core,types,host-claude-code}@1.4.0 via release.yml CI with provenance (slsa v1); testkit 404 (private); annotated tag v1.4.0 at fbbcf91

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_
