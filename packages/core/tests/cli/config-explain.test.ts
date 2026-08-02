import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { bufferIO } from '../../src/services/io.js';
import { runConfigExplain } from '../../src/cli/commands/config.js';
import { NotInitializedError } from '../../src/errors.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence config explain (AC-3)', () => {
  // AC-3: the curated default renders gates + the doctor pointer, exit 0.
  it('AC-3: default renders the curated explanation', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    const res = await runConfigExplain(active.root, {}, io);
    expect(res.exitCode).toBe(0);
    const out = io.stdout();
    for (const tier of ['quick-fix', 'standard', 'complex']) expect(out).toContain(tier);
    expect(out).toContain('cadence doctor');
  });

  // AC-3: a known field deep-dives that block only.
  it('AC-3: a known field renders only that block', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    const res = await runConfigExplain(active.root, { field: 'verifier' }, io);
    expect(res.exitCode).toBe(0);
    expect(io.stdout()).toContain('verifier');
    expect(io.stdout()).not.toContain('loopEnforcement');
  });

  // AC-3: an unknown field nudges on stderr and exits non-zero.
  it('AC-3: an unknown field gives a did-you-mean nudge and non-zero exit', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    const res = await runConfigExplain(active.root, { field: 'verifer' }, io);
    expect(res.exitCode).not.toBe(0);
    expect(io.stderr()).toMatch(/did you mean.*verifier/i);
  });

  // AC-3: --all dumps every key.
  it('AC-3: --all renders every config key', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    await runConfigExplain(active.root, { all: true }, io);
    for (const key of ['subagentPolicy', 'notify', 'verifier', 'handoff']) {
      expect(io.stdout()).toContain(key);
    }
  });

  // AC-3: --json emits the structured explanation.
  it('AC-3: --json emits parseable structured output', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    const res = await runConfigExplain(active.root, { json: true }, io);
    expect(res.exitCode).toBe(0);
    const parsed = JSON.parse(io.stdout());
    expect(parsed.profile).toBeDefined();
    expect(Array.isArray(parsed.tiers)).toBe(true);
    expect(parsed.tiers.length).toBe(3);
  });

  // AC-3: an uninitialized repo surfaces the standard NotInitializedError.
  it('AC-3: uninitialized repo throws NotInitializedError', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    await expect(runConfigExplain(join(active.root, 'uninit'), {}, io)).rejects.toBeInstanceOf(
      NotInitializedError,
    );
  });
});
