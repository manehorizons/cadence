# SETTLE Summary — 49-01

**Completed:** 2026-06-03T20:53:08.739Z

> **Post-settle scope correction (CI verdict, 2026-06-03):** initially settled with AC-1/2/3 PASS, but PR #19's CI run re-scoped the phase. macOS (both Node legs) + ubuntu went green — the realpath fix is proven and also fixed the Windows `recommendation` tests — while windows-latest surfaced Windows-only timeout + EBUSY-cleanup issues outside this DRAFT's scope. Per operator decision ("land macOS, defer Windows"), AC-2 + the windows leg are deferred to `rec-20260603-001`; the final delivered scope is below.

## Acceptance Criteria

- AC-1: PASS — fixture root is realpath-canonical (verified green on macOS CI)
- AC-2: DEFERRED → rec-20260603-001 (Windows rename race; T2 reverted to main)
- AC-3: PASS — CI runs the full gate on ubuntu + macOS (re-scoped from three OSes)

## Tasks

- T1: DONE — realpath the testkit mkdtemp root so fixture.root is OS-canonical (macOS /tmp→/private/tmp); invariant test added. **Proven on macOS CI.**
- T2: REVERTED — injectable renameWithRetry + backoff bump built green on Linux/macOS, then reverted to main when CI showed Windows needs more than a backoff bump (and the bump likely regressed the 100-write dispatcher test). → rec-20260603-001.
- T3: DONE — ci.yml matrix os:[ubuntu,macos]×node:[20,22]; comment records the macOS unblock + still-deferred windows leg; ci-matrix.test.ts guard asserts ubuntu+macos; ci-success aggregate intact.

## Decisions

- Land the proven macOS unblock now; defer the windows-latest leg rather than band-aid Windows test timeouts (CLAUDE.md: no per-test timeout band-aids). Operator-confirmed.

## Deferred

- **windows-latest CI leg** → `rec-20260603-001`: Windows-only test timeouts (`settle-security-audit`, `dispatcher` 100-write cap) + temp-cleanup `EBUSY` past the fixture rm retry budget. Needs Windows-verifiable iteration.

## Skill audit

_(none)_
