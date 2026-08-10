# 263-01 — AC-4 query evidence (T5)

Captured 2026-08-08 from a clean rebuild (`pnpm --filter @thomas-powers-jr/cadence-types build`
then `pnpm --filter @thomas-powers-jr/cadence-core build`) in this worktree
(`/home/thomas/projects/cadence/.claude/worktrees/263-provider-selection-provenance`),
Node v22.22.3. All output below is real, unedited command output.

**Load-bearing precondition, checked before trusting the sweep:** the sweep
only proves anything about `providerSelection` if the built artifact
`cadence summary verify` actually ran against contains the field with no
`.default(...)` — the exact mechanism `summary-hash.ts` hashes (the PARSED
object, post-schema). Confirmed directly against the rebuilt output:

```sh
grep -n providerSelection packages/types/dist/summary.js
```

```
154:    providerSelection: z.enum(['configured', 'fallback', 'empty-diff']).optional(),
```

No `.default(...)` present in the built artifact. The sweep below ran
against this build.

At the time of this run, T1–T4 are DONE but this phase has **not** been
settled (settle is explicitly forbidden for T5) — so there is no
`263-01-SUMMARY.json` yet, and the corpus swept below is every
`SUMMARY.json` that already exists under `.cadence/phases/`: **275 files**.
Once this phase is settled, its own `263-01-SUMMARY.json` becomes part of
that same corpus automatically — both commands below walk
`.cadence/phases/` structurally, with no hardcoded file list, so a future
re-run picks it up without modification.

## Part 1 — backward-compat sweep (`cadence summary verify`)

`cadence summary verify <phase-dir> <num>` recomputes the sha256 content
hash over a settled `SUMMARY.json` and compares it against the stored
`contentHash`, to detect a hand-edited (or, here, retroactively corrupted)
artifact. It takes one `<phase-dir> <num>` pair per invocation — there is
no built-in "sweep all" flag — so a full-corpus sweep means invoking it
once per file, exactly as the existing repo-wide precedent test
(`packages/core/tests/parse/summary-verify-sweep.test.ts`, added phase 257)
already does inside the vitest suite. This section runs that same sweep as
a standalone, human-readable command outside vitest, per T5's instruction
to capture the actual command and its actual output as evidence.

`cadence summary verify` reports one of three outcomes per file (confirmed
by direct invocation): `MATCH` (a stored `contentHash` was recomputed and
matched — exit 0), `NO_HASH` (no stored `contentHash` to compare —
pre-phase-223 record, or a refused settle that recorded no findings —
informational, exit 0), or a load/parse/schema/mismatch failure (exit
non-zero). Only `MATCH` and `NO_HASH` are both "passing," but they mean
different things — this evidence file reports both counts separately
rather than collapsing them into one pass tally, since AC-4's actual claim
("every historical record still parses and content-hashes identically")
only has bite for the subset that carries a hash to check.

### Command run

A small driver script (`sweep.sh`, disposable, not part of `files:`, run
from this worktree's repo root) walked every `*-SUMMARY.json` under
`.cadence/phases/`, derived each file's `<phase-dir>` and `<num>` the same
way `summary-verify-sweep.test.ts`'s `deriveNumArg` does (the phase
directory's leading digit run, left-padded to at least 2 chars, is
stripped as the `<phase-dir>-` prefix from the filename's `<id>` to
recover `<num>`), and invoked:

```sh
node packages/core/bin/cadence.cjs summary verify <phase-dir> <num>
```

once per file, tallying exit codes and classifying each success as
`MATCH` or `NO_HASH` by its stdout prefix:

```sh
for f in $(find .cadence/phases -name "*-SUMMARY.json" | sort); do
  phaseDir=$(echo "$f" | sed -E 's#\.cadence/phases/([^/]+)/.*#\1#')
  filename=$(basename "$f")
  id=$(echo "$filename" | sed -E 's/-SUMMARY\.json$//')
  phaseNumPrefix=$(echo "$phaseDir" | grep -oE '^[0-9]+')
  if [ ${#phaseNumPrefix} -lt 2 ]; then paddedPhase="0${phaseNumPrefix}"; else paddedPhase="${phaseNumPrefix}"; fi
  num=$(echo "$id" | sed -E "s/^${paddedPhase}-//")
  out=$(node packages/core/bin/cadence.cjs summary verify "$phaseDir" "$num" 2>&1)
  code=$?
  # tallies total/failed/MATCH/NO_HASH by exit code + stdout prefix
done
```

### Result

```
TOTAL=275 FAILED=0 MATCH=38 NO_HASH=237
```

All **275/275** existing `SUMMARY.json` records under `.cadence/phases/`
still parse (0 load/schema failures). Of those, **38 carry a stored
`contentHash`**, and **all 38 recomputed to the identical hash**
(`MATCH`) — the new, optional, no-`.default(...)` `providerSelection`
field did not retroactively change any historical record's `contentHash`.
The remaining 237 are `NO_HASH` (informational: pre-phase-223 records, or
refused settles that recorded no findings) — they parsed successfully but
carry no stored hash to compare, so they contribute to the parse claim but
not to the hash-identity claim.

Independent cross-check of the 38 figure, counted directly from the files
rather than through the CLI:

```sh
find .cadence/phases -name "*-SUMMARY.json" -print0 | xargs -0 grep -l '"contentHash"' | wc -l
```

```
38
```

Matches exactly.

### Cross-check: the equivalent vitest precedent test

The same corpus-wide claim is also exercised inside the normal test suite
by the phase-257 precedent test, re-run here after the same rebuild:

```sh
pnpm --filter @thomas-powers-jr/cadence-core test -- summary-verify-sweep
```

Result: **1 test file, 1 test, passed** —
`257-01/AC-3: every existing <id>-SUMMARY.json under .cadence/phases verifies with zero failures`.
(That test only asserts exit-code 0 across the corpus — same underlying
CLI invocation as above — so it does not distinguish `MATCH` from
`NO_HASH` either; this file's separate 38/237 tally is the more precise
record.) The `vitest` invocation's global coverage-threshold gate reports
an unrelated failure when filtered to a single test file, because
whole-repo coverage thresholds don't hold over one file's worth of
exercised lines — that is a known artifact of running a filtered subset,
not a test failure; the test itself is reported as `1 passed (1)`.

## Part 2 — queryable corpus command

One `node -e` invocation, run against the same 275-file corpus, that reports
`providerSelection` counts (`configured` / `fallback` / `empty-diff` /
absent) across every `gates[]` entry in every `SUMMARY.json` under
`.cadence/phases/`. No new dependency, no new file — the whole query is a
single command:

```sh
find .cadence/phases -name "*-SUMMARY.json" -print0 | xargs -0 node -e '
const fs = require("fs");
const counts = { configured: 0, fallback: 0, "empty-diff": 0, absent: 0 };
let files = 0, gates = 0;
for (const f of process.argv.slice(1)) {
  files++;
  const data = JSON.parse(fs.readFileSync(f, "utf8"));
  const gateList = Array.isArray(data.gates) ? data.gates : [];
  for (const g of gateList) {
    gates++;
    const ps = g && g.providerSelection;
    if (ps === "configured" || ps === "fallback" || ps === "empty-diff") {
      counts[ps]++;
    } else {
      counts.absent++;
    }
  }
}
console.log(JSON.stringify({ filesScanned: files, gatesScanned: gates, counts }, null, 2));
'
```

### Actual output

```json
{
  "filesScanned": 275,
  "gatesScanned": 1131,
  "counts": {
    "configured": 0,
    "fallback": 0,
    "empty-diff": 0,
    "absent": 1131
  }
}
```

### Positive control — proving the query can detect a non-zero result

A result of all-zero/all-absent is indistinguishable from a query bug
(wrong field name, wrong nesting level, wrong key) unless the query is
first shown to detect a real positive. Before trusting the corpus result
above, the identical query was run — unmodified except for the `find`
root — against a synthetic fixture written to scratchpad (never touching
the repo): a single `*-SUMMARY.json` with a `gates[]` array containing one
`providerSelection: 'configured'` entry, one `'fallback'`, one
`'empty-diff'`, and one gate entry with no `providerSelection` field at
all (mirroring today's real corpus's un-tagged entries):

```sh
find <scratchpad-dir>/positive-control -name "*-SUMMARY.json" -print0 | xargs -0 node -e '<same script as above>'
```

```json
{
  "filesScanned": 1,
  "gatesScanned": 4,
  "counts": {
    "configured": 1,
    "fallback": 1,
    "empty-diff": 1,
    "absent": 1
  }
}
```

The query correctly reported `1/1/1/1`, confirming it is capable of
detecting every non-absent value and is not silently no-op-ing. The
corpus's real `0/0/0/1131` is therefore a genuine measurement, not a
query defect.

### Interpretation — why every count is currently 0/absent, and why that's correct

Every one of the 275 existing `SUMMARY.json` records was written by a
settle that ran *before* this phase's schema field and persistence wiring
existed in a built `dist/`, so `providerSelection` is absent from all
1131 scanned `gates[]` entries — this is the expected, correct state, not
a bug in the query or a sign the feature is unwired (see the positive
control above, which rules out the query itself as the explanation).
Spot-checks:

- **`schemaVersion: 1` records** (e.g.
  `.cadence/phases/99-activate-doctor/99-99-SUMMARY.json`) predate the
  `gates[]` array entirely — no `gates` key at all. The query's
  `Array.isArray(data.gates) ? data.gates : []` guard correctly treats
  these as contributing zero entries, not as errors.
- **The most recent settled phase**,
  `.cadence/phases/262-cadence-doctor-check-release-currency/262-01-SUMMARY.json`,
  has a `gates[]` array but both `code-review` and `security-audit` are
  `status: 'skipped'` there (the `auto` profile this repo settles under
  doesn't include them) — the two seams that would most commonly carry
  `provider`/`providerSelection` never ran, so absence here is exactly
  correct, not a gap.
- Once this phase is settled (outside T5's scope — settle is forbidden
  here) and any future phase settles with `code-review`, `security-audit`,
  `spec-review`, `ui-spec-review`, or `plan-review` actually running,
  re-running this same command will show non-zero `configured` (and,
  where applicable, `fallback`/`empty-diff`) counts, because the corpus
  walk is structural (`.cadence/phases/**/*-SUMMARY.json`) with nothing
  hardcoded to today's file list.

## Environment

- Node: v22.22.3
- Rebuilt packages before running: `@thomas-powers-jr/cadence-types`,
  `@thomas-powers-jr/cadence-core` (both clean `tsc` builds, no errors);
  confirmed the emitted `packages/types/dist/summary.js` actually contains
  the `providerSelection` field with no `.default(...)` before trusting
  the sweep against it (see Part 1 precondition above)
- Worktree: `/home/thomas/projects/cadence/.claude/worktrees/263-provider-selection-provenance`
- Corpus size at capture time: 275 `*-SUMMARY.json` files under
  `.cadence/phases/` (38 carrying a stored `contentHash`, 237 without one)
