import type { Command } from 'commander';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { presets, emptyState } from '@manehorizons/cadence-types';
import { atomicWriteJSON } from '../../state/atomic-write.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { draftNewService } from '../../services/draft-new.js';
import { draftApproveService } from '../../services/draft-approve.js';
import { settleService } from '../../services/settle.js';
import { recordTaskOutcome } from '../../build/record.js';
import { processIO, type CommandIO, type CommandResult } from '../../services/io.js';
import { StdinPrompter } from '../../verify/prompter.js';
import { derivePhaseTaskId } from '../../phases/id.js';

/**
 * `cadence tutorial` — run one real DRAFT→BUILD→SETTLE loop inside an ephemeral
 * sandbox, printing each step's command and the engine's actual output, then
 * clean up. The executable companion to the static "Your first loop" block in
 * `cadence init` (phase 62): it composes the real engine services so the
 * walkthrough can never drift from real behavior.
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

// The draft id is derived via derivePhaseTaskId and must match /^\d{2,}-\d{2,}$/.
const DEMO_PHASE = '00-demo';
const DEMO_NUM = '01';
const DEMO_ID = derivePhaseTaskId(DEMO_PHASE, DEMO_NUM); // 00-01

/** A coherent quick-fix toy draft: one AC, one task, one file. */
const TOY_DRAFT = `---
phase: ${DEMO_PHASE}
id: ${DEMO_ID}
tier: quick-fix
status: PENDING
---

# ${DEMO_ID} — Hello loop

## Objective

A throwaway demo so you can watch one DRAFT→BUILD→SETTLE loop run end to end.

## Acceptance Criteria

### AC-1: the loop closes cleanly
Given this demo draft
When the loop settles
Then AC-1 is recorded as pass.

## Tasks

### T1: greet the loop
- files: \`hello.txt\`
- action: write a one-line greeting to hello.txt
- verify: the greeting is present
- done: AC-1

## Boundaries

- DO NOT rely on this demo phase outside the tutorial.
`;

function line(io: CommandIO, s = ''): void {
  io.out(`${s}\n`);
}

function header(io: CommandIO, n: number, label: string, cmd: string): void {
  line(io);
  line(io, `  Step ${n}/5 · ${label}`);
  line(io, `  $ cadence ${cmd}`);
}

/** Header for a non-command step (e.g. editing the DRAFT in your editor). */
function headerNote(io: CommandIO, n: number, label: string, note: string): void {
  line(io);
  line(io, `  Step ${n}/5 · ${label}`);
  line(io, `  ${note}`);
}

/** Fail loudly if a composed service returns non-zero — keeps the demo honest
 * (a future gate change can't silently leave the loop half-run). The service
 * has already streamed its own error to `io.err`. */
function expectOk(res: CommandResult, step: string): void {
  if (res.exitCode !== 0) {
    throw new Error(`tutorial step "${step}" failed (exit ${res.exitCode})`);
  }
}

/** Pause between steps in a real TTY; auto-advance otherwise. */
async function maybePause(opts: TutorialOpts): Promise<void> {
  if (opts.noPause || !process.stdin.isTTY) return;
  let prompter: StdinPrompter | null = null;
  try {
    prompter = new StdinPrompter();
    await prompter.ask('  [press enter to continue …] ');
  } catch {
    /* no TTY after all — just advance */
  } finally {
    await prompter?.close?.();
  }
}

/** Scaffold a minimal `.cadence/` in `root` (mirrors init.ts), tuned so the
 * settle stack passes offline on a no-test toy draft. */
async function scaffoldSandbox(root: string): Promise<void> {
  const cadenceDir = join(root, '.cadence');
  await mkdir(join(cadenceDir, 'phases'), { recursive: true });
  await mkdir(join(cadenceDir, 'handoff'), { recursive: true });
  await mkdir(join(cadenceDir, 'research'), { recursive: true });
  await mkdir(join(cadenceDir, 'archive'), { recursive: true });
  // `solo` preset: reminder loop-enforcement + optional AC-discipline — the
  // gentlest gate posture, right for a throwaway demo. profile stays `auto`.
  await atomicWriteJSON(join(cadenceDir, 'config.json'), presets.solo);
  await new SimpleStateBackend(root).commit(emptyState('tutorial'));
  await writeFile(
    join(cadenceDir, 'PROJECT.md'),
    '# tutorial\n\n> CADENCE tutorial sandbox — created and removed by `cadence tutorial`.\n',
  );
}

/** The five-step walkthrough, each printing its command + the real output. */
function defaultSteps(opts: TutorialOpts): Step[] {
  return [
    async ({ root, io }) => {
      header(io, 1, 'DRAFT', `draft new ${DEMO_PHASE} ${DEMO_NUM} --title "Hello loop"`);
      expectOk(
        await draftNewService(
          root,
          { phase: DEMO_PHASE, num: DEMO_NUM, title: 'Hello loop', tier: 'quick-fix' },
          io,
        ),
        'draft new',
      );
      await maybePause(opts);
    },
    async ({ root, io }) => {
      headerNote(io, 2, 'EDIT', `(open ${DEMO_ID}-DRAFT.md in your editor — add the objective, AC-1, one task)`);
      await writeFile(
        join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-DRAFT.md`),
        TOY_DRAFT,
      );
      line(io, `  Wrote an objective, AC-1, and task T1 into the DRAFT.`);
      await maybePause(opts);
    },
    async ({ root, io }) => {
      header(io, 3, 'APPROVE', `draft approve ${DEMO_PHASE} ${DEMO_NUM}`);
      expectOk(
        await draftApproveService(
          root,
          { phase: DEMO_PHASE, num: DEMO_NUM, approve: false },
          io,
        ),
        'draft approve',
      );
      await maybePause(opts);
    },
    async ({ root, io }) => {
      header(io, 4, 'BUILD', `done T1`);
      await recordTaskOutcome(root, 'T1', 'DONE', 'demo task complete');
      line(io, `  Recorded T1: DONE`);
      await maybePause(opts);
    },
    async ({ root, io }) => {
      header(io, 5, 'SETTLE', `settle run --ac AC-1=pass`);
      expectOk(
        await settleService(root, { ac: ['AC-1=pass'], allowMissingCoverage: true }, io),
        'settle run',
      );
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
    line(io, '  CADENCE tutorial — one real loop, in a throwaway sandbox');
    line(io, '  ───────────────────────────────────────────────────────');
    line(io, `  Sandbox: ${root}  (removed when this finishes)`);
    await scaffoldSandbox(root);

    const steps = deps.steps ?? defaultSteps(opts);
    for (const step of steps) {
      await step({ root, io });
    }

    const finalState = await new SimpleStateBackend(root).readState();
    const summaryWritten = (await import('node:fs')).existsSync(
      join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-SUMMARY.md`),
    );

    line(io);
    line(io, "  That's the whole loop. Run `cadence init` to start your own.");
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
    .description('Run one real DRAFT→BUILD→SETTLE loop in a throwaway sandbox')
    .option('--no-pause', 'do not pause between steps (auto-advance; for non-TTY)')
    .action(async (opts: { pause?: boolean }) => {
      // commander maps `--no-pause` to `opts.pause === false`.
      const res = await runTutorial({ noPause: opts.pause === false }, processIO());
      process.exitCode = res.exitCode;
    });
}
