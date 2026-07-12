#!/usr/bin/env bash
# On-camera script for the asciinema recording. Setup is pre-staged off-camera.
cd /tmp/rec-demo
CADENCE="node /home/claude/cadence/packages/core/bin/cadence.cjs"
G='\033[1;32m'; R='\033[1;31m'; C='\033[1;36m'; D='\033[2m'; N='\033[0m'

type_cmd() {  # simulate typing a command at a prompt
  printf "${G}\$${N} "
  local s="$1"
  for ((i=0; i<${#s}; i++)); do printf '%s' "${s:$i:1}"; sleep 0.032; done
  printf '\n'; sleep 0.34
}
say() { sleep 0.595; printf "${D}# %s${N}\n" "$1"; sleep 1.785; }

say "an AI agent just implemented prorated refunds. tests are honest:"
type_cmd "npm test"
npm test 2>&1 | grep -E '^(ok|not ok|# (pass|fail))' | sed -E "s/^not ok(.*)/$(printf "${R}")not ok\1$(printf "${N}")/"
sleep 2.04

say "AC-2 fails — a one-cent rounding bug. watch what the agent does:"
cp /home/claude/demo-pkg/demo-test-gutting/files/prorate.test.gutted.mjs tests/prorate.test.mjs
type_cmd "git diff tests/"
git --no-pager diff --color=always -U1 tests/ | tail -9
sleep 2.04

say "assertion gutted. suite is green now. tasks marked DONE:"
type_cmd "npm test && cadence done T1 && cadence done T2"
npm test 2>&1 | grep -E '^# (pass|fail)'
$CADENCE done T1 2>&1 | tail -1
$CADENCE done T2 2>&1 | tail -1
git add -A
sleep 2.04

say "CI would merge this. cadence:"
type_cmd "cadence settle run --auto"
$CADENCE settle run --auto 2>&1 | sed -E "s/^(settle run refused.*)/$(printf "${R}")\1$(printf "${N}")/"
type_cmd "echo \$?"
printf "${R}1${N}\n"
sleep 2.04

say "your CI was green - Cadence still correctly rejected it!"
sleep 1.785

say "the only way out is through — fix the bug, restore the assertion:"
cp /home/claude/demo-pkg/demo-test-gutting/files/prorate.fixed.mjs src/prorate.mjs
cp /home/claude/demo-pkg/demo-test-gutting/files/prorate.test.honest.mjs tests/prorate.test.mjs
git add -A
type_cmd "npm test && cadence settle run --auto"
npm test 2>&1 | grep -E '^# (pass|fail)'
$CADENCE settle run --auto 2>&1 | sed -E "s/^(Settled.*)/$(printf "${G}")\1$(printf "${N}")/"
sleep 1.02
say "settled on evidence, not on the agent's word."
sleep 2.04
