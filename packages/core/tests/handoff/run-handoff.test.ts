// packages/core/tests/handoff/run-handoff.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { SimpleStateBackend } from '../../src/state/simple.js';
import { runHandoff } from '../../src/handoff/run-handoff.js';

const NOW = new Date('2026-06-03T14:02:00.000Z');
let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('runHandoff', () => {
  it('AC-13: writes a SESSION doc with the date+label filename and pre-filled facts', async () => {
    active = await tempRepo({ initialized: true });
    const res = await runHandoff(active.root, { label: 'demo' }, NOW);
    expect(res.path.endsWith('SESSION-2026-06-03-demo.md')).toBe(true);
    const doc = await readFile(res.path, 'utf8');
    expect(doc).toMatch(/^loop_position: IDLE$/m);
    expect(doc).toMatch(/## TL;DR for the next session/);
  });

  it('AC-14: stamps state.session.lastHandoff by default', async () => {
    active = await tempRepo({ initialized: true });
    const res = await runHandoff(active.root, {}, NOW);
    expect(res.stamped).toBe(true);
    const state = await new SimpleStateBackend(active.root).readState();
    expect(state.session.lastHandoff).toBe('SESSION-2026-06-03.md');
  });

  it('AC-15: --no-stamp leaves state.json untouched', async () => {
    active = await tempRepo({ initialized: true });
    const before = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    const res = await runHandoff(active.root, { noStamp: true }, NOW);
    expect(res.stamped).toBe(false);
    const after = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    expect(after).toBe(before);
  });

  it('AC-16: refuses to clobber an existing file unless force', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    await expect(runHandoff(active.root, { label: 'demo' }, NOW)).rejects.toThrow(/already exists/);
    const res = await runHandoff(active.root, { label: 'demo', force: true }, NOW);
    expect(res.path.endsWith('SESSION-2026-06-03-demo.md')).toBe(true);
  });

  it('AC-17: refreshes the intelligence context packet as a side effect', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, {}, NOW);
    const packet = await readFile(
      join(active.root, '.cadence', 'intelligence', 'context', 'handoff.json'), 'utf8');
    expect(JSON.parse(packet).scope).toBe('handoff');
  });
});
