# T3 — Override key grammar experiment: evidence log

Recorded by the orchestrator after T3's implementer and an independent
reviewer both ran real commands in disposable scratch dirs (never touching
the phase worktree). This file satisfies T3's own verify line ("record the
experiment transcript and resulting diff... before T6 rewrites doc prose").

## Finding 1 — the "pnpm field no longer read" warning's real source

The PATH-installed `pnpm` is a shim resolving to a globally-installed pnpm
v11.2.2 launcher (`.../pnpm/global/v11/.../@pnpm/exe/pnpm`, `package.json`
reports `"version":"11.2.2"`). It prints the warning, then self-switches
down to this repo's `packageManager`-pinned `pnpm@9.12.0` per corepack.

Implementer transcript:
```
$ /home/thomas/.local/share/pnpm/bin/pnpm -v
[WARN] The "pnpm" field in package.json is no longer read by pnpm. The
following keys were ignored: "pnpm.overrides". See https://pnpm.io/settings
for the new home of each setting.
9.12.0

$ corepack pnpm@9.12.0 -v
9.12.0
```

Independent reviewer, isolating the warning's source two more ways (neither
prints it, even at `--loglevel debug`):
```
$ corepack pnpm@9.12.0 --loglevel debug -v      # no warning
$ node .../corepack/v1/pnpm/9.12.0/bin/pnpm.cjs -v   # no warning
```
Orchestrator spot-check (main thread, same worktree) reproduced the
implementer's exact output. **Confirmed by three independent runs.**

## Finding 2 — override matching is declared-range intersection, not natural-resolution match

An override key `"pkg@<selector>": "<target>"` fires only when `<selector>`
intersects the *declared* range of the dependent requesting the package
(direct `package.json` specifier, or transitively the requesting package's
own declared range) — not whatever version would naturally resolve absent
the override. A selector that doesn't intersect any declaring dependent's
range is **silently ignored** — no error, even at `--loglevel debug`.

Implementer's discriminating experiment (direct dep declares `^5.0.0`,
natural pick would be `5.0.9`; override selector is the exact literal
`5.0.2`, inside the declared range but not a version anything would
naturally resolve to; target `5.0.7`):
```
$ corepack pnpm@9.12.0 install
dependencies:
+ brace-expansion 5.0.7 (5.0.9 is available)
```
Fired — settling the mechanism as declared-range intersection.

Independent reviewer's own 3-experiment probe using the real `ms` package
(`^2.0.0` range, latest 2.1.3):
- Exp A: bare `"ms": "1.0.0"` → resolves 1.0.0 (sanity baseline).
- Exp B: `"ms@2.0.0": "1.0.0"` (selector ≠ natural resolution 2.1.3, but
  inside declared range `^2.0.0`) → **resolves 1.0.0**. Confirms the
  mechanism directly.
- Exp C: `"ms@1.0.0": "3.0.0-beta.0"` (selector outside `^2.0.0` entirely)
  → resolves 2.1.3 untouched, exit 0, no error/warning even at debug
  loglevel, stale key preserved verbatim in the lockfile header. This is
  the exact "stale key, silent no-op" shape of this repo's real defect.

Reviewer also confirmed via live npm metadata that `ajv@8.20.0` declares
`"fast-uri": "^3.0.1"` — explaining why this repo's stale
`fast-uri@3.1.2` override key keeps matching release after release even
though the *resolved* version has long since moved past 3.1.2.

**Confirmed independently by a second, from-scratch experiment set.**

## Finding 3 — lockfile regeneration on a real corrected target

Both the implementer and the independent reviewer, working from separate
full clones of this actual worktree's branch, changed only
`package.json`'s `pnpm.overrides."fast-uri@3.1.2"` from `"^3.1.4"` to
`"^3.1.5"` and ran `corepack pnpm@9.12.0 install`. Resulting
`pnpm-lock.yaml` diff (reproduced independently, byte-identical shape):
```diff
--- pnpm-lock.yaml (before)
+++ pnpm-lock.yaml (after)
@@ -8,7 +8,7 @@
   brace-expansion@5.0.6: ^5.0.7
   read-yaml-file@1.1.0: ^2.1.0
   js-yaml@4.2.0: ^4.3.0
-  fast-uri@3.1.2: ^3.1.4
+  fast-uri@3.1.2: ^3.1.5

@@ -1290,8 +1290,8 @@
-  fast-uri@3.1.4:
-    resolution: {integrity: sha512-8JnbkQ4juDyvYs4mgFGQqg4yCYtFDtUtmp2QIQq11ZZe5CFQ5wcqm1rqDgAh/QdMySuBnPzMUiJUNZG5N/AiQw==}
+  fast-uri@3.1.5:
+    resolution: {integrity: sha512-gHwA1O9LDIcKunMKhObS/HimwtehO1nPUECKAu5TpKgaO19fcWEl4bliWe1jWxVFvIXztJjjQ4L8XQ1EU9f7Jw==}

@@ -2859,7 +2859,7 @@
   ajv@8.20.0:
     dependencies:
       fast-deep-equal: 3.1.3
-      fast-uri: 3.1.4
+      fast-uri: 3.1.5
       json-schema-traverse: 1.0.0
       require-from-string: 2.0.2

@@ -3214,7 +3214,7 @@
-  fast-uri@3.1.4: {}
+  fast-uri@3.1.5: {}
```
The reviewer additionally checked the new integrity hash
(`sha512-gHwA1O9LDIcKunMKhObS/HimwtehO1nPUECKAu5TpKgaO19fcWEl4bliWe1jWxVFvIXztJjjQ4L8XQ1EU9f7Jw==`)
against the live npm registry for `fast-uri@3.1.5` — byte-identical match.

Baseline sanity (read-only, current worktree): `package.json`'s
`pnpm.overrides` and `pnpm-lock.yaml`'s `overrides:` header are consistent
with each other today; `brace-expansion` resolves to two lines (`2.1.2`
with no override, `5.0.7` which has one), `ip-address` resolves to
`10.2.0` with no override at all — matching the DRAFT's diagnosis.

## Design implication for T2/T4 (recorded, not yet acted on)

A **range-scoped** override selector (e.g. `brace-expansion@^2.0.0`) is
more drift-resistant than an exact-version selector, since an exact
selector goes silently dead the moment the declaring dependent's own
range moves off that literal (Finding 2). AC-1 only specifies target
floors, not selector form — T2/T4's implementer should weigh this when
choosing selector syntax for the new/corrected override keys.

## Verdict

Both the implementer's original experiment and the independent reviewer's
from-scratch re-derivation agree on all three findings. The reviewer also
confirmed the "misleading launcher warning" claim via direct spot-check in
this real worktree (see conversation record). No contradiction found
between either transcript or the DRAFT's stated corrected premise.
