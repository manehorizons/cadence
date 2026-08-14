import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdir, mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyState } from '@thomas-powers-jr/cadence-types';
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
  // Phase 214: SANDBOX_CONFIG itself already overrides gates.evidenceFloor to
  // 'mention' (fixtures.ts) to match its deliberate verification.coverageMode:
  // 'mention' — deriveAcEvidence never reports better than 'mention' evidence
  // under that mode, regardless of whether the AC's test genuinely executed.
  // These two unit tests exercise refuse→fix→pass via `stageToFirstSettle`
  // (not the evidence-floor gate itself), so relax the floor further to
  // 'unverified' here to preserve their original intent unrelated to this
  // gate. The real-CLI `runTutorial()` path (AC-4 below) runs unmodified
  // SANDBOX_CONFIG and passes as-is — no gap.
  await atomicWriteJSON(join(cadenceDir, 'config.json'), {
    ...SANDBOX_CONFIG,
    gates: { sealed: [], evidenceFloor: 'unverified' as const },
  });
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
      // Refused settle now persists a SUMMARY with the refusing gate's
      // provenance (phase 170), where previously nothing was written.
      const summaryMdPath = join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-SUMMARY.md`);
      const summaryJsonPath = join(root, '.cadence', 'phases', DEMO_PHASE, `${DEMO_ID}-SUMMARY.json`);
      expect(existsSync(summaryMdPath)).toBe(true);
      const summary = JSON.parse(await readFile(summaryJsonPath, 'utf8'));
      expect(summary.gates[summary.gates.length - 1]).toMatchObject({
        gate: 'test-coverage',
        status: 'refused',
      });
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

  // AC-2 + AC-4 + AC-5: one shared full run covers the visible refuse→fix→pass
  // arc, the real `node --test` output, IDLE+SUMMARY, sandbox cleanup, cwd
  // isolation, and the offline (no API key) path. Consolidated into a single
  // run: each `runTutorial` spawns several real `node --test` subprocesses, so
  // running it once keeps CI load (and the parallel-load flake budget) down.
  it('AC-4: full run refuses visibly, then settles — and is offline + ephemeral', async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined(); // AC-5: offline path
    const sandboxesBefore = await sandboxCount();
    const cwdCadenceBefore = existsSync(join(process.cwd(), '.cadence'));

    const io = bufferIO();
    const res = await runTutorial({ noPause: true }, io);
    const out = io.stdout();
    const err = io.stderr();

    expect(res.exitCode).toBe(0);
    // AC-4: distinct refusal banner + explicit non-close statement, naming AC-1
    // (the reason came from the real gate, on stderr).
    expect(out).toContain('SETTLE REFUSED');
    expect(out).toMatch(/will NOT close/);
    expect(err).toMatch(/coverage:\s*AC-1 has no linked test/);
    // AC-4: the refusal is printed before the settled confirmation.
    expect(out.indexOf('SETTLE REFUSED')).toBeLessThan(out.indexOf('the loop closed'));
    // AC-2: the real `node --test` execution is echoed at both ends.
    expect(out).toContain('$ node --test');
    expect(out).toMatch(/tests 0\b/); // before the fix: nothing backs AC-1
    expect(out).toMatch(/pass 1\b/); // after the fix: the real test passes
    // AC-2: the close happened — IDLE + SUMMARY.
    const data = res.data as {
      loopPosition?: string;
      summaryWritten?: boolean;
      sandbox?: string;
    };
    expect(data.loopPosition).toBe('IDLE');
    expect(data.summaryWritten).toBe(true);
    // AC-5: no leftover sandbox, cwd untouched, sandbox lived under tmpdir.
    expect(await sandboxCount()).toBe(sandboxesBefore);
    expect(existsSync(join(process.cwd(), '.cadence'))).toBe(cwdCadenceBefore);
    expect(data.sandbox).toMatch(/cadence-tutorial-/);
    expect(data.sandbox?.startsWith(tmpdir())).toBe(true);
    // 278-01/AC-8: tutorial keeps working and points at demo.
    expect(err).toMatch(/cadence demo/);
  });

  // Phase 267 (267-01, T5 / whole-branch-review follow-up): the tutorial's
  // sandbox runs at standard-profile/quick-fix-tier, which per the DELTAS
  // matrix (gates/engine.ts) carries no review-family gate at all — so
  // mock-abstention (T1-T3) is structurally unreachable here, and the loop
  // must close exactly as it always has. Reuses the same real end-to-end
  // path as AC-4 above rather than a new mechanism.
  it('267-01/AC-5: cadence tutorial completes end to end, unaffected by mock-abstention on review gates', async () => {
    const io = bufferIO();
    const res = await runTutorial({ noPause: true }, io);
    expect(res.exitCode).toBe(0);
    const data = res.data as { loopPosition?: string; summaryWritten?: boolean };
    expect(data.loopPosition).toBe('IDLE');
    expect(data.summaryWritten).toBe(true);
    expect(io.stdout()).toContain('the loop closed');
  });

  // AC-5 (failure path): a throw mid-run still removes the sandbox (no spawns).
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
});
