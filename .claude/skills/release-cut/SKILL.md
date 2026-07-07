---
name: release-cut
description: Cut and verify a CADENCE release end-to-end — inventory unreleased phases, audit changesets, lockstep version bump, CLAUDE.md doc-sync, release PR, operator-triggered Release workflow, and independent npm/tag/GitHub verification. Use when the user says "cut a release", "release vX.Y", "publish to npm", or when a release phase begins.
---

# Release cut

Publishing is irreversible. Two hard consent gates in this flow: merging the
release PR, and firing the Release workflow. Neither happens on a generic
"continue" — restate the action and get an explicit go-ahead.

## 1 — Inventory what ships

- `git fetch origin --prune`, then
  `git log $(git describe --tags --abbrev=0)..origin/main --oneline --no-merges`.
- Map commits to phases; write the bundle list (this becomes the PR body and
  the CLAUDE.md version-line summary).
- **Audit changesets**: every feature PR in the bundle should have left a
  `.changeset/*.md`. For any missing one (discipline has slipped before —
  five had to be reconstructed retroactively for v1.42.0), reconstruct it
  from the PR description now, and note the slip in the handoff.

## 2 — Version bump (lockstep)

- On a release branch: `pnpm changeset:version`.
- Verify **all four published packages** (`core`, `types`,
  `host-claude-code`, `host-codex`) moved to the identical new version and
  `testkit` did not. Anything else is a stop-and-investigate.
- Update the version line near the top of `CLAUDE.md` to the new version
  string. The doc-sync pre-commit hook aborts the commit otherwise, and
  `packages/core/tests/docs/doc-sync-hook.test.ts` re-asserts it in CI.
- Run the full pipeline locally: `pnpm turbo run lint typecheck test build`.

## 3 — Release PR

- Subject: `chore(release): vX.Y.Z -- <one-line bundle summary>`.
- Land it via the `pr-land` skill (protected main; `ci-success` required;
  merge only on explicit operator consent).

## 4 — Publish (operator-triggered, never automatic)

- After the release PR merges, ask for the explicit go-ahead, then trigger
  the manual `Release` workflow
  (`gh workflow run Release` / `.github/workflows/release.yml`).
- **Never `gh run rerun --failed` on the Release workflow.** It re-runs
  `pnpm -r publish` and fails on already-published versions; a red
  release-integrity step is often just an npm-CDN propagation race.

## 5 — Verify independently (never trust the workflow's own report)

Run all three, regardless of what the workflow says:

```bash
npm view @manehorizons/cadence-core version
npm view @manehorizons/cadence-types version
npm view @manehorizons/cadence-host-claude-code version
npm view @manehorizons/cadence-host-codex version
git ls-remote --tags origin | grep vX.Y.Z
gh release view vX.Y.Z
```

Decision table on a red/ambiguous run: check what is *actually* missing.
All four on npm + tag + release page present → the run's red was cosmetic;
done. Packages on npm but tag/release missing → create only the missing
artifact by hand (`git tag -a` + push, `gh release create`). Some packages
missing on npm → wait out propagation (minutes), re-check before touching
anything; only then consider a targeted republish.

## 6 — Close the loop

- Settle the release phase (two-commit convention) if it ran as one.
- Promote recommendations now shipped: `settle run --ship-ref "<PR/vX.Y.Z>"`
  in the same settle, or `cadence recommendation promote <id>
  --status=shipped --ref "..."` after the fact.
- Write the session handoff: version live, bundle list, any slips or flakes
  encountered, next candidates.
