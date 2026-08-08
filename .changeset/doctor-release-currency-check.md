---
"@thomas-powers-jr/cadence-core": minor
---

Added a new `cadence doctor` check, `release-currency`, that warns when the local repo's publishable content has drifted from what npm actually serves under the matching version — closing the gap behind a real incident where a `package.json` `engines` bump landed on `main` but the previously-published tarball under the *same* version string still declared the old floor, undetected for days because nothing ever compared content, only version numbers.

It compares local `packages/core/package.json`'s `engines` field against npm's published `engines` for that package (`npm view <pkg> engines --json`), and independently flags any pending `.changeset/*.md` files awaiting release, naming each one's bump type (when reported on its own, wording escalates if any pending changeset declares a `major` or `minor` bump). Both signals fold into a single `warning`-severity finding (never `error`) with `fixId: null`: this is a manual, judgment-call fix (cut a release, or confirm the divergence is intentional), never auto-applied by `--fix`.

Fully best-effort and non-blocking. If the local `package.json` is missing, unparseable, or `private: true`, the whole check is skipped with a silent `ok`. If the `npm view` fetch fails — no network, an unpublished/private package, or a timeout — only the `engines` comparison is skipped; the pending-changesets signal is still evaluated. It never throws and never fails the `cadence doctor` exit code on its own.
