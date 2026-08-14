# SETTLE Summary — 278-01

**Completed:** 2026-08-14T20:09:21.691Z
**Content hash (sha256):** bbdd13405cfc0f5fa8a5bcf63b78f809dd22f0582313cc46542433e5d8fcb400

## Acceptance Criteria

- AC-1: PASS (executed)
- AC-2: PASS (executed)
- AC-3: PASS (executed)
- AC-4: PASS (executed)
- AC-5: PASS (executed)
- AC-6: PASS (executed)
- AC-7: PASS (executed)
- AC-8: PASS (executed)
- AC-9: PASS (executed)
- AC-10: PASS (executed)
- AC-11: PASS (executed)

## Tasks

- T1: DONE — Pure demo fixtures (SANDBOX_CONFIG, GUTTED_TEST/HONEST_TEST for greet()) mirroring tutorial/fixtures.ts's shape. Independent review: 1st pass FAILED on bare AC-1/AC-2 tokens in the outer test file (fixtures.ts's own bare tokens inside the fixture strings are correct as-is -- different, deliberately-bare sandbox scope). Fix round qualified to 278-01/AC-1, 278-01/AC-2; re-verified via cadence verify coverage --explain -> satisfies:true for both. Reviewer also flagged that AC-1/AC-2 as worded require real settle run --auto proof, not just this unit-level coverage-scan proxy -- DRAFT amended (As-built note) so T2's e2e test also closes AC-1/AC-2; T1 supplies the required fixture infrastructure. Re-verified in main thread: 4/4 tests, typecheck clean, coverage explain confirms both tokens satisfy, boundary clean (2 files only).
- T2: DONE — runDemo(opts,io,deps) generalizing tutorial.ts's pattern (tutorial.ts itself untouched); registered 'demo' with -i/--interactive, --keep, --in-place (defaults inverted from tutorial: non-interactive by default). Independent review: 1st pass FAILED -- blocking: --in-place silently overwrote an existing .cadence/config.json/state.json/PROJECT.md with zero guard (proven via sentinel-file repro); also AC-5's pause-wiring was untested (stripping all 5 pause() calls didn't fail any test). Fix round: existsSync(.cadence) refusal guard before scaffoldSandbox when --in-place (refuse+suggest, exit 1, nothing touched); injectable sleep seam via DemoDeps proving pause() fires 5x. Re-verified in main thread: reproduced the real CLI run myself (genuine refusal message, genuine settle pass, sandbox cleanup confirmed), independently reproduced the in-place collision refusal with my own sentinel file (MD5-identical after, exit 1, no other files created), 8/8 tests, typecheck clean, coverage --explain AC-5/AC-6 both SATISFIED, boundary scoped to declared files + 2-line register.ts addition.
- T3: DONE — Bare zero-arg invocation splices 'demo' into argv before commander parses, inside the entry-point guard (no duplicated dispatch logic). Independent review: PASS. Re-verified in main thread: 3/3 tests, typecheck clean, coverage --explain AC-7 -> SATISFIED, diff scoped to declared 2 files (index.ts +11/-1, new test file).
- T4: DONE — Correction after T1 review flagged the same bare-token pattern here: qualified the AC-8 comment (tutorial.test.ts:195) from bare 'AC-8' to '278-01/AC-8' to satisfy this repo's phase-qualified coverage scheme. Re-verified: cadence verify coverage --explain AC-8 shows the span now has hasAssertion:true; 9/9 tutorial tests still pass.
- T5: DONE — readStage()/advanceStage(min) over CADENCE_HOME (fallback ~/.cadence)/onboarding.json, atomic write via existing helper, stage clamped 0-3 never-decreases. Independent review: 1st pass FAILED on bare AC-9 tokens vs this repo's phase-qualified coverage scheme; fix round applied (278-01/AC-9), re-verified via cadence verify coverage --explain AC-9 -> SATISFIED. Re-verified in main thread: 7/7 tests, typecheck clean, boundary clean (2 new files only).
- T6: DONE — advanceStage(ONBOARDING_STAGE_DRIVER) called in runDemo() after the step loop completes without throwing (never fires on the interim refusal alone, or on any thrown step). 2 new tests: successful run advances stage, interim refusal alone does not. Independent review: PASS, with one worth-fixing non-blocking note: the write wasn't try/caught, so a transient onboarding.json I/O failure would make the whole demo report failure even after both real teaching-moment settles genuinely succeeded. Fixed directly: wrapped in try/catch with a soft stderr notice on failure (best-effort, matches this repo's convention that cosmetic bookkeeping must not turn a genuine success into a reported failure). Re-verified in main thread: 10/10 demo tests (incl. both new AC-9 tests), typecheck clean.
- T7: DONE — Top-level --advanced program option + Commander configureHelp/visibleCommands hook filtering the top-level help list (doctor hidden below stage 2); commands stay registered (no .command() calls touched, confirmed via Commander source trace of per-instance _helpConfiguration). 6 new e2e tests. Independent review: PASS conditional on 2 required fixes -- (1) DRAFT lacked an As-built note for the deliberate doctor-only scope decision (T1/T8/T10 precedent) -- added; (2) the new global --advanced flag was undocumented in commands.md's Global options table (cli-reference.test.ts's flag-drift check only walks subcommand options, not program.options, so nothing caught it) -- added. Re-verified in main thread: 6/6 help-gating tests, 3/3 zero-arg-dispatch (no regression), docs/cli-reference 7/7, typecheck clean, coverage --explain AC-10 -> SATISFIED, boundary scoped to declared 2 files.
- T8: DONE — minStage on StartOption (doctor->2), visibleOptions() filter, --advanced flag, wired T5's readStage(). Independent review: 1st pass FAILED -- (1) real finding: new --advanced flag undocumented, no task owned the doc fix -- DRAFT amended, folded into T10 (which already owns commands.md); (2) minor nit: bare AC-11 comment token, fixed. Additive render.ts change (optional 3rd param, default preserves existing behavior) added to T8's files: via As-built note. Re-verified in main thread: 53/53 tests, typecheck clean, coverage --explain AC-11 -> SATISFIED, diff scoped to declared 4 files.
- T9: DONE — One paragraph added to README Quickstart ahead of the existing tutorial mention, introducing the bare-npx one-command demo. Independent review: PASS -- all factual claims (zero-arg dispatch, offline/mock-only, cleanup-by-default, cadence demo equivalence) individually verified against the actual implementation. Diff scoped to README.md only, +10/-0.
- T10: DONE — Added demo to marker-block+ToC; new ### demo section mirroring tutorial's structure (all 3 flags, --in-place collision-refusal documented); --advanced row+prose added to ### start; one-line mention added to ### tutorial's Behavior. Independent review: 1st pass FAILED -- two dangling [onboard](#onboard) links pointed at the unrelated existing 'cadence onboard' command instead of anywhere explaining the phase-278 stage concept (which isn't documented anywhere). Fixed directly: dropped both broken links, kept prose. Re-verified: cli-reference.test.ts 7/7 pass, only commands.md touched.

## Gate provenance

- draft-read: ran
- structural-verifier: ran
- boundary-scan: skipped — boundaryEnforcement is not "block"
- task-verify-required: ran
- build-test-must-pass: ran
- test-coverage: ran
- interactive-verdict: skipped — not requested (no --deep / --interactive, not in gate set)
- deep-verify: skipped — not requested (no --deep / --interactive, not in gate set)
- code-review: skipped — not in the active tier × profile gate set
- security-audit: skipped — not in the active tier × profile gate set

## Assurance

- overall: mixed
- evidence tally: ai-verified=0, executed=11, assertion=0, mention=0, unverified=0

## Decisions

_(none)_

## Deferred

_(none)_

## Skill audit

_(none)_

## State at settle

- loop position before settle: BUILD
- revision: 131
- session subagent spawns: 57
