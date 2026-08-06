# Conduction runbook — Phase 256 real-provider certification (redo)

Scratch artifact for this phase's settle boundary. Redone from `256-01`'s
runbook, which voided (`dec-20260806-001`) because the fixture was already
committed at settle time. Sourced from `docs/providers.md`'s documented
`code-review`/`security-audit` procedures (lines 539–659). **Not shipped
code — delete this file and the `fixture/` directory before the settle
commit lands (step 7).**

## Why the previous attempt voided, and the one invariant that fixes it

Every diff-scoped gate — `code-review`, `security-audit`, real or mock,
settle-time or per-task-verify — builds its input from `ctx.diff()` =
`git diff --no-color HEAD -- <touchedFiles>`
(`packages/core/src/git/diff.ts:7-19`). `touchedFiles` comes from this
DRAFT's `files:` lines, not from git status. Two consequences that voided
`256-01` and must not recur:

- **A path already committed at HEAD produces an empty diff no matter what
  it contains.** `256-01`'s fixture landed in WIP commit `9fb2eef6` before
  the real settle ran, so `git diff HEAD -- fixture/seeded-defect.ts` was
  empty even though the file itself still held the hardcoded credential.
- **The real host-cli verifiers do not skip the call on an empty diff.**
  The guard is `if (input.files.length === 0 && input.diff.trim().length
  === 0)` — an AND, not an OR (`security-audit.ts:296`, `code-review.ts:336`).
  A non-empty `touchedFiles` with an empty diff still spawns a live provider
  request, which receives `(no diff supplied)` and returns empty findings.
  `securityAudit: []` on a fixture with a live hardcoded credential in it —
  no error, no warning, a normal-looking `provider: host-cli` gate entry.
- **The mock verifiers are diff-based too, not content-based.** Both
  `MockSecurityAuditVerifier` and `MockCodeReviewVerifier`
  (`packages/core/src/verify/security-audit.ts:67`, `code-review.ts:113`)
  early-return on the identical `input.diff.trim().length === 0` check. This
  means the mock dry run in step 0 below — meant to be the cheap confidence
  check before spending a real call — is defeated by the exact same
  condition, silently, with no way to tell "genuinely clean" from "never
  actually reviewed anything" apart from checking the diff yourself.
- **Untracked paths are invisible to `git diff HEAD` even with an explicit
  pathspec.** Verified empirically in this repo against a genuinely
  untracked path. So the fixture must be *staged* (`git add`), not merely
  present in the working tree, for any of the above to see it — but it must
  never be *committed*, or the first bullet's trap reproduces.

**The invariant, stated once, applying to every `cadence settle run` call in
this runbook without exception — mock dry run included:**

> Immediately before any `cadence settle run` invocation below, run these
> three commands **in this exact order** — `git add` before the diff check,
> not after: `git diff --no-color HEAD` only reflects a path once it's
> tracked in the index, so checking it against a currently-untracked fixture
> before staging it will show empty even when everything else is correct.
>
> ```sh
> git ls-tree HEAD -- .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts
> git add .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts
> git diff --no-color HEAD -- .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts
> ```
>
> `git ls-tree` MUST print nothing (path genuinely absent from HEAD — not
> merely edited; `git log -1 --name-only` only inspects the tip commit and
> would miss a path committed further back, which is exactly the historical
> bug). `git diff` MUST print a non-empty unified diff. If either check
> fails: **STOP.** Do not run settle. Do not interpret whatever comes back
> as an informative result — for the mock dry run this means don't trust a
> refusal *or* a clean pass; for a real attempt this means don't spend the
> call. Go find out why the pre-flight failed before doing anything else.
> Never `git commit` the fixture path — staging (`git add`) is required and
> expected; committing is the failure mode that voided `256-01`.

`.cadence/phases/256-real-provider-certification-prep/fixture/` being
untracked-or-staged-but-never-committed is **deliberate and load-bearing**
for this entire runbook, not leftover working-tree dirt to tidy up. This
session already removed the two fixture paths from HEAD via a dedicated
commit (`fab22c15`, `git rm --cached`) as a prerequisite — confirm that
holds (`git ls-tree HEAD -- fixture/` prints nothing) before starting below.

## Before you start

- This must be run by you, from your own terminal, not delegated to an
  agent session. The self-invocation guard (`isSelfInvocation` in
  `host-cli-client.ts`) only covers the `claude` family — this machine's
  `~/.bashrc:167` sets `CADENCE_HOST_CLI_BIN=codex` globally, unguarded by
  design. The reason this is still **you**, not the agent that built this
  phase: CADENCE's own thesis is that an agent's self-report of "done" isn't
  proof, and a codex-backed settle run narrated back to you by the same
  agent that seeded the defect is still a self-report. Running it yourself
  and watching the refusal happen is the actual independent check.
- **Close every other Claude Code / agent session in this checkout first**,
  including whichever one built this phase, before you start step 1. Issue
  #234's `state.json` revision-conflict race is real and already hit this
  branch once this week — a stray idle session writing telemetry during a
  long host-cli window corrupted state mid-run in `256-01`.
- **Provenance gap to know going in:** `HostCliSecurityAuditVerifier` and
  `HostCliCodeReviewVerifier`'s `.name` field is hardcoded to `'host-cli'`
  regardless of underlying CLI family — `SUMMARY.json` will say
  `provider: 'host-cli'` whether it was `claude` or `codex`. Given
  `CADENCE_HOST_CLI_BIN=codex` here, it'll be codex; note that yourself in
  the decision text at settle if you want it captured.
- **`packages/core/tests/docs/phase256-conduction-prep.test.ts` is scratch
  too**, not a permanent addition to the suite. It `readFileSync`s the
  fixture and this runbook; deleted in step 7 alongside them, strictly
  *after* both real settle calls (steps 3 and 5) below — every
  `cadence settle run` in this runbook runs before that deletion, so the
  test provides real `test-coverage` (assertion mode, phase-qualified
  scheme) evidence for AC-1/AC-2 at the moment each settle actually runs, no
  coverage bypass needed.
- **Code-review coverage is likely but not certain.** The seeded fixture
  trips both mock detectors (verified in T1, with staged-diff evidence
  confirming the `+` lines the regexes match, not just the raw content).
  `code-review`'s real system prompt lists "secrets in code" and
  "left-behind debug statements" as HIGH-severity bullets — a real flag is
  likely, not guaranteed. A clean real `code-review` result is itself
  informative (not evidence the fixture is broken) as long as the
  invariant's pre-flight passed for that call; `security-audit`'s CRITICAL
  finding is the one this phase actually needs.

## Step 0 — Mock dry run (confidence check before spending a real run)

With `securityAudit.provider` still `mock` (its current value — don't
change it yet), run the invariant's pre-flight, then:

```sh
git ls-tree HEAD -- .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts   # expect: nothing
git add .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts
git diff --no-color HEAD -- .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts   # expect: non-empty
cadence settle run
```

Expect: refused, with a CRITICAL security-audit finding referencing
`fixture/seeded-defect.ts` (hardcoded Authorization header). This confirms
the fixture is wired correctly before you touch a real provider. **If it
does NOT refuse here, do not treat that as "the fixture must be clean" —
first re-run the two pre-flight commands above and confirm they came back
the way this step expects.** If they didn't, that's the bug reproducing;
find out why before going further. If they did and it still doesn't refuse,
the fixture or gate wiring is genuinely broken.

## Step 1 — Real-terminal precondition

Confirm you're in your own interactive shell (not a Bash-tool call, hook,
or headless session):

```sh
echo "CLAUDECODE=$CLAUDECODE"   # expect empty in your own terminal
```

## Step 2 — Clear security-audit's provider axis

```sh
cadence config get securityAudit.provider   # currently "mock"
cadence config set securityAudit.provider host-cli
```

(`codeReview.provider` is already `host-cli` — no change needed there.)

## Step 3 — Run the settle for real (attempt 1, expect refusal)

**`--allow-failing-build` is required here — this is expected, not a bug.**
`packages/core/tests/docs/self-application-config.test.ts` (phase 252) is
an invariant test asserting this repo's committed `.cadence/config.json`
always has `securityAudit.provider: 'mock'`. Step 2 just flipped it —
exactly the condition that test exists to catch. It's doing its job
correctly; `build-test-must-pass` will refuse without the bypass. This is a
real, structural tension between phase 252's baseline-invariant and phase
256's temporary conduction, not a transient failure — the bypass gets
recorded in the SUMMARY's `gateBypasses`, the honest way to carry it.

Run the invariant's pre-flight first, then the settle:

```sh
git ls-tree HEAD -- .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts   # expect: nothing
git add .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts
git diff --no-color HEAD -- .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts   # expect: non-empty
cadence settle run --allow-failing-build
```

Expect: refused, CRITICAL security-audit finding on the hardcoded
credential (confirm the ONLY failing test was
`self-application-config.test.ts`'s `securityAudit.provider` assertion — if
anything else failed, stop and report it, don't assume it's this same known
cause). Note whether `code-review` also produced a HIGH finding.

**If this comes back clean instead of refused: STOP. Do not treat this as
an interesting real-provider result.** First confirm whether the pre-flight
above actually passed (non-empty diff, absent from HEAD) immediately before
this settle ran. If it did pass and the result is still clean, that is now
a genuine, informative finding about real-provider judgment on this class of
defect — treat it as such. If the pre-flight did NOT pass, this is
`256-01`'s void bug recurring; find out why the fixture ended up
committed/untracked again before doing anything else.

## Step 4 — Capture the refused-attempt evidence

The refused SUMMARY is preserved as a timestamp-slugged sibling (phase 247,
`rec-20260801-011`/`dec-20260802-002`), not overwritten by the next
successful settle — but its filename is unpredictable ahead of time.
(`256-01` never actually captured this — its refused attempt never produced
one, since the empty-diff bug meant nothing was ever refused for the right
reason. Phase 257 wants a real one from this redo.)

```sh
ls -t .cadence/phases/256-real-provider-certification-prep/*-SUMMARY-snapshot.json | head -1
```

Record that exact filename. Confirm non-mock provenance:

```sh
grep -A3 '"gate": "security-audit"' <that-snapshot-file>   # provider should not be "mock"
grep -A5 'verifierRollup' <that-snapshot-file>
```

## Step 5 — Revert to the corrected fixture, settle again (expect clean)

Still needs `--allow-failing-build` — `securityAudit.provider` is still
`host-cli` at this point (reverted in step 6, after this run, not before —
the point of this settle is to prove the real provider clears cleanly,
which needs the real provider still configured).

Overwrite the fixture **in place** with the corrected content, then run the
invariant's pre-flight again — it still passes, because the path is still
absent from HEAD (only its uncommitted content changed):

```sh
cp .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.fixed.ts \
   .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts
git ls-tree HEAD -- .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts   # expect: nothing
git add .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts
git diff --no-color HEAD -- .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts   # expect: non-empty (now a clean-content new-file diff)
cadence settle run --allow-failing-build
```

Expect: clean pass, no security-audit findings. Confirm the ONLY thing
`build-test-must-pass` bypassed was the same known
`self-application-config` assertion as step 3.

**This is the settle that counts toward `dec-20260801-003`'s 3-settle
revisit trigger for code-review finding-drift — and only this one.** Step 3
(expected refusal) and step 0 (mock dry run) do not count. Confirm the
pre-flight passed for this step before treating a clean result as
meaningful.

## Step 6 — Revert securityAudit.provider back to mock

**Do this before step 7, before any commit.** Leaving it as `host-cli`
would permanently change the repo's committed baseline config, contradicting
phase 252's own deliberate decision (`dec-20260803-001`: conduction stays a
temporary, DRAFT-level act via profile override, never a baseline change).

```sh
cadence config set securityAudit.provider mock
pnpm --filter @thomas-powers-jr/cadence-core test -- tests/docs/self-application-config.test.ts   # confirm it passes again
```

## Step 7 — Clean up before the settle commit

```sh
git reset -- .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts
rm -rf .cadence/phases/256-real-provider-certification-prep/fixture
rm .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md
rm packages/core/tests/docs/phase256-conduction-prep.test.ts
pnpm test   # full suite — confirm everything is clean again, not just tests/docs
```

These were prep scratch, never shipped code, and — critically — never
committed at any point in this runbook. Everything else in
`.cadence/phases/256-real-provider-certification-prep/` (both DRAFTs,
PROGRESS, SUMMARY, the preserved snapshot from step 4) stays as the phase's
real record.
