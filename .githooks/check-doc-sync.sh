#!/usr/bin/env bash
# Pure version-freshness checker (doc-sync gate).
#
# Reads doc text on stdin; exits 0 if it mentions <expected-version>, else 1.
# Knows nothing about git — it is the testable unit behind the pre-commit /
# pre-push hooks, which feed it the right (version, CLAUDE.md) pair from the
# git context. Tested in packages/core/tests/docs/doc-sync-hook.test.ts.
#
# Usage: check-doc-sync.sh <expected-version> [doc-label]   # doc text on stdin
set -euo pipefail

expected="${1:?usage: check-doc-sync.sh <expected-version> [doc-label] (doc text on stdin)}"
label="${2:-CLAUDE.md}"

doc="$(cat)"

# Match the version as a whole token: dots escaped, and not flanked by another
# digit or dot — so "1.10.0" is satisfied by "`1.10.0`" but NOT by "1.1.0",
# "11.10.0", or "1.10.01".
escaped="${expected//./\\.}"
if printf '%s' "$doc" | grep -Eq "(^|[^0-9.])${escaped}([^0-9.]|$)"; then
  exit 0
fi

cat >&2 <<EOF
doc-sync: ${label} does not mention version ${expected}.
  The canonical version (packages/core/package.json) changed but the ${label}
  release narrative was not updated. Add ${expected} to it, then retry.
  Bypass (use sparingly): pass --no-verify to git.
EOF
exit 1
