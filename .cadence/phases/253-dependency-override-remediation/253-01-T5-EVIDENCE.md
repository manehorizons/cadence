# T5 — Detector teeth: evidence log

Records the commands run and their verbatim output proving
`scripts/check-lockfile-overrides.mjs` actually fails when an override
target in `package.json`'s `pnpm.overrides` no longer covers a resolved
instance in `pnpm-lock.yaml`, and passes again once restored. Per this
repo's "Self-Report Trust" convention, this is the durable record — not
just a self-report in a session transcript.

## Baseline (before any mutation)

```
$ node scripts/check-lockfile-overrides.mjs
check-lockfile-overrides: 6 override target(s), all resolved instances satisfied
$ echo $?
0
```

(6, not 4 — `read-yaml-file@1.1.0` and `js-yaml@4.2.0` are pre-existing
override entries the phase didn't touch; the four phase-253-corrected
entries are `brace-expansion@5.0.6`, `brace-expansion@^2.0.0`, `fast-uri@3.1.2`,
`ip-address@^10.0.0`.)

`pnpm-lock.yaml` was already `M` (modified, uncommitted) at the start of
this task from T1–T4's earlier lockfile regeneration. This task never ran
`pnpm install` and never edited `pnpm-lock.yaml` — confirmed by `git status
--short -- pnpm-lock.yaml` showing the same pre-existing diff throughout,
untouched by any command below.

## Experiment 1 (negative result) — the dispatch prompt's suggested fast-uri example does NOT fail

The orchestrator's task-dispatch prompt offered as a suggested example:
change `"fast-uri@3.1.2": "^3.1.5"` back to `"^3.1.4"` (this suggestion does
not appear anywhere in `253-01-DRAFT.md` itself — it was dispatch-prompt
phrasing, not a DRAFT-specified example). Tried first, verbatim:

```
$ git diff package.json   # only line touched: fast-uri target ^3.1.5 -> ^3.1.4
...
-      "fast-uri@3.1.2": "^3.1.5",
+      "fast-uri@3.1.2": "^3.1.4",
...

$ node scripts/check-lockfile-overrides.mjs
check-lockfile-overrides: 6 override target(s), all resolved instances satisfied
$ echo $?
0
```

**This does not fail.** `pnpm-lock.yaml` resolves `fast-uri@3.1.5`, and
`3.1.5` genuinely satisfies caret range `^3.1.4` (same major, floor met) —
correct semver behavior, not a detector bug. A "reversion" to a lower
same-major floor is, by definition, still satisfied by a resolved version
that is >= that floor. This is true for any of the four corrected entries
if you only lower the floor within the same major (also true for
`brace-expansion@5.0.6`'s prior `^5.0.7` vs resolved `5.0.9`). Reverted
immediately (verified via `git diff package.json` showing zero net change
from the phase-253 baseline before proceeding to Experiment 2).

**Conclusion:** to demonstrate a real FAIL, the override target must either
(a) require a floor *above* what's actually resolved (the `unsatisfied`
failure branch), or (b) stop matching the resolved instance's major version
at all (the `unguarded-line` failure branch — the actual shape of the
historical defect this phase fixed for `brace-expansion`'s 2.x line, per
`253-01-T3-EVIDENCE.md`: "brace-expansion resolves to two lines (2.1.2 with
no override, 5.0.7 which has one)"). Both are exercised below.

## Experiment 2 — `unsatisfied` failure branch

Mutation: `"brace-expansion@^2.0.0": "^2.1.4"` -> `"^2.1.5"` (requires a
floor one patch above what `pnpm-lock.yaml` actually resolves, `2.1.4`).

```
$ node scripts/check-lockfile-overrides.mjs
check-lockfile-overrides: FAIL brace-expansion@2.1.4 does not satisfy its override target range ^2.1.5 (package.json's pnpm.overrides expects ^2.1.5, but pnpm-lock.yaml resolves 2.1.4)
check-lockfile-overrides: 1 override target(s) unsatisfied or unguarded; refresh package.json's pnpm.overrides and re-run `pnpm install` to regenerate pnpm-lock.yaml
$ echo $?
1
```

FAIL line printed to stderr, names the package (`brace-expansion`), the
resolved version (`2.1.4`), and the instance (`brace-expansion@2.1.4`), as
required. Exit code non-zero (1). Reverted back to `^2.1.4` immediately
after capture.

## Experiment 3 — `unguarded-line` failure branch (the actual historical defect shape)

Mutation: deleted the `"brace-expansion@^2.0.0": "^2.1.4"` entry entirely —
literally the pre-phase-253 committed state (this key does not exist in
`HEAD`'s `package.json`; only `brace-expansion@5.0.6: ^5.0.7` existed there,
covering only the 5.x line). This reproduces the real, historical
"brace-expansion's 2.x line has zero override coverage" gap that phase 253
fixed.

```
$ node scripts/check-lockfile-overrides.mjs
check-lockfile-overrides: FAIL brace-expansion@2.1.4 resolves in pnpm-lock.yaml but no pnpm.overrides target covers its major-version line (package.json has an override for brace-expansion, but not for this resolved major)
check-lockfile-overrides: 1 override target(s) unsatisfied or unguarded; refresh package.json's pnpm.overrides and re-run `pnpm install` to regenerate pnpm-lock.yaml
$ echo $?
1
```

FAIL line printed to stderr, names the package/instance
(`brace-expansion@2.1.4`) and explains the coverage gap. Exit code
non-zero (1). Reverted (re-added the deleted line) immediately after
capture.

## Final restore + PASS re-run

```
$ node scripts/check-lockfile-overrides.mjs
check-lockfile-overrides: 6 override target(s), all resolved instances satisfied
$ echo $?
0
```

`git diff package.json` (net change from HEAD, i.e. the pre-existing,
untouched-by-this-task phase-253 diff — identical before Experiment 1 and
after Experiment 3):

```diff
diff --git a/package.json b/package.json
index 583c7596..99fb2fa1 100644
--- a/package.json
+++ b/package.json
@@ -33,10 +33,12 @@
   },
   "pnpm": {
     "overrides": {
-      "brace-expansion@5.0.6": "^5.0.7",
+      "brace-expansion@5.0.6": "^5.0.9",
+      "brace-expansion@^2.0.0": "^2.1.4",
       "read-yaml-file@1.1.0": "^2.1.0",
       "js-yaml@4.2.0": "^4.3.0",
-      "fast-uri@3.1.2": "^3.1.4"
+      "fast-uri@3.1.2": "^3.1.5",
+      "ip-address@^10.0.0": "^10.3.1"
     }
   }
 }
```

`git hash-object package.json` after the final restore:
`99fb2fa19a9bc0286b4055c382f7b23a20beac3a` — matches the blob hash shown as
the diff's "after" side at every restore checkpoint in this session
(Experiment 1's revert, Experiment 2's revert, and this final one),
confirming the file returned to byte-identical content each time. Net
change from this task: zero. `pnpm-lock.yaml` was never touched (still the
same pre-existing `M` from T1–T4's regeneration, no new diff introduced by
this task).

## Note for whoever writes T6's doc prose

The dispatch prompt's suggested fast-uri example (`^3.1.5` -> `^3.1.4`) does
not actually trigger a detector FAIL against the current lockfile — see
Experiment 1. If T6 or later docs cite a worked "how to see it fail"
example, use Experiment 2 or 3's mutation instead, not the fast-uri one.

## Scope caveat: what this detector does and does not catch

Independent review flagged this explicitly (recorded here per this repo's
"Unlogged Audit Finding" convention rather than left only in a review
transcript): the detector catches an override target that no longer covers
a resolved instance (`unsatisfied`) or a resolved major-version line with
no override at all (`unguarded-line`) — both demonstrated above. It does
**not** catch an override target that is internally self-consistent (the
resolved version satisfies its own declared floor) but whose floor itself
sits below the *real current upstream patched version* — i.e. exactly the
original failure shape this phase corrected for `fast-uri`/`brace-expansion`
(a stale floor the lockfile happily satisfied). Detecting that class would
require cross-checking override floors against a live vulnerability feed
(effectively `pnpm audit`'s job, already covered separately by
`scripts/check-audit-exceptions.mjs`), not this detector's lockfile-internal
consistency check. Filed as a low-priority recommendation
(`rec-20260805-002`) rather than silently left as an implicit limitation.
