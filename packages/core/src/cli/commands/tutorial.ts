import type { Command } from 'commander';
import { execSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState } from '@manehorizons/cadence-types';
import { atomicWriteJSON } from '../../state/atomic-write.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { draftNewService } from '../../services/draft-new.js';
import { draftApproveService } from '../../services/draft-approve.js';
import { settleService } from '../../services/settle.js';
import { recordTaskOutcome } from '../../build/record.js';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';
import {
  DEMO_PHASE,
  DEMO_NUM,
  DEMO_ID,
  IMPL_FILE,
  TEST_FILE,
  SANDBOX_CONFIG,
  SUM_IMPL,
  SUM_TEST,
  renderSumDraft,
} from '../../tutorial/fixtures.js';

/**
 * `cadence tutorial` — run one real DRAFT→BUILD→SETTLE loop inside an ephemeral
 * sandbox, built around the catch: the loop stages a lie (a task marked DONE
 * with no test backing its AC), settle REFUSES to close, the tutorial fixes it,
 * and settle then genuinely passes. The refusal is the money moment.
 *
 * Every step composes the real engine services — no `--ac` manual assertion and
 * no coverage bypass — so the walkthrough can never drift from real behavior,
 * and a skeptic could reproduce each command by hand.
 */

export interface TutorialOpts {
  /** Skip the between-step pause (always true for non-TTY / CI / agents). */
  noPause?: boolean;
}

/** A single walkthrough step, run against the sandbox root. */
type Step = (ctx: { root: string; io: CommandIO }) => Promise<void>;

/** Test seam: lets a test inject steps (e.g. a throwing one) to exercise the
 * sandbox-cleanup `finally` without running the full loop. */
export interface TutorialDeps {
  steps?: Step[];
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
    throw new Error(`tutorial step "${step}" failed (exit ${res.exitCode})`);
  }
}

/** Fail loudly if a settle we expected to REFUSE instead passed — the staged
 * lie must be caught, or the tutorial is lying about the catch. */
function expectRefused(res: CommandResult, step: string): void {
  if (res.exitCode === 0) {
    throw new Error(
      `tutorial step "${step}" was expected to refuse (exit non-zero) but passed`,
    );
  }
}

/** Auto-advance with a short pause in a real TTY; longer at the refusal so it
 * lands. No pause under `--no-pause` / non-TTY (fast for CI + repeat runs). */
async function pause(opts: TutorialOpts, ms: number): Promise<void> {
  if (opts.noPause || !process.stdin.isTTY) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
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
 * real-testCommand config that makes the gates bite (see fixtures.ts). */
async function scaffoldSandbox(root: string): Promise<void> {
  const cadenceDir = join(root, '.cadence');
  await mkdir(join(cadenceDir, 'phases'), { recursive: true });
  await mkdir(join(cadenceDir, 'handoff'), { recursive: true });
  await mkdir(join(cadenceDir, 'research'), { recursive: true });
  await mkdir(join(cadenceDir, 'archive'), { recursive: true });
  await atomicWriteJSON(join(cadenceDir, 'config.json'), SANDBOX_CONFIG);
  await new SimpleStateBackend(root).commit(emptyState('tutorial'));
  await writeFile(
    join(cadenceDir, 'PROJECT.md'),
    '# tutorial\n\n> CADENCE tutorial sandbox — created and removed by `cadence tutorial`.\n',
  );
}

/** Path to a sandbox-relative file under `.cadence/phases/<phase>/`. */
function draftPath(root: string): string {
  return join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-DRAFT.md`);
}

/** The six-beat refuse→fix→pass walkthrough. */
function defaultSteps(opts: TutorialOpts): Step[] {
  return [
    // 1 — DRAFT: scaffold + write a genuinely test-verifiable task.
    async ({ root, io }) => {
      beat(io, 1, 'DRAFT', `draft new ${DEMO_PHASE} ${DEMO_NUM} --title "Add a sum() helper"`);
      expectOk(
        await draftNewService(
          root,
          { phase: DEMO_PHASE, num: DEMO_NUM, title: 'Add a sum() helper', tier: 'quick-fix' },
          io,
        ),
        'draft new',
      );
      await writeFile(draftPath(root), renderSumDraft().content);
      line(io, `  Wrote the objective, AC-1 (sum(a,b) returns a+b), and task T1.`);
      await pause(opts, 800);
    },

    // 2 — APPROVE: enter BUILD.
    async ({ root, io }) => {
      beat(io, 2, 'APPROVE', `draft approve ${DEMO_PHASE} ${DEMO_NUM}`);
      expectOk(
        await draftApproveService(root, { phase: DEMO_PHASE, num: DEMO_NUM, approve: false }, io),
        'draft approve',
      );
      await pause(opts, 800);
    },

    // 3 — BUILD: write the implementation, mark T1 DONE — but write NO test.
    async ({ root, io }) => {
      beatNote(io, 3, 'BUILD', `(write ${IMPL_FILE}, then: cadence done T1)`);
      await writeFile(join(root, IMPL_FILE), SUM_IMPL);
      await recordTaskOutcome(root, 'T1', 'DONE', 'implemented sum()');
      line(io, `  Wrote ${IMPL_FILE} and marked T1: DONE.`);
      showTestRun(root, io);
      line(io, `  You claimed T1 is done — but nothing executable backs AC-1 yet.`);
      await pause(opts, 1000);
    },

    // 4 — SETTLE (attempt 1): the catch. State doesn't back the claim → REFUSE.
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
      line(io, `    AC-1 was claimed done, but no test backs it. The real state wins.`);
      await pause(opts, 1800);
    },

    // 5 — FIX: write the real test that references AC-1.
    async ({ root, io }) => {
      beatNote(io, 5, 'FIX', `(write ${TEST_FILE} — a real test for AC-1)`);
      await writeFile(join(root, TEST_FILE), SUM_TEST);
      line(io, `  Wrote ${TEST_FILE}, asserting sum(2,3) === 5.`);
      showTestRun(root, io);
      await pause(opts, 1000);
    },

    // 6 — SETTLE (attempt 2): a real passing test backs AC-1 → loop closes.
    async ({ root, io }) => {
      beat(io, 6, 'SETTLE', `settle run --auto`);
      expectOk(await settleService(root, { auto: true }, io), 'settle run (attempt 2)');
      line(io, `  ✓ The test ran for real, AC-1 is backed, and the loop closed.`);
    },
  ];
}

/**
 * Run the tutorial. Creates a sandbox, runs the steps, and always removes the
 * sandbox (even on error). Returns `loopPosition` + `summaryWritten` read back
 * from the sandbox before cleanup. Throws if a step throws.
 */
export async function runTutorial(
  opts: TutorialOpts,
  io: CommandIO,
  deps: TutorialDeps = {},
): Promise<CommandResult> {
  const root = await mkdtemp(join(tmpdir(), 'cadence-tutorial-'));
  try {
    line(io);
    line(io, '  CADENCE tutorial — one real loop, and the moment it refuses');
    line(io, '  ──────────────────────────────────────────────────────────');
    line(io, `  Sandbox: ${root}  (removed when this finishes)`);
    await scaffoldSandbox(root);

    const steps = deps.steps ?? defaultSteps(opts);
    for (const step of steps) {
      await step({ root, io });
    }

    const finalState = await new SimpleStateBackend(root).readState();
    const summaryWritten = existsSync(
      join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-SUMMARY.md`),
    );

    line(io);
    line(io, '  You marked T1 done back in the build step. The state disagreed.');
    line(io, '  That gap — and settle refusing to paper over it — is the whole tool.');
    line(io);
    line(io, '  Next:  cadence init                                  (start your own loop)');
    line(io, '         npx @manehorizons/cadence-host-claude-code install   (wire into Claude Code)');
    line(io);

    return {
      exitCode: 0,
      data: { loopPosition: finalState.loopPosition, summaryWritten, sandbox: root },
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export function registerTutorialCommand(program: Command): void {
  program
    .command('tutorial')
    .description('Run one real DRAFT→BUILD→SETTLE loop — including the moment settle refuses')
    .option('--no-pause', 'do not pause between steps (auto-advance; for non-TTY)')
    .action(async (opts: { pause?: boolean }) => {
      // commander maps `--no-pause` to `opts.pause === false`.
      const res = await runTutorial({ noPause: opts.pause === false }, processIO());
      process.exitCode = res.exitCode;
    });
}
