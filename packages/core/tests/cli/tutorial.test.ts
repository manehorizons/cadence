import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runTutorial } from '../../src/cli/commands/tutorial.js';
import { bufferIO } from '../../src/services/io.js';

/** Count leftover sandbox dirs so we can assert the tutorial cleans up (AC-3). */
async function sandboxCount(): Promise<number> {
  const entries = await readdir(tmpdir());
  return entries.filter((e) => e.startsWith('cadence-tutorial-')).length;
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

  // AC-1: the full loop runs end-to-end and exits 0, reaching IDLE with a SUMMARY.
  it('AC-1: drives draft→approve→done→settle to IDLE and exits 0', async () => {
    const io = bufferIO();
    const res = await runTutorial({ noPause: true }, io);
    expect(res.exitCode).toBe(0);
    const data = res.data as { loopPosition?: string; summaryWritten?: boolean };
    expect(data.loopPosition).toBe('IDLE');
    expect(data.summaryWritten).toBe(true);
  });

  // AC-2: each of the five steps prints its command + the engine's real output.
  it('AC-2: prints five labeled steps with real engine output', async () => {
    const io = bufferIO();
    await runTutorial({ noPause: true }, io);
    const out = io.stdout();
    for (let n = 1; n <= 5; n++) {
      expect(out).toContain(`Step ${n}/5`);
    }
    // Real captured output from the services, not hand-written narration:
    expect(out).toMatch(/Created .*DRAFT\.md/); // draftNewService
    expect(out).toMatch(/loopPosition=BUILD/); // draftApproveService
    expect(out).toMatch(/\$ cadence /); // each step echoes its command line
  });

  // AC-3: the sandbox is removed and the user's cwd is never scaffolded.
  it('AC-3: cleans up its temp sandbox and never touches the cwd', async () => {
    const before = await sandboxCount();
    const cwdCadenceBefore = existsSync(join(process.cwd(), '.cadence'));
    const io = bufferIO();
    const res = await runTutorial({ noPause: true }, io);
    expect(await sandboxCount()).toBe(before); // no leftover sandbox
    // cwd's .cadence presence is unchanged by the run (tutorial uses its own dir):
    expect(existsSync(join(process.cwd(), '.cadence'))).toBe(cwdCadenceBefore);
    const data = res.data as { sandbox?: string };
    expect(data.sandbox).toMatch(/cadence-tutorial-/);
    expect(data.sandbox?.startsWith(tmpdir())).toBe(true);
  });

  // AC-3 (failure path): a throw mid-run still removes the sandbox.
  it('AC-3: removes the sandbox even when a step throws', async () => {
    const before = await sandboxCount();
    const io = bufferIO();
    // Inject a step that throws after the sandbox is created.
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

  // AC-4: non-interactive (noPause / non-TTY) advances without blocking.
  it('AC-4: --no-pause runs to completion without prompting', async () => {
    const io = bufferIO();
    const res = await runTutorial({ noPause: true }, io);
    // Reaching here without a hang is the assertion; confirm it finished.
    expect(res.exitCode).toBe(0);
  });

  // AC-5: completes offline/deterministically with no API key set.
  it('AC-5: completes with no ANTHROPIC_API_KEY (offline mock path)', async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    const io = bufferIO();
    const res = await runTutorial({ noPause: true }, io);
    expect(res.exitCode).toBe(0);
  });
});
