---
'@thomas-powers-jr/cadence-core': minor
'@thomas-powers-jr/cadence-types': minor
'@thomas-powers-jr/cadence-host-claude-code': minor
'@thomas-powers-jr/cadence-host-codex': minor
'@thomas-powers-jr/cadence-host-toolkit': minor
---

Renamed the npm scope to `@thomas-powers-jr` across all five published
packages, matching the GitHub org rename in #360. This is a rename of
existing software on its existing 1.x version lineage, not a new product —
consistent with the standing pre-v2.0.0 semver policy.

The previously-published packages under the old scope are not deleted —
they stay resolvable and get `npm deprecate`d with a pointer to the new
scope, as a separate operator-run step after this release. See
[docs/migration-npm-scope.md](../docs/migration-npm-scope.md) for the full
migration path, including the exact `cadence doctor --fix --wire-host`
command that repairs an existing consumer's host-adapter hook install.

`cadence doctor`'s host-hooks and `cadence config explain`'s warnings both
now distinguish a hook entry that's missing entirely from one that's
present but still pointing at the old scope — previously both cases
reported the same "not found" message, which was factually wrong for the
second case.
