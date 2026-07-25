---
name: release-cut
description: Cut and verify a CADENCE release end-to-end — inventory unreleased phases, audit changesets, lockstep version bump, a full doc-sync verification pass (automated doc tests + manual stale-version-reference sweep), release PR, operator-triggered Release workflow, and independent npm/tag/GitHub verification. Use when the user says "cut a release", "release vX.Y", "publish to npm", or when a release phase begins.
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
- Add a matching `## [x.y.z]` heading to `CHANGELOG.md` for the new version,
  in the same commit. The same doc-sync pre-commit hook now checks
  CHANGELOG.md too — it aborts the commit if the newest heading doesn't
  match — and `packages/core/tests/docs/doc-sync-hook.test.ts` has a second
  `describe` block that re-asserts it in CI.
- Run the full pipeline locally: `pnpm turbo run lint typecheck test build`.

## 3 — Doc-sync verification (mandatory, not implied by the pipeline run)

Step 2's full pipeline only proves the *automated* doc-content tests pass —
it does not prove every doc mentioning the old version got updated, since
several repo docs (`DESIGN.md`, `docs/*`) carry version references with no
test covering them.

- Run the doc-content test surface explicitly and confirm it's green:
  `pnpm --filter @manehorizons/cadence-core test -- tests/docs`,
  `pnpm --filter @manehorizons/cadence-host-claude-code test -- docs-command-count docs-published`,
  `pnpm --filter @manehorizons/cadence-host-codex test -- docs-published`.
- Grep the whole repo for the **previous** version string and triage every
  hit: `grep -rn "<old-version>" --include="*.md" . | grep -v node_modules |
  grep -v CHANGELOG | grep -v '\.cadence/' | grep -v '\.changeset/'`. A hit
  in a CHANGELOG or a "reconstructed for vX.Y.Z" narrative note is
  historical and correct as-is; a hit describing *current* state (e.g.
  `DESIGN.md`'s "Current architecture (as of vX.Y.Z)" line, which slipped
  once already in the v1.43.0 cut) needs bumping to the new version.
- Note anything fixed (or anything left alone with its reason) in the
  release PR body and the handoff.

## 4 — Release PR

- Subject: `chore(release): vX.Y.Z -- <one-line bundle summary>`.
- Land it via the `pr-land` skill (protected main; `ci-success` required;
  merge only on explicit operator consent).

## 5 — Publish (operator-triggered, never automatic)

- After the release PR merges, ask for the explicit go-ahead, then trigger
  the manual `Release` workflow
  (`gh workflow run Release` / `.github/workflows/release.yml`).
- **Never `gh run rerun --failed` on the Release workflow.** It re-runs
  `pnpm -r publish` and fails on already-published versions; a red
  release-integrity step is often just an npm-CDN propagation race.

## 6 — Verify independently (never trust the workflow's own report)

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

## 7 — Close the loop

- Settle the release phase (single-commit convention) if it ran as one.
- Promote recommendations now shipped immediately, don't defer it:
  `settle run --ship-ref "<PR/vX.Y.Z>"` in the same settle, or `cadence
  recommendation promote <id> --status=shipped --ref "..."` right after
  publish verification — in the same commit/push, not a later pass.
- Write the session handoff: version live, bundle list, any slips or flakes
  encountered, next candidates.
