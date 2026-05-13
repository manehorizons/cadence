import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@keel/testkit';
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

  it('pre-tool-edit blocks when buildGate=true and loopPosition != BUILD', async () => {
    active = await tempRepo({ initialized: true });
    const cfgPath = join(active.root, '.keel/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.hooks.preToolUseBuildGate = true;
    await writeFile(cfgPath, JSON.stringify(cfg));
    const d = new HookDispatcher(active.root);
    const r = await d.dispatch('pre-tool-edit', { cwd: active.root, event: 'pre-tool-edit' });
    expect(r.ok).toBe(false);
    expect(r.blockMessage).toMatch(/BUILD/);
  });
});
