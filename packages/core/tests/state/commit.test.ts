import { describe, it, expect } from 'vitest';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';
import { SimpleStateBackend } from '../../src/state/simple.js';
import { renderStateMd } from '../../src/render/state-md.js';
import { CadenceStateZ } from '@cadence/types';

let active: Fixture | null = null;

describe('SimpleStateBackend.commit (Phase 41.1)', () => {
  it('writes state.json AND STATE.md together, STATE.md matching renderStateMd', async () => {
    active = await tempRepo({ initialized: true });
    const backend = new SimpleStateBackend(active.root);
    const state = await backend.readState();
    state.session.subagentSpawns = 7;
    state.skillAudit.invoked = ['superpowers:tdd'];

    await backend.commit(state);

    const dir = join(active.root, '.cadence');
    const json = CadenceStateZ.parse(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')));
    expect(json.session.subagentSpawns).toBe(7);
    expect(json.skillAudit.invoked).toEqual(['superpowers:tdd']);

    const md = await readFile(join(dir, 'STATE.md'), 'utf8');
    expect(md).toBe(renderStateMd(state));
    // STATE.md reflects the committed state (no stale view).
    expect(md).toContain('Subagent spawns this session: 7');
    expect(md).toContain('Invoked: superpowers:tdd');

    await active.cleanup();
    active = null;
  });

  it('creates the .cadence dir when missing before writing both artefacts', async () => {
    active = await tempRepo({ initialized: true });
    // A backend rooted at a fresh subdir with no .cadence yet.
    const sub = join(active.root, 'nested');
    await mkdir(sub, { recursive: true });
    const backend = new SimpleStateBackend(sub);
    const seed = await new SimpleStateBackend(active.root).readState();

    await backend.commit(seed);

    const dir = join(sub, '.cadence');
    expect(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')).project.name).toBe(seed.project.name);
    expect(await readFile(join(dir, 'STATE.md'), 'utf8')).toBe(renderStateMd(seed));

    await active.cleanup();
    active = null;
  });
});
