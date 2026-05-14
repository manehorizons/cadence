import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { emptyState } from '@cadence/types';
import { SimpleStateBackend } from '../../src/state/simple.js';
import { StateCorruptError } from '../../src/errors.js';

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('SimpleStateBackend', () => {
  it('reads an initialized state', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const backend = new SimpleStateBackend(active.root);
    const state = await backend.readState();
    expect(state.project.name).toBe('demo');
    expect(state.loopPosition).toBe('IDLE');
  });

  it('round-trips writeState → readState', async () => {
    active = await tempRepo({ initialized: true });
    const backend = new SimpleStateBackend(active.root);
    const s = emptyState('zz');
    s.loopPosition = 'DRAFT';
    s.activeDraft = '01-01';
    await backend.writeState(s);
    const after = await backend.readState();
    expect(after.loopPosition).toBe('DRAFT');
    expect(after.activeDraft).toBe('01-01');
  });

  it('throws StateCorruptError on invalid JSON', async () => {
    active = await tempRepo({ initialized: true });
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(active.root, '.cadence/state.json'), '{ not json');
    const backend = new SimpleStateBackend(active.root);
    await expect(backend.readState()).rejects.toBeInstanceOf(StateCorruptError);
  });
});
