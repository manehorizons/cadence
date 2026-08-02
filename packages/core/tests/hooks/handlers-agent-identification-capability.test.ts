import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import type { HostCapabilities } from '@thomas-powers-jr/cadence-types';
import { HookDispatcher } from '../../src/hooks/dispatcher.js';

// AC-3 (phase 222): core must actually consult HostCapabilities before
// relying on ctx.agentId/ctx.agentType. A host that declares
// `agentIdentification: false` (e.g. Codex — its extractPayload never
// populates agent_id/agent_type, unlike Claude Code's) must cause core to
// notice loudly on stderr instead of silently behaving as if there were no
// subagent involved at all.

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

/** Capture stderr lines while running `fn`. */
async function captureStderr(fn: () => Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const spy = vi
    .spyOn(process.stderr, 'write')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockImplementation(((chunk: any) => {
      lines.push(String(chunk));
      return true;
    }) as typeof process.stderr.write);
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return lines;
}

const capabilitiesWithoutAgentIdentification: HostCapabilities = {
  hooks: ['session-start', 'user-prompt', 'pre-tool-edit', 'post-tool-edit', 'session-stop', 'subagent-result'],
  slashCommands: true,
  skillSystem: 'prompted',
  blockingHooks: ['pre-tool-edit', 'session-stop'],
  subagentSpawn: 'native',
  streamingOutput: true,
  agentIdentification: false,
};

const capabilitiesWithAgentIdentification: HostCapabilities = {
  ...capabilitiesWithoutAgentIdentification,
  agentIdentification: true,
};

async function seedBaseline(root: string, agentId: string): Promise<void> {
  const statePath = join(root, '.cadence/state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.session.subagentBaselines[agentId] = {
    startedAt: '2026-07-06T00:00:00.000Z',
    taskStatuses: { T1: 'DONE' },
    touchedFiles: [],
  };
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

describe('AC-3: core notices loudly when a host lacks agentIdentification (handleSubagentResult)', () => {
  it('prints a stderr notice when ctx.agentId is absent and the host declares agentIdentification=false', async () => {
    active = await tempRepo({ initialized: true });
    const dispatcher = new HookDispatcher(active.root);
    let result: { ok: boolean } = { ok: false };
    const lines = await captureStderr(async () => {
      result = await dispatcher.dispatch('subagent-result', {
        event: 'subagent-result',
        cwd: active!.root,
        raw: { hostCapabilities: capabilitiesWithoutAgentIdentification },
      });
    });
    expect(result.ok).toBe(true);
    expect(lines.some((l) => l.includes('agentIdentification'))).toBe(true);
    // Existing telemetry behavior must be unaffected by the notice.
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentSpawns).toBe(1);
  });

  it('does NOT print a notice when ctx.agentId is absent and the host declares no capabilities at all (legacy/unknown host — no false positive)', async () => {
    active = await tempRepo({ initialized: true });
    const dispatcher = new HookDispatcher(active.root);
    const lines = await captureStderr(async () => {
      await dispatcher.dispatch('subagent-result', {
        event: 'subagent-result',
        cwd: active!.root,
      });
    });
    expect(lines.some((l) => l.includes('agentIdentification'))).toBe(false);
  });

  it('does NOT print a notice when ctx.agentId is present (host supplied it despite the declared gap — nothing to warn about)', async () => {
    active = await tempRepo({ initialized: true });
    await seedBaseline(active.root, 'agent-1');
    const dispatcher = new HookDispatcher(active.root);
    const lines = await captureStderr(async () => {
      await dispatcher.dispatch('subagent-result', {
        event: 'subagent-result',
        cwd: active!.root,
        agentId: 'agent-1',
        raw: { hostCapabilities: capabilitiesWithoutAgentIdentification },
      });
    });
    expect(lines.some((l) => l.includes('agentIdentification'))).toBe(false);
  });

  it('does NOT print a notice when the host declares agentIdentification=true', async () => {
    active = await tempRepo({ initialized: true });
    const dispatcher = new HookDispatcher(active.root);
    const lines = await captureStderr(async () => {
      await dispatcher.dispatch('subagent-result', {
        event: 'subagent-result',
        cwd: active!.root,
        raw: { hostCapabilities: capabilitiesWithAgentIdentification },
      });
    });
    expect(lines.some((l) => l.includes('agentIdentification'))).toBe(false);
  });
});

describe('AC-3: core notices loudly when a host lacks agentIdentification (handleSubagentStart)', () => {
  it('prints a stderr notice when ctx.agentId is absent and the host declares agentIdentification=false, and still fails open (no baseline, ok:true)', async () => {
    active = await tempRepo({ initialized: true });
    const dispatcher = new HookDispatcher(active.root);
    let result: { ok: boolean } = { ok: false };
    const lines = await captureStderr(async () => {
      result = await dispatcher.dispatch('subagent-start', {
        event: 'subagent-start',
        cwd: active!.root,
        raw: { hostCapabilities: capabilitiesWithoutAgentIdentification },
      });
    });
    expect(result.ok).toBe(true);
    expect(lines.some((l) => l.includes('agentIdentification'))).toBe(true);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentBaselines).toEqual({});
  });

  it('does NOT print a notice when ctx.agentId is absent and no capabilities are declared', async () => {
    active = await tempRepo({ initialized: true });
    const dispatcher = new HookDispatcher(active.root);
    const lines = await captureStderr(async () => {
      await dispatcher.dispatch('subagent-start', {
        event: 'subagent-start',
        cwd: active!.root,
      });
    });
    expect(lines.some((l) => l.includes('agentIdentification'))).toBe(false);
  });
});
