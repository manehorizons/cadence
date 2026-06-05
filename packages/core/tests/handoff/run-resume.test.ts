// packages/core/tests/handoff/run-resume.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { runHandoff } from '../../src/handoff/run-handoff.js';
import { runResume } from '../../src/handoff/run-resume.js';
import { SimpleStateBackend } from '../../src/state/simple.js';

const NOW = new Date('2026-06-03T14:02:00.000Z');
let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('runResume', () => {
  it('AC-18: returns { found: false } when there is no handoff', async () => {
    active = await tempRepo({ initialized: true });
    const res = await runResume(active.root);
    expect(res.found).toBe(false);
  });

  it('AC-19: --full replays the whole doc with a fresh live context packet', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    const res = await runResume(active.root, { mode: 'full' });
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.mode).toBe('full');
      expect(res.doc).toMatch(/# Session Handoff/);
      expect(res.context?.scope).toBe('handoff');
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

  it('AC-21: defaults to brief output (no context recompute) with no drift', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    const res = await runResume(active.root);
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.mode).toBe('brief');
      expect(res.context).toBeNull();
      expect(res.doc).toContain('## Next action');
      expect(res.doc).not.toContain('## CADENCE context');
    }
  });

  it('AC-22: auto-promotes to full output when live state has drifted', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    const backend = new SimpleStateBackend(active.root);
    const state = await backend.readState();
    // The fixture starts IDLE; move to any other position to diverge from the
    // handoff doc's captured loop_position and trigger drift.
    const moved = state.loopPosition === 'IDLE' ? 'BUILD' : 'IDLE';
    await backend.commit({ ...state, loopPosition: moved as typeof state.loopPosition });
    const res = await runResume(active.root);
    expect(res.found).toBe(true);
    if (res.found) {
      expect(res.mode).toBe('full');
      expect(res.drift).not.toBeNull();
      expect(res.context?.scope).toBe('handoff');
      expect(res.doc).toMatch(/# Session Handoff/);
    }
  });

  it('AC-23: explicit mode overrides the drift heuristic', async () => {
    active = await tempRepo({ initialized: true });
    await runHandoff(active.root, { label: 'demo' }, NOW);
    const full = await runResume(active.root, { mode: 'full' });
    expect(full.found).toBe(true);
    if (full.found) {
      expect(full.mode).toBe('full');
      expect(full.context?.scope).toBe('handoff');
    }
    const brief = await runResume(active.root, { mode: 'brief' });
    expect(brief.found).toBe(true);
    if (brief.found) {
      expect(brief.mode).toBe('brief');
      expect(brief.context).toBeNull();
    }
  });
});
