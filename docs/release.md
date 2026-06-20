# Release Process

Cadence releases are deliberate and workflow-driven. Local machines prepare the
version bump and changelog; GitHub Actions performs the public npm publish with
provenance and finishes the repository release record.

## Done Bar

A release is done only when all four public records agree:

- npm shows the new version for every public `@manehorizons/cadence-*` package.
- `origin` has the matching `v<version>` git tag.
- GitHub has a non-draft Release for that exact tag.
- GitHub marks that Release as the latest release.

The Release workflow enforces that done bar after publish. It publishes the
packages, pushes the tag, creates or updates the GitHub Release from
`packages/core/CHANGELOG.md`, then verifies npm, tag, and release metadata before
the job exits green.

## Prepare A Version

1. Add a changeset for the user-facing change.
2. Run the local gate: `pnpm build`, `pnpm typecheck`, `pnpm lint`, and
   `pnpm test`.
3. Run `pnpm changeset:version`.
4. Commit the version bump, changelogs, and release narrative updates.
5. Merge through a PR so the required `ci-success` check is green on `main`.

The workflow uses `packages/core/package.json` as the canonical version and checks
that every non-private `@manehorizons/cadence-*` package under `packages/` has the
same version.

## Publish

Run the **Release** workflow from GitHub Actions on `main`.

- `dry_run=false` publishes to npm, pushes `v<version>`, creates or updates the
  GitHub Release, and verifies the release record.
- `dry_run=true` only packs/validates; it does not publish, tag, or create a
  GitHub Release.

The workflow step `node scripts/release-integrity.mjs` is idempotent. If the tag
or GitHub Release already exists, it verifies the tag and updates the release
notes/latest marker instead of creating an untagged draft.

Workflow reruns are safe after a successful publish. Before publishing, the job
checks npm for the current package version; if every public package is already
published, it skips the publish command and continues to tag/release verification.

## Repair

If npm publish succeeds but the GitHub Release step fails, rerun the Release
workflow after fixing the reported mismatch. The rerun skips npm publish when the
registry is already current, then recreates/updates the tag and GitHub Release
record. The helper names the failing package, missing tag, or bad release metadata
in stderr.

For a manual repair from a checked-out `main` with GitHub auth:

```sh
node scripts/release-integrity.mjs
```

That command does not publish packages. It only creates or updates the GitHub
Release and verifies that npm, the remote tag, and GitHub release metadata agree.
