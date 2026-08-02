#!/usr/bin/env bash
# Cadence demo: "Your CI is green. Cadence still said no."
# Replays the test-gutting arc end-to-end in a throwaway repo.
#
# Usage:   ./run-demo.sh [path-to-cadence-cli]
# Default: uses `cadence` from PATH (npm i -g @thomas-powers-jr/cadence-core).
# Requires: node >= 20, git. Zero npm deps (uses node:test).
set -euo pipefail

CADENCE="${1:-cadence}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)/refund-service"
mkdir -p "$WORK" && cd "$WORK"

step() { printf '\n\033[1;36m═══ %s ═══\033[0m\n' "$1"; }
pause() { [ -t 0 ] && read -rp $'\n  [enter to continue]' || true; }

step "Scaffold: a tiny refund service (node:test, zero deps)"
git init -q -b main
cat > package.json <<'PKG'
{
  "name": "refund-service",
  "type": "module",
  "scripts": { "test": "node --test tests/*.test.mjs" }
}
PKG
mkdir src tests
git add -A && git commit -qm scaffold

$CADENCE init --gate-profile auto >/dev/null 2>&1
node -e '
const fs=require("fs"),p=".cadence/config.json",c=JSON.parse(fs.readFileSync(p));
c.verification.testGlobs=["**/*.test.mjs"];
c.verification.coverageMode="assertion";
c.verification.testCommand="node --test tests/*.test.mjs";
fs.writeFileSync(p,JSON.stringify(c,null,2));
'
echo "  cadence init done — coverageMode=assertion, testCommand wired."

step "DRAFT: 3 acceptance criteria, approved into BUILD"
$CADENCE draft new --title "Prorated refund calculation" --template feature >/dev/null 2>&1
cp "$HERE/DRAFT.md" .cadence/phases/01-prorated-refund-calculation/01-01-DRAFT.md
$CADENCE draft approve 01-prorated-refund-calculation 01
pause

step "BUILD: agent implements. Honest tests. AC-2 FAILS (rounding bug: 66.66 != 66.67)"
cp "$HERE/files/prorate.buggy.mjs"       src/prorate.mjs
cp "$HERE/files/prorate.test.honest.mjs" tests/prorate.test.mjs
npm test 2>&1 | grep -E '^(ok|not ok|# pass|# fail)' || true
pause

step "THE AGENT'S MOVE: gut the failing assertion. Suite goes GREEN."
cp "$HERE/files/prorate.test.gutted.mjs" tests/prorate.test.mjs
git --no-pager diff --no-color -- tests/prorate.test.mjs | sed 's/^/  /'
npm test 2>&1 | grep -E '^(# pass|# fail)'
$CADENCE done T1 >/dev/null 2>&1 || true
$CADENCE done T2 >/dev/null 2>&1 || true
git add -A
echo
echo "  Suite: GREEN.  Tasks: DONE.  Agent: \"shipped.\"  CI would merge this."
pause

step "THE MONEY SHOT: cadence settle run --auto"
set +e
$CADENCE settle run --auto
RC=$?
set -e
echo
echo "  exit code: $RC   ← your CI is green. Cadence still said no."
pause

step "REDEMPTION: fix the bug for real, restore the assertion"
cp "$HERE/files/prorate.fixed.mjs"        src/prorate.mjs
cp "$HERE/files/prorate.test.honest.mjs"  tests/prorate.test.mjs
npm test 2>&1 | grep -E '^(# pass|# fail)'
git add -A
$CADENCE settle run --auto
echo
echo "  Settled. The loop only closes on evidence."
echo
echo "  Demo repo left at: $WORK"
