// packages/core/tests/handoff/run-handoff.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultConfig } from '@manehorizons/cadence-types';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { SimpleStateBackend } from '../../src/state/simple.js';
import { runHandoff, runHandoffCheck } from '../../src/handoff/run-handoff.js';

const NOW = new Date('2026-06-03T14:02:00.000Z');
// Newer than the seeded SESSION docs below, so the just-written doc is the newest.
const NOW_LATEST = new Date('2026-06-09T09:00:00.000Z');

async function seedHandoffDocs(root: string, names: string[]): Promise<string> {
  const dir = join(root, '.cadence', 'handoff');
  await mkdir(dir, { recursive: true });
  for (const n of names) await writeFile(join(dir, n), '# seeded\n');
  return dir;
}

async function enableRetention(root: string, retain: number): Promise<void> {
  await writeFile(
    join(root, '.cadence', 'config.json'),
    JSON.stringify({ ...defaultConfig, handoff: { retain } }, null, 2),
  );
}
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

  it('AC-3: prunes oldest SESSION docs beyond retain, keeping the just-written doc', async () => {
    active = await tempRepo({ initialized: true });
    const dir = await seedHandoffDocs(active.root, [
      'SESSION-2026-06-05.md',
      'SESSION-2026-06-06.md',
      'SESSION-2026-06-07.md',
    ]);
    await enableRetention(active.root, 2);

    const res = await runHandoff(active.root, {}, NOW_LATEST);

    // new doc is newest; retain=2 keeps {09, 07}; prunes {06, 05}.
    expect(res.pruned.sort()).toEqual(['SESSION-2026-06-05.md', 'SESSION-2026-06-06.md']);
    expect(existsSync(join(dir, 'SESSION-2026-06-05.md'))).toBe(false);
    expect(existsSync(join(dir, 'SESSION-2026-06-06.md'))).toBe(false);
    expect(existsSync(join(dir, 'SESSION-2026-06-07.md'))).toBe(true);
    expect(existsSync(res.path)).toBe(true); // the just-written lastHandoff survives
  });

  it('AC-3: prunes nothing when handoff.retain is unset', async () => {
    active = await tempRepo({ initialized: true });
    const dir = await seedHandoffDocs(active.root, [
      'SESSION-2026-06-05.md',
      'SESSION-2026-06-06.md',
      'SESSION-2026-06-07.md',
    ]);

    const res = await runHandoff(active.root, {}, NOW_LATEST);

    expect(res.pruned).toEqual([]);
    for (const n of ['SESSION-2026-06-05.md', 'SESSION-2026-06-06.md', 'SESSION-2026-06-07.md']) {
      expect(existsSync(join(dir, n))).toBe(true);
    }
  });

  it('AC-4: a prune failure never fails the handoff', async () => {
    active = await tempRepo({ initialized: true });
    await seedHandoffDocs(active.root, ['SESSION-2026-06-05.md', 'SESSION-2026-06-06.md']);
    await enableRetention(active.root, 1);

    const res = await runHandoff(active.root, {}, NOW_LATEST, {
      prune: async () => {
        throw new Error('boom');
      },
    });

    expect(res.stamped).toBe(true);
    expect(existsSync(res.path)).toBe(true);
    expect(res.pruned).toEqual([]); // error swallowed → no pruned report
  });

  it('AC-5: runHandoffCheck reports unfilled sections of the freshest doc', async () => {
    active = await tempRepo({ initialized: true });
    const res = await runHandoff(active.root, {}, new Date('2026-01-02T03:04:05Z'));
    const check = await runHandoffCheck(active.root);
    expect(check.path).toBe(res.path);
    expect(check.unfilled).toContain('Next action');
  });
});
