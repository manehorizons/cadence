import { execSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState } from '@thomas-powers-jr/cadence-types';
import { atomicWriteJSON } from '../state/atomic-write.js';
import { SimpleStateBackend } from '../state/simple.js';
import { draftNewService } from '../services/draft-new.js';
import { draftApproveService } from '../services/draft-approve.js';
import { settleService } from '../services/settle.js';
import { recordTaskOutcome } from '../build/record.js';
import { advanceStage, ONBOARDING_STAGE_DRIVER } from '../onboarding/state.js';
import type { CommandIO, CommandResult } from '../services/io.js';
import {
  DEMO_PHASE,
  DEMO_NUM,
  DEMO_ID,
  IMPL_FILE,
  TEST_FILE,
  SANDBOX_CONFIG,
  GREET_IMPL,
  GUTTED_TEST,
  HONEST_TEST,
  renderGreetDraft,
} from './fixtures.js';

/**
 * `cadence demo` — run one real DRAFT→BUILD→SETTLE loop inside an ephemeral
 * sandbox, built around the catch: the loop stages a plausible-looking lie
 * (a task marked DONE whose test mentions its AC but never asserts on it),
 * settle REFUSES to close, the demo restores the real assertion, and settle
 * then genuinely passes. The refusal is the money moment.
 *
 * Every step composes the real engine services — no `--ac` manual assertion
 * and no coverage bypass — so the walkthrough can never drift from real
 * behavior, and a skeptic could reproduce each command by hand.
 *
 * This is `tutorial.ts`'s command generalized (phase 278): the beat/pause/
 * scaffold shape is deliberately parallel (tutorial.ts is out of T2's file
 * boundary and is not modified by this task), but the flag defaults are
 * inverted — `cadence demo` is fully non-interactive by default so it is
 * safe to run from a bare `npx` invocation or an agent shell without ever
 * blocking on input, and `--interactive`/`-i` opts back into the tutorial's
 * TTY-paced pauses.
 */

export interface DemoOpts {
  /** Pause between beats when running in a real TTY. Default `false`: unlike
   * `cadence tutorial` (which auto-pauses whenever stdin is a TTY), `cadence
   * demo` never pauses unless this is explicitly set — the default run must
   * stay fully non-interactive regardless of how it's invoked. */
  interactive?: boolean;
  /** Leave the sandbox on disk instead of deleting it once the run finishes. */
  keep?: boolean;
  /** Run inside `process.cwd()` instead of a fresh `mkdtemp` temp dir. Implies
   * the sandbox is never deleted (deleting the caller's cwd would be
   * destructive) — the demo's artifacts (`.cadence/`, `${IMPL_FILE}`,
   * `${TEST_FILE}`) are left alongside whatever else is already there. */
  inPlace?: boolean;
}

/** A single walkthrough step, run against the sandbox root. */
type Step = (ctx: { root: string; io: CommandIO }) => Promise<void>;

/** Test seam: lets a test inject steps (e.g. a throwing one) to exercise the
 * sandbox-cleanup `finally` without running the full loop, and/or replace the
 * real timer-based wait `pause()` performs so interactive-mode pacing can be
 * observed without a real wall-clock delay. */
export interface DemoDeps {
  steps?: Step[];
  /** Replaces `pause()`'s real `setTimeout`-based wait. Defaults to a real
   * timer. Test seam for AC-5 (`--interactive` pauses between beats) — lets a
   * test count/observe pauses without incurring the six-beat walkthrough's
   * cumulative real-time delay. */
  sleep?: (ms: number) => Promise<void>;
}

const TOTAL_BEATS = 6;

function line(io: CommandIO, s = ''): void {
  io.out(`${s}\n`);
}

/** A command beat: name + the exact command line being run. */
function beat(io: CommandIO, n: number, label: string, cmd: string): void {
  line(io);
  line(io, `  ── ${label}  ·  beat ${n}/${TOTAL_BEATS} ──`);
  line(io, `  $ cadence ${cmd}`);
}

/** A non-command beat (e.g. editing files in your editor). */
function beatNote(io: CommandIO, n: number, label: string, note: string): void {
  line(io);
  line(io, `  ── ${label}  ·  beat ${n}/${TOTAL_BEATS} ──`);
  line(io, `  ${note}`);
}

/** Fail loudly if a composed service returns non-zero when we expected a pass —
 * keeps the demo honest (a future gate change can't silently leave the loop
 * half-run). The service has already streamed its own error to `io.err`. */
function expectOk(res: CommandResult, step: string): void {
  if (res.exitCode !== 0) {
    throw new Error(`demo step "${step}" failed (exit ${res.exitCode})`);
  }
}

/** Fail loudly if a settle we expected to REFUSE instead passed — the staged
 * gutted fixture must be caught, or the demo is lying about the catch. */
function expectRefused(res: CommandResult, step: string): void {
  if (res.exitCode === 0) {
    throw new Error(
      `demo step "${step}" was expected to refuse (exit non-zero) but passed`,
    );
  }
}

/** Auto-advance with a short pause in a real TTY, but ONLY when `--interactive`
 * was passed — unlike the tutorial, a bare `cadence demo` never pauses, TTY
 * or not (AC-3). `--interactive` opts back into TTY-paced pauses (AC-5).
 * Exported (rather than kept private, like `tutorial.ts`'s equivalent) as a
 * direct, fast testing seam for the interactive/TTY gating decision itself,
 * without paying for the full six-beat walkthrough's cumulative real-time
 * pauses in every test run. */
export async function pause(
  opts: DemoOpts,
  ms: number,
  sleep: (ms: number) => Promise<void> = (n) => new Promise((resolve) => setTimeout(resolve, n)),
): Promise<void> {
  if (!opts.interactive || !process.stdin.isTTY) return;
  await sleep(ms);
}

/** Run the sandbox's real test suite and echo a one-line summary. Best-effort:
 * never throws (a failing `node --test` exits non-zero, which would otherwise
 * make execSync throw). Purely for visibility — settle's `build-test-must-pass`
 * gate runs the same command for enforcement. */
function showTestRun(root: string, io: CommandIO): void {
  line(io, `  $ node --test`);
  let out = '';
  try {
    out = execSync('node --test', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    out = (e as { stdout?: string }).stdout ?? '';
  }
  const counts = out
    .split(/\r?\n/)
    .filter((l) => /^# (tests|pass|fail)\b/.test(l.trim()))
    .map((l) => l.trim().replace(/^#\s*/, ''))
    .join('  ·  ');
  line(io, `  ${counts || '(no test files found)'}`);
}

/** Scaffold a minimal `.cadence/` in `root` with the standard-profile +
 * real-testCommand config that makes the gates bite (see demo/fixtures.ts). */
async function scaffoldSandbox(root: string): Promise<void> {
  const cadenceDir = join(root, '.cadence');
  await mkdir(join(cadenceDir, 'phases'), { recursive: true });
  await mkdir(join(cadenceDir, 'handoff'), { recursive: true });
  await mkdir(join(cadenceDir, 'research'), { recursive: true });
  await mkdir(join(cadenceDir, 'archive'), { recursive: true });
  await atomicWriteJSON(join(cadenceDir, 'config.json'), SANDBOX_CONFIG);
  await new SimpleStateBackend(root).commit(emptyState('demo'));
  await writeFile(
    join(cadenceDir, 'PROJECT.md'),
    '# demo\n\n> CADENCE demo sandbox — created and (usually) removed by `cadence demo`.\n',
  );
}

/** Path to a sandbox-relative file under `.cadence/phases/<phase>/`. */
function draftPath(root: string): string {
  return join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-DRAFT.md`);
}

/** The six-beat refuse→fix→pass walkthrough. */
function defaultSteps(opts: DemoOpts, sleep?: (ms: number) => Promise<void>): Step[] {
  return [
    // 1 — DRAFT: scaffold + write a genuinely test-verifiable task.
    async ({ root, io }) => {
      beat(io, 1, 'DRAFT', `draft new ${DEMO_PHASE} ${DEMO_NUM} --title "Add a greet() helper"`);
      expectOk(
        await draftNewService(
          root,
          { phase: DEMO_PHASE, num: DEMO_NUM, title: 'Add a greet() helper', tier: 'quick-fix' },
          io,
        ),
        'draft new',
      );
      await writeFile(draftPath(root), renderGreetDraft().content);
      line(io, `  Wrote the objective, AC-1 (greet(name) returns a friendly greeting), and task T1.`);
      await pause(opts, 800, sleep);
    },

    // 2 — APPROVE: enter BUILD.
    async ({ root, io }) => {
      beat(io, 2, 'APPROVE', `draft approve ${DEMO_PHASE} ${DEMO_NUM}`);
      expectOk(
        await draftApproveService(root, { phase: DEMO_PHASE, num: DEMO_NUM, approve: false }, io),
        'draft approve',
      );
      await pause(opts, 800, sleep);
    },

    // 3 — BUILD: write the implementation and a test that MENTIONS AC-1 but
    // never asserts on it — mark T1 DONE anyway (the plausible-looking lie).
    async ({ root, io }) => {
      beatNote(io, 3, 'BUILD', `(write ${IMPL_FILE} + ${TEST_FILE}, then: cadence done T1)`);
      await writeFile(join(root, IMPL_FILE), GREET_IMPL);
      await writeFile(join(root, TEST_FILE), GUTTED_TEST);
      await recordTaskOutcome(root, 'T1', 'DONE', 'implemented greet()');
      line(io, `  Wrote ${IMPL_FILE} and ${TEST_FILE}, and marked T1: DONE.`);
      showTestRun(root, io);
      line(io, `  The test calls greet() -- but its assertion is commented out. Green, but hollow.`);
      await pause(opts, 1000, sleep);
    },

    // 4 — SETTLE (attempt 1): the catch. A mention isn't an assertion → REFUSE.
    async ({ root, io }) => {
      beat(io, 4, 'SETTLE', `settle run --auto`);
      line(io);
      line(io, `  ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳`);
      expectRefused(
        await settleService(root, { auto: true }, io),
        'settle run (attempt 1)',
      );
      line(io, `  ╳━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╳`);
      line(io, `  ✗ SETTLE REFUSED — the loop will NOT close. Nothing was settled.`);
      line(io, `    AC-1 is mentioned but never actually asserted. The real state wins.`);
      await pause(opts, 1800, sleep);
    },

    // 5 — FIX: restore the real assertion in the same test file.
    async ({ root, io }) => {
      beatNote(io, 5, 'FIX', `(write ${TEST_FILE} — restore the real assertion for AC-1)`);
      await writeFile(join(root, TEST_FILE), HONEST_TEST);
      line(io, `  Wrote ${TEST_FILE}, asserting greet('Ada') === 'Hello, Ada!'.`);
      showTestRun(root, io);
      await pause(opts, 1000, sleep);
    },

    // 6 — SETTLE (attempt 2): a real passing assertion backs AC-1 → loop closes.
    async ({ root, io }) => {
      beat(io, 6, 'SETTLE', `settle run --auto`);
      expectOk(await settleService(root, { auto: true }, io), 'settle run (attempt 2)');
      line(io, `  ✓ The test ran for real, AC-1 is backed, and the loop closed.`);
    },
  ];
}

/**
 * Run the demo. Creates (or reuses, under `--in-place`) a sandbox, runs the
 * steps, and removes the sandbox afterward unless `--keep` or `--in-place`
 * was passed (deleting the caller's own cwd would be destructive). Returns
 * `loopPosition` + `summaryWritten` read back from the sandbox before any
 * cleanup. Throws if a step throws.
 *
 * Under `--in-place`, refuses (exit 1, no files touched) instead of
 * scaffolding when a `.cadence/` directory already exists at `root` —
 * `scaffoldSandbox`'s writes (`config.json`, `state.json` via
 * `SimpleStateBackend`, `PROJECT.md`) are unconditional overwrites, and
 * blindly running them over a real project would silently clobber
 * possibly-unrecoverable data (`state.json` is gitignored). This is the
 * repo's standard "refuse + suggest, never silently mutate" convention
 * (CLAUDE.md), applied here rather than in `scaffoldSandbox` so the refusal
 * happens strictly before anything is created.
 */
export async function runDemo(
  opts: DemoOpts,
  io: CommandIO,
  deps: DemoDeps = {},
): Promise<CommandResult> {
  const root = opts.inPlace ? process.cwd() : await mkdtemp(join(tmpdir(), 'cadence-demo-'));

  if (opts.inPlace && existsSync(join(root, '.cadence'))) {
    io.err(
      `cadence demo --in-place: refusing to run — a .cadence/ directory already exists at ${root}.\n` +
        `Running --in-place here would overwrite its config.json, state.json, and PROJECT.md with the demo's throwaway fixtures.\n` +
        `Run "cadence demo" without --in-place instead (it creates its own isolated temp sandbox), or run --in-place from an empty directory.\n`,
    );
    return { exitCode: 1, data: { sandbox: root } };
  }

  const shouldDelete = !opts.inPlace && !opts.keep;
  try {
    line(io);
    line(io, '  CADENCE demo — one real loop, and the moment it refuses');
    line(io, '  ────────────────────────────────────────────────────────');
    line(
      io,
      `  Sandbox: ${root}  ${shouldDelete ? '(removed when this finishes)' : '(kept on disk)'}`,
    );
    await scaffoldSandbox(root);

    const steps = deps.steps ?? defaultSteps(opts, deps.sleep);
    for (const step of steps) {
      await step({ root, io });
    }

    const finalState = await new SimpleStateBackend(root).readState();
    const summaryWritten = existsSync(
      join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-SUMMARY.md`),
    );

    // 278-01/AC-9 (T6): reaching here means every step ran without throwing —
    // the second `settle run --auto` genuinely closed the loop, not just the
    // interim beat-4 refusal (that's expected mid-walkthrough behavior and
    // never reaches this line). Advance the user-global onboarding stage to
    // at least Driver so `cadence help`/`cadence start` widen their surface
    // next time. If any step above throws, control flow skips straight to
    // the `finally` below and this call never fires.
    //
    // Best-effort: the demo's real teaching moment (the refuse-then-succeed
    // loop) already succeeded by this point. A transient failure writing the
    // cosmetic onboarding-stage marker must not turn a genuinely successful
    // demo into a reported failure.
    try {
      await advanceStage(ONBOARDING_STAGE_DRIVER);
    } catch (err) {
      io.err(
        `  (note: could not record onboarding progress — ${(err as Error).message ?? err}; the demo itself completed successfully)\n`,
      );
    }

    line(io);
    line(io, '  You marked T1 done back in the build step. The state disagreed.');
    line(io, '  That gap — and settle refusing to paper over it — is the whole tool.');
    line(io);
    if (!shouldDelete) {
      line(io, `  Sandbox left on disk at: ${root}`);
      line(io);
    }
    line(io, '  Next:  cadence init                                  (start your own loop)');
    line(io, '         npx @thomas-powers-jr/cadence-host-claude-code install   (wire into Claude Code)');
    line(io);

    return {
      exitCode: 0,
      data: {
        loopPosition: finalState.loopPosition,
        summaryWritten,
        sandbox: root,
        kept: !shouldDelete,
      },
    };
  } finally {
    if (shouldDelete) {
      await rm(root, { recursive: true, force: true });
    }
  }
}
