// packages/core/tests/handoff/run-resume.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { runHandoff } from '../../src/handoff/run-handoff.js';
import { runResume } from '../../src/handoff/run-resume.js';

const NOW = new Date('2026-06-03T14:02:00.000Z');
let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('runResume', () => {
  it('AC-18: returns { found: false } when there is no handoff', async () => {
    active = await tempRepo({ initialized: true });
    const res = await runResume(active.root);
    expect(res.found).toBe(false);
  });

  it('AC-19: replays the freshest doc with a fresh live context packet', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    const res = await runResume(active.root);
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.doc).toMatch(/# Session Handoff/);
      expect(res.context.scope).toBe('handoff');
      expect(res.handoffPath.endsWith('SESSION-2026-06-03-demo.md')).toBe(true);
    }
  });

  it('AC-20: does not mutate state.json (read-only)', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, {}, NOW);
    const before = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    await runResume(active.root);
    const after = await readFile(join(active.root, '.cadence', 'state.json'), 'utf8');
    expect(after).toBe(before);
  });
});
