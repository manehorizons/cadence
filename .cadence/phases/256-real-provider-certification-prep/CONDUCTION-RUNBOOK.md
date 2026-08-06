# Conduction runbook — Phase 256 real-provider certification

Scratch artifact for this phase's settle boundary. Sourced from
`docs/providers.md`'s documented `code-review`/`security-audit` procedures
(lines 539–659). **Not shipped code — delete this file and the
`fixture/` directory before the settle commit lands (step 6).**

## Before you start

- This must be run by you, from your own terminal, not delegated to an
  agent session. The self-invocation guard (`isSelfInvocation` in
  `host-cli-client.ts`) only covers the `claude` family — and this
  machine's `~/.bashrc:167` sets `CADENCE_HOST_CLI_BIN=codex` globally,
  which is unguarded by design (no reliable session-indicator env var
  exists for codex). So the guard was never actually the operative
  constraint here, in either an agent session or your own terminal — both
  would route real. The reason this still needs to be **you**, not the
  agent that built this phase: CADENCE's own thesis is that an agent's
  self-report of "done" isn't proof, and a codex-backed settle run
  narrated back to you by the same agent that seeded the defect is still
  a self-report. Running it yourself and watching the refusal happen is
  the actual independent check.
- **Provenance gap to know about going in:** `HostCliSecurityAuditVerifier`
  and `HostCliCodeReviewVerifier`'s `.name` field is hardcoded to
  `'host-cli'` regardless of which underlying CLI family actually ran —
  so `SUMMARY.json` will say `provider: 'host-cli'` whether it was
  `claude` or `codex` under the hood. Given `CADENCE_HOST_CLI_BIN=codex`
  here, it'll be codex, but the persisted record won't say so. If you want
  that captured, note it yourself (e.g. in the decision text at settle).
- **`packages/core/tests/docs/phase256-conduction-prep.test.ts` is scratch
  too, not a permanent addition to the suite.** It `readFileSync`s the
  fixture and this runbook — a real per-task-verify call caught that
  leaving it in place after Step 6 deletes those files would break every
  `pnpm test` run from then on (ENOENT on files that no longer exist).
  It's deleted in Step 6 alongside the fixture and this runbook. Because
  that deletion happens strictly *after* every `cadence settle run` below
  (Steps 0/3/5), the test file is present and providing real
  `test-coverage` (assertion mode, phase-qualified scheme) coverage for
  AC-1/AC-2 at the moment each settle actually runs — no coverage bypass
  needed.
- **Code-review coverage is likely but not certain.** The seeded fixture
  trips both `MockSecurityAuditVerifier`'s and `MockCodeReviewVerifier`'s
  deterministic detectors locally (verified below), but that only proves
  the fixture is well-formed under mock semantics. `code-review`'s real
  system prompt lists "secrets in code" and "left-behind debug statements"
  as HIGH-severity bullets, making a real flag likely — not guaranteed.
  If the real `code-review` run comes back clean, that's a real (if
  surprising) result, not evidence the fixture is broken; security-audit's
  CRITICAL finding is still expected either way.

## Step 0 — Mock dry run (confidence check before spending a real run)

With `securityAudit.provider` still `mock` (its current value — don't
change it yet):

```sh
cp .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts \
   /tmp/seeded-defect-256.ts   # optional backup
cadence settle run
```

Expect: refused, with a CRITICAL security-audit finding referencing
`fixture/seeded-defect.ts` (hardcoded Authorization header). This
confirms the fixture is wired correctly before you touch a real provider.
If it does NOT refuse here, stop — the fixture or the gate wiring is
broken, and a real-provider run downstream won't tell you which.

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
correctly; `build-test-must-pass` will refuse without the bypass. This is
a real, structural tension between phase 252's baseline-invariant and
phase 256's temporary conduction, not a transient failure — the bypass
gets recorded in the SUMMARY's `gateBypasses`, which is the honest way to
carry it, not a reason to hide it.

```sh
cadence settle run --allow-failing-build
```

Expect: refused, CRITICAL security-audit finding on the hardcoded
credential (confirm the ONLY failing test was
`self-application-config.test.ts`'s `securityAudit.provider` assertion —
if anything else failed, stop and report it, don't assume it's this same
known cause). Note whether `code-review` also produced a HIGH finding (see
"Code-review coverage" above) — either outcome is informative, capture it.

## Step 4 — Capture the refused-attempt evidence

The refused SUMMARY is preserved as a timestamp-slugged sibling (phase
247, `rec-20260801-011`/`dec-20260802-002`), not overwritten by the next
successful settle — but its filename is unpredictable ahead of time:

```sh
ls -t .cadence/phases/256-real-provider-certification-prep/*-SUMMARY-snapshot.json | head -1
```

Record that exact filename (Phase 257 will want it as a real historical
fixture with a persisted finding). Confirm non-mock provenance:

```sh
grep -A3 '"gate": "security-audit"' <that-snapshot-file>   # provider should not be "mock"
grep -A5 'verifierRollup' <that-snapshot-file>
```

## Step 5 — Revert to the corrected fixture, settle again (expect clean)

Still needs `--allow-failing-build` — `securityAudit.provider` is still
`host-cli` at this point (reverted in Step 5b, after this run, not before
— the point of this settle is to prove the real provider clears cleanly,
which needs the real provider still configured):

```sh
cp .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.fixed.ts \
   .cadence/phases/256-real-provider-certification-prep/fixture/seeded-defect.ts
cadence settle run --allow-failing-build
```

Expect: clean pass, no security-audit findings. Confirm the ONLY thing
`build-test-must-pass` bypassed was the same known `self-application-config`
assertion as Step 3.

## Step 5b — Revert securityAudit.provider back to mock

**Do this before Step 6, before any commit.** Leaving it as `host-cli`
would permanently change the repo's committed baseline config, contradicting
phase 252's own deliberate decision (`dec-20260803-001`: conduction stays a
temporary, DRAFT-level act via profile override, never a baseline change).

```sh
cadence config set securityAudit.provider mock
pnpm --filter @thomas-powers-jr/cadence-core test -- tests/docs/self-application-config.test.ts   # confirm it passes again
```

## Step 6 — Clean up before the settle commit

```sh
rm -rf .cadence/phases/256-real-provider-certification-prep/fixture
rm .cadence/phases/256-real-provider-certification-prep/CONDUCTION-RUNBOOK.md
rm packages/core/tests/docs/phase256-conduction-prep.test.ts
pnpm test   # full suite — confirm everything is clean again, not just tests/docs
```

These were prep scratch, never shipped code. Everything else in
`.cadence/phases/256-real-provider-certification-prep/` (DRAFT, PROGRESS,
SUMMARY, the preserved snapshot) stays as the phase's real record.
