---
phase: mil-rec-rec-20260725-001
id: 00-00
status: PENDING
---

# 00-00 — release-integrity.mjs's post-publish npm verification retries too briefly, causing false-red Release workflow runs

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260725-001`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

verifyNpmPackages's retry() call uses the default 3 attempts with 1s/2s delays (~3s total patience) to confirm each package is live on npm after publish. This is far shorter than npm's CDN can take to propagate a fresh publish -- confirmed live 2026-07-25: the v1.51.0 Release workflow run (30136637570) failed its 'Create GitHub Release and verify registry' step because host-codex still showed 1.50.0 on npm 3 retries (~3s) after publish, even though the publish itself succeeded and all four packages were confirmed correctly live on independent re-check moments later. The same retry() helper is also used pre-publish (verifyNpmPublished, to skip an already-done publish) where a fast failure IS correct behavior -- so the fix isn't a blanket timeout bump, it's giving the post-publish verification call in runReleaseIntegrity a distinctly more patient budget (e.g. ~10 attempts with a few seconds' backoff each, ~1-2 minutes total) while leaving the pre-publish idempotency check fast.

## Acceptance Criteria

### AC-1: release-integrity.mjs's post-publish npm verification retries too briefly, causing false-red Release workflow runs
Given _(precondition)_
When _(action)_
Then _(outcome)_

## Constraints

- _(constraint)_

## Open Questions

- _(question)_
