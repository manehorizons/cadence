import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdir, mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState } from '@thomas-powers-jr/cadence-types';
import { runDemo, pause } from '../../src/demo/run.js';
import { bufferIO } from '../../src/services/io.js';
import { SimpleStateBackend } from '../../src/state/simple.js';
import { atomicWriteJSON } from '../../src/state/atomic-write.js';
import { draftNewService } from '../../src/services/draft-new.js';
import { draftApproveService } from '../../src/services/draft-approve.js';
import { settleService } from '../../src/services/settle.js';
import { recordTaskOutcome } from '../../src/build/record.js';
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
} from '../../src/demo/fixtures.js';
import {
  readStage,
  ONBOARDING_STAGE_FIRST_CONTACT,
  ONBOARDING_STAGE_DRIVER,
} from '../../src/onboarding/state.js';

/**
 * e2e tests for `cadence demo` (phase 278, T2). Per the DRAFT's As-built
 * note: T1's own reviewer found T1's tests only prove the coverage *scanner*
 * classifies the gutted/honest fixtures correctly -- a unit-level proxy.
 * These tests are what actually spawn the real DRAFT->BUILD->SETTLE flow via
 * the real engine services (draftNewService, draftApproveService,
 * settleService) and assert on the real refusal/pass, so AC-1/AC-2 close
 * here rather than in T1. No `--ac` manual assertion and no coverage bypass
 * anywhere in this file or in `demo/run.ts`.
 */

/** Count leftover sandbox dirs so we can assert the demo cleans up (AC-3). */
async function sandboxCount(): Promise<number> {
  const entries = await readdir(tmpdir());
  return entries.filter((e) => e.startsWith('cadence-demo-')).length;
}

/**
 * Stage a sandbox to the exact state `cadence demo` reaches just before its
 * first settle: BUILD, T1 DONE, `greet.mjs` present, GUTTED_TEST staged (a
 * real reference to AC-1 that is never actually asserted on). Uses the same
 * real engine services + fixtures the command itself uses -- no `--ac`, no
 * bypass.
 */
async function stageToFirstSettle(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cadence-demo-stage-'));
  const cadenceDir = join(root, '.cadence');
  await mkdir(join(cadenceDir, 'phases'), { recursive: true });
  await atomicWriteJSON(join(cadenceDir, 'config.json'), SANDBOX_CONFIG);
  await new SimpleStateBackend(root).commit(emptyState('demo-test'));
  const io = bufferIO();
  await draftNewService(
    root,
    { phase: DEMO_PHASE, num: DEMO_NUM, title: 'Add a greet() helper', tier: 'quick-fix' },
    io,
  );
  await writeFile(
    join(cadenceDir, 'phases', DEMO_PHASE, `${DEMO_ID}-DRAFT.md`),
    renderGreetDraft().content,
  );
  await draftApproveService(root, { phase: DEMO_PHASE, num: DEMO_NUM, approve: false }, io);
  await writeFile(join(root, IMPL_FILE), GREET_IMPL);
  await writeFile(join(root, TEST_FILE), GUTTED_TEST);
  await recordTaskOutcome(root, 'T1', 'DONE', 'implemented greet()');
  return root;
}

describe('cadence demo', () => {
  // Guarantee no inherited key sends a run down a network path.
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  });

  // (T6): every test in this file points CADENCE_HOME at a fresh
  // mkdtemp dir (matching T5's tests/onboarding/state.test.ts and T8's
  // tests/cli/start.test.ts isolation pattern). runDemo() now calls
  // advanceStage(1) at its closing success beat, so without this override
  // every already-existing successful-run test above would otherwise read
  // and write the real $HOME/.cadence/onboarding.json.
  let onboardingHomeDir: string;
  let savedCadenceHome: string | undefined;
  beforeEach(async () => {
    savedCadenceHome = process.env.CADENCE_HOME;
    onboardingHomeDir = await mkdtemp(join(tmpdir(), 'cadence-demo-onboarding-'));
    process.env.CADENCE_HOME = onboardingHomeDir;
  });
  afterEach(async () => {
    if (savedCadenceHome === undefined) {
      delete process.env.CADENCE_HOME;
    } else {
      process.env.CADENCE_HOME = savedCadenceHome;
    }
    await rm(onboardingHomeDir, { recursive: true, force: true });
  });

  // 278-01/AC-1: with T1 marked DONE but backed only by a gutted (mention-
  // only, never-asserting) test, the first --auto settle genuinely REFUSES,
  // citing the real test-coverage gate's own message -- not a synthetic
  // string -- and the loop stays in BUILD.
  it('278-01/AC-1: settle --auto refuses the gutted fixture, citing the real coverage gate, staying in BUILD', async () => {
    const root = await stageToFirstSettle();
    try {
      const io = bufferIO();
      const res = await settleService(root, { auto: true }, io);
      expect(res.exitCode).not.toBe(0);
      expect(io.stderr()).toMatch(
        /coverage:\s*AC-1 is mentioned but not inside a recognized asserting test block \(assertion mode\)/,
      );
      const state = await new SimpleStateBackend(root).readState();
      expect(state.loopPosition).toBe('BUILD');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // 278-01/AC-2: swapping in the honest fixture (the real assertion restored)
  // lets the second --auto settle genuinely pass -- real `node --test`
  // execution backs it, not a hand-asserted verdict -- and the loop closes.
  it('278-01/AC-2: the honest fixture closes the loop for real; exit 0, IDLE', async () => {
    const root = await stageToFirstSettle();
    try {
      await writeFile(join(root, TEST_FILE), HONEST_TEST);
      const res = await settleService(root, { auto: true }, bufferIO());
      expect(res.exitCode).toBe(0);
      const state = await new SimpleStateBackend(root).readState();
      expect(state.loopPosition).toBe('IDLE');
      expect(
        existsSync(join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-SUMMARY.md`)),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // the full default (no-flags) run narrates the visible
  // refuse-then-succeed arc end to end, closes the loop, leaves no leftover
  // sandbox on disk, and -- the clause a plain "it completed" assertion
  // can't catch -- never pauses, even when stdin genuinely is a TTY. Vitest's
  // own stdin isn't a TTY, so without forcing `isTTY` here this test would
  // pass even if `defaultSteps` regressed to tutorial's TTY-auto-pause
  // default; forcing it makes the "no pauses" half of AC-3 load-bearing.
  it('278-01/AC-3: default run is fully non-interactive, closes the loop, and removes its temp sandbox', async () => {
    const sandboxesBefore = await sandboxCount();
    const cwdCadenceBefore = existsSync(join(process.cwd(), '.cadence'));
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;

    const io = bufferIO();
    const start = Date.now();
    let res: Awaited<ReturnType<typeof runDemo>>;
    try {
      res = await runDemo({}, io);
    } finally {
      process.stdin.isTTY = originalIsTTY;
    }
    const elapsed = Date.now() - start;
    // A regression to tutorial's default (TTY-auto-pause with no explicit
    // opt-out) would add the full six-beat pause sum (800+800+1000+1800+1000
    // = 5400ms). An unpaused run was observed at ~850ms in this suite; 4000ms
    // leaves ample headroom above that baseline (this repo has scar tissue on
    // Windows/CI timing flakes -- see CLAUDE.md's Windows Panic entry -- so
    // the margin is deliberately generous) while still catching the
    // regression this assertion exists to guard against.
    expect(elapsed).toBeLessThan(4000);
    const out = io.stdout();
    const err = io.stderr();

    expect(res.exitCode).toBe(0);
    // Distinct refusal banner + explicit non-close statement, backed by the
    // real gate's own message on stderr (not a synthetic string).
    expect(out).toContain('SETTLE REFUSED');
    expect(out).toMatch(/will NOT close/);
    expect(err).toMatch(
      /coverage:\s*AC-1 is mentioned but not inside a recognized asserting test block \(assertion mode\)/,
    );
    expect(out.indexOf('SETTLE REFUSED')).toBeLessThan(out.indexOf('the loop closed'));
    // The real `node --test` execution is echoed.
    expect(out).toContain('$ node --test');

    const data = res.data as {
      loopPosition?: string;
      summaryWritten?: boolean;
      sandbox?: string;
      kept?: boolean;
    };
    expect(data.loopPosition).toBe('IDLE');
    expect(data.summaryWritten).toBe(true);
    expect(data.kept).toBe(false);

    // No leftover sandbox, cwd untouched, sandbox lived under tmpdir and is
    // now gone from disk.
    expect(await sandboxCount()).toBe(sandboxesBefore);
    expect(existsSync(join(process.cwd(), '.cadence'))).toBe(cwdCadenceBefore);
    expect(data.sandbox).toMatch(/cadence-demo-/);
    expect(data.sandbox?.startsWith(tmpdir())).toBe(true);
    expect(existsSync(data.sandbox as string)).toBe(false);
  });

  // --keep leaves the sandbox on disk at the path reported back
  // in the result, instead of deleting it.
  it('278-01/AC-4: --keep leaves the sandbox on disk at a reported path', async () => {
    const io = bufferIO();
    const res = await runDemo({ keep: true }, io);
    try {
      expect(res.exitCode).toBe(0);
      const data = res.data as { sandbox?: string; kept?: boolean };
      expect(data.kept).toBe(true);
      expect(data.sandbox).toBeTruthy();
      expect(existsSync(data.sandbox as string)).toBe(true);
      expect(
        existsSync(join(data.sandbox as string, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-SUMMARY.md`)),
      ).toBe(true);
      expect(io.stdout()).toMatch(/Sandbox left on disk at:/);
    } finally {
      const data = res.data as { sandbox?: string };
      if (data.sandbox) await rm(data.sandbox, { recursive: true, force: true });
    }
  });

  // --in-place operates inside the caller's own current working
  // directory rather than creating its own nested temp dir.
  it('278-01/AC-6: --in-place runs inside the current working directory, not a fresh nested temp dir', async () => {
    const inPlaceRoot = await mkdtemp(join(tmpdir(), 'cadence-demo-inplace-'));
    const originalCwd = process.cwd();
    process.chdir(inPlaceRoot);
    try {
      const expectedRoot = process.cwd();
      const io = bufferIO();
      const res = await runDemo({ inPlace: true }, io);
      expect(res.exitCode).toBe(0);
      const data = res.data as { sandbox?: string; kept?: boolean };
      // Operated in the caller-controlled cwd -- not a new mkdtemp path.
      expect(data.sandbox).toBe(expectedRoot);
      expect(data.kept).toBe(true);
      expect(existsSync(join(expectedRoot, '.cadence'))).toBe(true);
      expect(existsSync(join(expectedRoot, IMPL_FILE))).toBe(true);
      expect(existsSync(join(expectedRoot, TEST_FILE))).toBe(true);
    } finally {
      process.chdir(originalCwd);
      await rm(inPlaceRoot, { recursive: true, force: true });
    }
  });

  // --interactive pauses between beats when stdin is a real
  // TTY; a plain (non-interactive) run never pauses, and --interactive
  // without a TTY doesn't pause either.
  it('278-01/AC-5: --interactive pauses between beats in a TTY; a plain run never pauses', async () => {
    const originalIsTTY = process.stdin.isTTY;
    try {
      process.stdin.isTTY = true;
      const start = Date.now();
      await pause({ interactive: true }, 60);
      expect(Date.now() - start).toBeGreaterThanOrEqual(55);

      const start2 = Date.now();
      await pause({ interactive: false }, 60);
      expect(Date.now() - start2).toBeLessThan(30);

      process.stdin.isTTY = false;
      const start3 = Date.now();
      await pause({ interactive: true }, 60);
      expect(Date.now() - start3).toBeLessThan(30);
    } finally {
      process.stdin.isTTY = originalIsTTY;
    }
  });

  // wiring-level proof that a real --interactive run actually
  // calls pause() at every beat boundary defaultSteps wires it into (not just
  // that the standalone pause() helper gates correctly in isolation, which
  // the test above already covers). Stripping all 5 `pause()` calls out of
  // defaultSteps wouldn't fail any other test in this file -- this one exists
  // specifically to catch that regression. Injects a fake `sleep` via
  // DemoDeps so no real wall-clock delay is incurred (this repo has known
  // Windows/CI timing flakiness -- see CLAUDE.md's Windows Panic entry).
  it('278-01/AC-5: a real --interactive run invokes the pause seam at every beat boundary', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
    const sleepCalls: number[] = [];
    const fakeSleep = async (ms: number): Promise<void> => {
      sleepCalls.push(ms);
    };
    const io = bufferIO();
    let res: Awaited<ReturnType<typeof runDemo>>;
    try {
      res = await runDemo({ interactive: true }, io, { sleep: fakeSleep });
    } finally {
      process.stdin.isTTY = originalIsTTY;
    }
    expect(res.exitCode).toBe(0);
    // defaultSteps calls pause() once per beat except the closing beat (6
    // beats, 5 pauses) -- the exact count the reviewer's repro proved was
    // unobserved.
    expect(sleepCalls.length).toBe(5);
  });

  // --in-place refuses instead of silently overwriting when a
  // .cadence/ directory already exists in the target cwd. Reproduces the
  // reviewer's exact finding: scaffoldSandbox's unconditional atomicWriteJSON
  // was clobbering a pre-existing config.json (and, by the same code path,
  // state.json and PROJECT.md) with zero warning and exit 0. This is the
  // repo's "Refuse + suggest, never silently mutate" convention (CLAUDE.md).
  it('278-01/AC-6: --in-place refuses when a .cadence/ directory already exists, touching nothing', async () => {
    const inPlaceRoot = await mkdtemp(join(tmpdir(), 'cadence-demo-inplace-collision-'));
    const originalCwd = process.cwd();
    const cadenceDir = join(inPlaceRoot, '.cadence');
    const sentinelPath = join(cadenceDir, 'config.json');
    const sentinelContent = JSON.stringify({ sentinel: 'pre-existing-real-project-config' });
    await mkdir(cadenceDir, { recursive: true });
    await writeFile(sentinelPath, sentinelContent);

    process.chdir(inPlaceRoot);
    try {
      const io = bufferIO();
      const res = await runDemo({ inPlace: true }, io);

      // (a) non-zero exit.
      expect(res.exitCode).not.toBe(0);

      // (b) the sentinel is byte-for-byte unchanged.
      const after = await readFile(sentinelPath, 'utf8');
      expect(after).toBe(sentinelContent);

      // Nothing scaffoldSandbox would have created exists either -- proves
      // the refusal fired before any write, not merely that this one file
      // survived.
      expect(existsSync(join(cadenceDir, 'state.json'))).toBe(false);
      expect(existsSync(join(cadenceDir, 'PROJECT.md'))).toBe(false);
      expect(existsSync(join(cadenceDir, 'phases'))).toBe(false);
      expect(existsSync(join(cadenceDir, 'handoff'))).toBe(false);
      expect(existsSync(join(inPlaceRoot, IMPL_FILE))).toBe(false);
      expect(existsSync(join(inPlaceRoot, TEST_FILE))).toBe(false);

      // (c) a clear error naming the conflict and the remedy, on stderr.
      expect(io.stderr()).toMatch(/refusing to run/);
      expect(io.stderr()).toMatch(/\.cadence\//);
      expect(io.stderr()).toMatch(/without --in-place/);
      // The run banner never printed -- the refusal fired before the walkthrough started.
      expect(io.stdout()).not.toContain('CADENCE demo');
    } finally {
      process.chdir(originalCwd);
      await rm(inPlaceRoot, { recursive: true, force: true });
    }
  });

  // (T6): a full successful runDemo() run -- the real
  // refuse-then-succeed walkthrough closing for real, not a synthetic
  // stand-in -- advances the onboarding stage to at least Driver (1) by the
  // time it returns. T5's own tests (tests/onboarding/state.test.ts) already
  // prove advanceStage()/readStage() in isolation; this proves the wiring
  // T6 added actually fires at the end of a genuine demo completion, under
  // the same CADENCE_HOME test-isolation pattern.
  it('278-01/AC-9: a successful demo run advances the onboarding stage to >= 1 (Driver)', async () => {
    expect(readStage()).toBe(ONBOARDING_STAGE_FIRST_CONTACT);

    const io = bufferIO();
    const res = await runDemo({}, io);

    expect(res.exitCode).toBe(0);
    expect(readStage()).toBeGreaterThanOrEqual(ONBOARDING_STAGE_DRIVER);
  });

  // (T6): the interim beat-4 refusal is expected mid-walkthrough
  // behavior, not a completion -- it must NOT advance the stage on its own.
  // Staging directly to just before that first (refusing) settle and calling
  // settleService alone (never reaching runDemo's closing success beat)
  // proves the stage stays untouched.
  it('278-01/AC-9: the interim settle refusal alone does not advance the onboarding stage', async () => {
    const root = await stageToFirstSettle();
    try {
      expect(readStage()).toBe(ONBOARDING_STAGE_FIRST_CONTACT);
      const res = await settleService(root, { auto: true }, bufferIO());
      expect(res.exitCode).not.toBe(0);
      expect(readStage()).toBe(ONBOARDING_STAGE_FIRST_CONTACT);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
