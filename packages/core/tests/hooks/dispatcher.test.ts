import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { HookDispatcher } from '../../src/hooks/dispatcher.js';
import { SimpleStateBackend } from '../../src/state/simple.js';

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('HookDispatcher', () => {
  it('session-start returns a context payload', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const d = new HookDispatcher(active.root);
    const result = await d.dispatch('session-start', { cwd: active.root, event: 'session-start' });
    expect(result.ok).toBe(true);
    expect(result.contextPayload).toMatch(/demo/);
  });

  it('subagent-result increments state.session.subagentSpawns', async () => {
    active = await tempRepo({ initialized: true });
    const d = new HookDispatcher(active.root);
    await d.dispatch('subagent-result', { cwd: active.root, event: 'subagent-result' });
    await d.dispatch('subagent-result', { cwd: active.root, event: 'subagent-result' });
    const state = await new SimpleStateBackend(active.root).readState();
    expect(state.session.subagentSpawns).toBe(2);
  });

  // Task 7 (Phase 158) — SubagentStart wiring.
  it('routes subagent-start to handleSubagentStart (does not throw, returns ok)', async () => {
    active = await tempRepo({ initialized: true });
    const d = new HookDispatcher(active.root);
    const result = await d.dispatch('subagent-start', { cwd: active.root, event: 'subagent-start' });
    expect(result.ok).toBe(true);
  });

  it('pre-tool-edit blocks when buildGate=true and loopPosition != BUILD', async () => {
    active = await tempRepo({ initialized: true });
    const cfgPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.hooks.preToolUseBuildGate = true;
    await writeFile(cfgPath, JSON.stringify(cfg));
    const d = new HookDispatcher(active.root);
    const r = await d.dispatch('pre-tool-edit', { cwd: active.root, event: 'pre-tool-edit' });
    expect(r.ok).toBe(false);
    expect(r.blockMessage).toMatch(/BUILD/);
  });

  // AC-3, AC-4 (Phase 23.4) — skill-invoke handler
  it('skill-invoke appends ctx.raw.skill to state.skillAudit.invoked', async () => {
    active = await tempRepo({ initialized: true });
    const d = new HookDispatcher(active.root);
    await d.dispatch('skill-invoke', {
      cwd: active.root,
      event: 'skill-invoke',
      raw: { skill: 'using-superpowers' },
    });
    const state = await new SimpleStateBackend(active.root).readState();
    expect(state.skillAudit.invoked).toEqual(['using-superpowers']);
  });

  it('skill-invoke dedups: invoking the same skill twice → still one entry', async () => {
    active = await tempRepo({ initialized: true });
    const d = new HookDispatcher(active.root);
    await d.dispatch('skill-invoke', { cwd: active.root, event: 'skill-invoke', raw: { skill: 'foo' } });
    await d.dispatch('skill-invoke', { cwd: active.root, event: 'skill-invoke', raw: { skill: 'foo' } });
    const state = await new SimpleStateBackend(active.root).readState();
    expect(state.skillAudit.invoked).toEqual(['foo']);
  });

  it('skill-invoke no-ops when telemetry.skillInvocations=false', async () => {
    active = await tempRepo({ initialized: true });
    const cfgPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.telemetry.skillInvocations = false;
    await writeFile(cfgPath, JSON.stringify(cfg));
    const d = new HookDispatcher(active.root);
    await d.dispatch('skill-invoke', {
      cwd: active.root,
      event: 'skill-invoke',
      raw: { skill: 'using-superpowers' },
    });
    const state = await new SimpleStateBackend(active.root).readState();
    expect(state.skillAudit.invoked).toEqual([]);
  });

  it('skill-invoke no-ops when ctx.raw.skill is missing or non-string', async () => {
    active = await tempRepo({ initialized: true });
    const d = new HookDispatcher(active.root);
    await d.dispatch('skill-invoke', { cwd: active.root, event: 'skill-invoke' });
    await d.dispatch('skill-invoke', { cwd: active.root, event: 'skill-invoke', raw: { skill: 123 } });
    const state = await new SimpleStateBackend(active.root).readState();
    expect(state.skillAudit.invoked).toEqual([]);
  });

  it('skill-invoke caps at 100 entries with FIFO drop', async () => {
    active = await tempRepo({ initialized: true });
    const d = new HookDispatcher(active.root);
    // Push 105 unique skills; first 5 should fall off the front.
    for (let i = 0; i < 105; i++) {
      await d.dispatch('skill-invoke', { cwd: active.root, event: 'skill-invoke', raw: { skill: `skill-${i}` } });
    }
    const state = await new SimpleStateBackend(active.root).readState();
    expect(state.skillAudit.invoked).toHaveLength(100);
    expect(state.skillAudit.invoked[0]).toBe('skill-5');
    expect(state.skillAudit.invoked[99]).toBe('skill-104');
  });
});
