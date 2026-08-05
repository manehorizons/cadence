# T2 — ip-address moderate-advisory evidence (before/after)

This is an **evidence-only** artifact. It records the before/after state for
two undocumented MODERATE-severity `ip-address` advisories that phase 253's
dependency-override remediation closed as a side effect of fixing a
different, unrelated defect (stale/missing `pnpm.overrides` targets). No row
is added to `docs/security/audit-exceptions.md`'s exceptions table for
either advisory — see "Why no exceptions-table row" below.

Advisories: `GHSA-4xrf-jv44-h6hh` and `GHSA-22jq-vg5j-6vgg`, both against the
`ip-address` npm package, both MODERATE severity.

## Before — pre-phase-253 (ip-address@10.2.0, no override)

Source (phase 253's own artifacts, main checkout — full repo-relative
paths):

- `.cadence/phases/253-dependency-override-remediation/253-01-DRAFT.md`
  (Boundaries section, line 112) names both advisories directly and states
  the intended handling:
  > "the two undocumented moderate `ip-address` advisories
  > (GHSA-4xrf-jv44-h6hh, GHSA-22jq-vg5j-6vgg) are captured as evidence
  > only."
- `.cadence/phases/253-dependency-override-remediation/253-01-DRAFT.md`
  (lines 19 and 84, the "corrected remediation table"): `ip-address` had
  **no override at all** prior to this phase, and the corrected target set
  for it is `>=10.3.1` (a new override, alongside the three pre-existing
  but stale ones for `fast-uri` and `brace-expansion`'s two lines).
- `.cadence/phases/253-dependency-override-remediation/253-01-T3-EVIDENCE.md`
  (lines 114-118, "Baseline sanity" note, recorded from a read-only check
  of the phase-253 worktree *before* T4 applied the fix):
  > "`brace-expansion` resolves to two lines (`2.1.2` with no override,
  > `5.0.7` which has one), `ip-address` resolves to `10.2.0` with no
  > override at all — matching the DRAFT's diagnosis."

So: pre-253, `pnpm-lock.yaml` resolved `ip-address@10.2.0` with no
`pnpm.overrides` entry constraining it. This is independently confirmed by
the T3-EVIDENCE baseline-sanity read above.

**Caveat on the advisory-affected-range claim:** none of phase 253's
artifacts state which `ip-address` version ranges `GHSA-4xrf-jv44-h6hh` and
`GHSA-22jq-vg5j-6vgg` affect, or assert outright that both were present at
10.2.0 specifically — the only place either GHSA id appears anywhere in
this repo's history is the `253-01-DRAFT.md:112` "evidence only" boundary
note. That "both present at 10.2.0, cleared at >=10.3.1" reading is
inherited from phase 253's own choice of `>=10.3.1` as the corrected floor
(i.e., whoever wrote that DRAFT line had already resolved both advisories
against an advisory database when picking that floor) — it is not
independently re-verified here against a live advisory database, because
this task has no network access. Treat the "before" half of this evidence
as inherited from phase 253's stated conclusion, not freshly re-derived;
the "after" half (below) *is* independently re-verified against the live
lockfile in this tree.

Requester chain: `express-rate-limit@8.5.2` declares
`"ip-address": "^10.2.0"` in its own package manifest's `dependencies`
(checked against the installed copy's `package.json` under
`node_modules/.pnpm/express-rate-limit@8.5.2_express@5.2.1/` — a
pnpm-content-addressed install path, not itself a repo artifact). Phase 253
only edited the override target, never `express-rate-limit`'s own manifest,
so this declared range is unchanged before and after. At the time the
pre-253 lockfile was written, absent any override, pnpm's resolver picked
the highest version satisfying `^10.2.0` available at that time, which was
`10.2.0` itself (standard semver-resolver behavior: highest available
satisfying version, not lowest — `253-01-T3-EVIDENCE.md`'s Finding 2
demonstrates the related-but-distinct point that override matching is
declared-range intersection, not natural-resolution match; it doesn't state
the highest-available rule directly, so it's cited here only for its two
worked examples showing the resolver picking the highest satisfier).

## After — current tree (ip-address@>=10.3.1 via phase 253's override)

Source (phase 253's own artifacts, full repo-relative paths):

- `.cadence/phases/253-dependency-override-remediation/253-01-T5-EVIDENCE.md`
  (line 137) — the final `package.json` `pnpm.overrides` diff phase 253
  shipped includes the new key:
  ```
  +      "ip-address@^10.0.0": "^10.3.1"
  ```
- `.cadence/phases/253-dependency-override-remediation/253-01-SUMMARY.md`
  (line 20) — T4's completion note names "ip-address as a new override
  >=10.3.1" as one of the four applied targets (reviewer-confirmed against
  the real lockfile), and separately, in the same line's "Main-thread
  re-verified" clause, confirms "resolved versions 5.0.9/2.1.4/3.1.5/
  **10.4.0** all satisfy their new floors" — two distinct verification
  events (independent reviewer, then orchestrator) both supporting the
  ip-address after-state, not one continuous statement.

Verified now, directly against this worktree's current `pnpm-lock.yaml`
(command output below): the override key `ip-address@^10.0.0: ^10.3.1` is
present in the `overrides:` header, and `ip-address` resolves to `10.4.0`
everywhere in the lockfile — one resolved instance, requested by
`express-rate-limit@8.5.2(express@5.2.1)`. `10.4.0` satisfies `>=10.3.1`,
so both `GHSA-4xrf-jv44-h6hh` and `GHSA-22jq-vg5j-6vgg` are cleared in the
current tree.

Commands run in this worktree
(`/home/thomas/projects/cadence/.claude/worktrees/254-security-advisory-remediation`):

```
$ grep -n -B3 -A3 "^  ip-address@" pnpm-lock.yaml
10-  read-yaml-file@1.1.0: ^2.1.0
11-  js-yaml@4.2.0: ^4.3.0
12-  fast-uri@3.1.2: ^3.1.5
13:  ip-address@^10.0.0: ^10.3.1
14-
15-importers:
16-
--
1440-  inherits@2.0.4:
1441-    resolution: {integrity: sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==}
1442-
1443:  ip-address@10.4.0:
1444-    resolution: {integrity: sha512-oSK96Grm3aP6OrS263xVxbNDGVL7rzBtYdpGqlDG8iQdoenDoTs/nkki+DflYbAEE8Xl6o5YxhxlrKvI3nqKXQ==}
1445-    engines: {node: '>= 12'}
--
3370-
3371-  inherits@2.0.4: {}
3372-
3373:  ip-address@10.4.0: {}

$ grep -n "ip-address" pnpm-lock.yaml
13:  ip-address@^10.0.0: ^10.3.1
1443:  ip-address@10.4.0:
3166:      ip-address: 10.4.0
3373:  ip-address@10.4.0: {}

$ sed -n '3160,3167p' pnpm-lock.yaml
  express-rate-limit@8.5.2(express@5.2.1):
    dependencies:
      express: 5.2.1
      ip-address: 10.4.0
```

Only one resolved `ip-address` line exists in the lockfile (`10.4.0`); there
is no second, unpatched instance anywhere in the tree.

## Why no exceptions-table row

`docs/security/audit-exceptions.md`'s table is cross-checked by
`scripts/check-audit-exceptions.mjs`, whose `extractHighSeverityAdvisories`
function filters strictly on
`const HIGH_SEVERITIES = new Set(['high', 'critical'])` (line 16) — moderate
advisories are never extracted from the audit JSON and therefore never
reach the table-lookup logic at all. Adding a row for either
`GHSA-4xrf-jv44-h6hh` or `GHSA-22jq-vg5j-6vgg` would be dead weight the
parser never reads (per this phase's DRAFT boundary,
`254-01-DRAFT.md`: "Do NOT add exceptions-table rows for the two moderate
ip-address advisories — the parser only reads high/critical; a row would be
dead weight."). No table edit was made by this task.

## Summary

| | Before (pre-phase-253) | After (current tree) |
| --- | --- | --- |
| `ip-address` resolved version | `10.2.0` | `10.4.0` (independently re-verified) |
| Override present | none | `ip-address@^10.0.0: ^10.3.1` (independently re-verified) |
| `GHSA-4xrf-jv44-h6hh` | present\* | cleared (>=10.3.1 satisfied) |
| `GHSA-22jq-vg5j-6vgg` | present\* | cleared (>=10.3.1 satisfied) |
| Requester | `express-rate-limit@8.5.2` (`^10.2.0`) | `express-rate-limit@8.5.2` (`^10.2.0`, same declared range — resolution changed via override, not a requester bump) |

\* Before-column advisory presence is inherited from phase 253's own conclusion (see "Caveat" above), not independently re-verified here against a live advisory database — unlike every After-column claim, which is.

This task alone does not close AC-2 — T3 also contributes evidence toward
it — this file records only the ip-address moderate-advisory half.
