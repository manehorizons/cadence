import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdir, mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyState } from '@manehorizons/cadence-types';
import { runTutorial } from '../../src/cli/commands/tutorial.js';
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
  SUM_IMPL,
  SUM_TEST,
  renderSumDraft,
} from '../../src/tutorial/fixtures.js';

/** Count leftover sandbox dirs so we can assert the tutorial cleans up (AC-5). */
async function sandboxCount(): Promise<number> {
  const entries = await readdir(tmpdir());
  return entries.filter((e) => e.startsWith('cadence-tutorial-')).length;
}

/**
 * Stage a sandbox to the exact state the tutorial reaches just before its first
 * settle: BUILD, T1 DONE, `sum.mjs` present, but NO test backing AC-1. Uses the
 * same real engine services + fixtures the command does — no `--ac`, no bypass.
 */
async function stageToFirstSettle(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'cadence-tutorial-stage-'));
  const cadenceDir = join(root, '.cadence');
  await mkdir(join(cadenceDir, 'phases'), { recursive: true });
  await atomicWriteJSON(join(cadenceDir, 'config.json'), SANDBOX_CONFIG);
  await new SimpleStateBackend(root).commit(emptyState('tutorial-test'));
  const io = bufferIO();
  await draftNewService(
    root,
    { phase: DEMO_PHASE, num: DEMO_NUM, title: 'Add a sum() helper', tier: 'quick-fix' },
    io,
  );
  await writeFile(
    join(cadenceDir, 'phases', DEMO_PHASE, `${DEMO_ID}-DRAFT.md`),
    renderSumDraft().content,
  );
  await draftApproveService(root, { phase: DEMO_PHASE, num: DEMO_NUM, approve: false }, io);
  await writeFile(join(root, IMPL_FILE), SUM_IMPL);
  await recordTaskOutcome(root, 'T1', 'DONE', 'implemented sum()');
  return root;
}

describe('cadence tutorial', () => {
  // Guarantee no inherited key sends the run down a network path (AC-5).
  let savedKey: string | undefined;
  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });
  afterEach(() => {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  });

  // AC-1: with T1 done but no test, the first --auto settle REFUSES naming AC-1
  // and leaves the loop in BUILD — nothing is settled.
  it('AC-1: settle --auto refuses the unbacked claim, naming AC-1, staying in BUILD', async () => {
    const root = await stageToFirstSettle();
    try {
      const io = bufferIO();
      const res = await settleService(root, { auto: true }, io);
      expect(res.exitCode).not.toBe(0);
      expect(io.stderr()).toMatch(/coverage:\s*AC-1 has no linked test/);
      // The loop must not have closed.
      const state = await new SimpleStateBackend(root).readState();
      expect(state.loopPosition).toBe('BUILD');
      expect(
        existsSync(join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-SUMMARY.md`)),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // AC-2: adding the real test lets the second --auto settle close the loop, and
  // the pass is execution-backed — a FAILING test instead refuses (build gate).
  it('AC-2: a real passing test closes the loop; a failing test refuses', async () => {
    const root = await stageToFirstSettle();
    try {
      // A test that references AC-1 but FAILS must still refuse (real execution).
      await writeFile(
        join(root, TEST_FILE),
        SUM_TEST.replace('sum(2, 3), 5', 'sum(2, 3), 6'),
      );
      const failRes = await settleService(root, { auto: true }, bufferIO());
      expect(failRes.exitCode).not.toBe(0);
      expect((await new SimpleStateBackend(root).readState()).loopPosition).toBe('BUILD');

      // The genuine, passing test closes the loop to IDLE with a SUMMARY.
      await writeFile(join(root, TEST_FILE), SUM_TEST);
      const okRes = await settleService(root, { auto: true }, bufferIO());
      expect(okRes.exitCode).toBe(0);
      const state = await new SimpleStateBackend(root).readState();
      expect(state.loopPosition).toBe('IDLE');
      expect(
        existsSync(join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-SUMMARY.md`)),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // AC-3: the tutorial path never uses a manual --ac assertion or coverage bypass.
  it('AC-3: no --ac manual assertion or coverage bypass in the tutorial path', async () => {
    const here = fileURLToPath(import.meta.url);
    const srcDir = join(here, '..', '..', '..', 'src');
    const sources = await Promise.all([
      readFile(join(srcDir, 'cli', 'commands', 'tutorial.ts'), 'utf8'),
      readFile(join(srcDir, 'tutorial', 'fixtures.ts'), 'utf8'),
    ]);
    for (const text of sources) {
      // No manual AC verdict (e.g. `ac: ['AC-1=pass']` or `--ac AC-1=pass`).
      expect(text).not.toMatch(/AC-1=pass/);
      expect(text).not.toMatch(/allowMissingCoverage/);
      expect(text).not.toMatch(/--allow-missing-coverage/);
    }
  });

  // AC-1 + AC-4: a full run shows the refusal (distinct, naming AC-1) BEFORE the
  // settle, then closes to IDLE with a SUMMARY.
  it('AC-4: full run refuses visibly then settles — refuse precedes the close', async () => {
    const io = bufferIO();
    const res = await runTutorial({ noPause: true }, io);
    expect(res.exitCode).toBe(0);
    const out = io.stdout();
    const err = io.stderr();
    // Distinct refusal banner + explicit non-close statement.
    expect(out).toContain('SETTLE REFUSED');
    expect(out).toMatch(/will NOT close/);
    // The refusal reason naming AC-1 came from the real gate (stderr).
    expect(err).toMatch(/coverage:\s*AC-1 has no linked test/);
    // The close happened after — same run reaches IDLE + SUMMARY.
    const data = res.data as { loopPosition?: string; summaryWritten?: boolean };
    expect(data.loopPosition).toBe('IDLE');
    expect(data.summaryWritten).toBe(true);
    // The refusal is printed before the settled confirmation.
    expect(out.indexOf('SETTLE REFUSED')).toBeLessThan(out.indexOf('the loop closed'));
  });

  // AC-2: the run echoes the real `node --test` execution at both ends.
  it('AC-2: prints the real node --test run (0 tests, then 1 passing)', async () => {
    const io = bufferIO();
    await runTutorial({ noPause: true }, io);
    const out = io.stdout();
    expect(out).toContain('$ node --test');
    expect(out).toMatch(/tests 0\b/); // before the fix: nothing backs AC-1
    expect(out).toMatch(/pass 1\b/); // after the fix: the real test passes
  });

  // AC-5: the sandbox is removed and the user's cwd is never scaffolded.
  it('AC-5: cleans up its temp sandbox and never touches the cwd', async () => {
    const before = await sandboxCount();
    const cwdCadenceBefore = existsSync(join(process.cwd(), '.cadence'));
    const io = bufferIO();
    const res = await runTutorial({ noPause: true }, io);
    expect(await sandboxCount()).toBe(before); // no leftover sandbox
    expect(existsSync(join(process.cwd(), '.cadence'))).toBe(cwdCadenceBefore);
    const data = res.data as { sandbox?: string };
    expect(data.sandbox).toMatch(/cadence-tutorial-/);
    expect(data.sandbox?.startsWith(tmpdir())).toBe(true);
  });

  // AC-5 (failure path): a throw mid-run still removes the sandbox.
  it('AC-5: removes the sandbox even when a step throws', async () => {
    const before = await sandboxCount();
    const io = bufferIO();
    await expect(
      runTutorial({ noPause: true }, io, {
        steps: [
          async () => {
            throw new Error('boom');
          },
        ],
      }),
    ).rejects.toThrow(/boom/);
    expect(await sandboxCount()).toBe(before);
  });

  // AC-5: completes offline/deterministically with no API key set.
  it('AC-5: completes with no ANTHROPIC_API_KEY (offline mock path)', async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    const io = bufferIO();
    const res = await runTutorial({ noPause: true }, io);
    expect(res.exitCode).toBe(0);
  });
});
