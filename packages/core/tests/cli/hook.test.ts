import { describe, it, expect, afterEach, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { Command } from 'commander';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

// Subagent task-redundancy monitoring (Task 6): the `cadence hook` CLI
// command promotes `agentId`/`agentType` from the parsed stdin JSON onto the
// `HookContext` passed to `HookDispatcher.dispatch`. Every other test in this
// file drives the real, built CLI binary as a subprocess and asserts on its
// externally observable effects (stdout/exit code/state.json) — but no
// handler yet consumes `ctx.agentId`/`ctx.agentType` (that lands in later
// tasks: 8/9), so there is no black-box side effect to assert on through that
// harness. Instead, this test mocks `HookDispatcher` (from `src/`, not
// `dist/`) to inspect the actual `ctx` object the CLI command constructs and
// passes to `dispatch` — the only way to directly verify the promotion this
// task adds.
const dispatchSpy = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock('../../src/hooks/dispatcher.js', () => ({
  HookDispatcher: vi.fn().mockImplementation(() => ({ dispatch: dispatchSpy })),
}));

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.stdin.end();
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('cadence hook', () => {
  it('session-start prints a context payload', async () => {
    active = await tempRepo({ initialized: true, projectName: 'demo' });
    const r = await run(['hook', 'session-start'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/CADENCE session resumed/);
    expect(r.stdout).toMatch(/demo/);
  });

  it('subagent-result increments counter', async () => {
    active = await tempRepo({ initialized: true });
    await run(['hook', 'subagent-result'], active.root);
    await run(['hook', 'subagent-result'], active.root);
    const state = JSON.parse(await readFile(join(active.root, '.cadence/state.json'), 'utf8'));
    expect(state.session.subagentSpawns).toBe(2);
  });

  it('unknown event exits 2', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['hook', 'made-up-event'], active.root);
    expect(r.code).toBe(2);
  });

  it('blocking hook exits 2 with block message on stderr', async () => {
    active = await tempRepo({ initialized: true });
    // Enable preToolUseBuildGate; loopPosition is IDLE so pre-tool-edit must block.
    const cfgPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.hooks.preToolUseBuildGate = true;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    const r = await run(['hook', 'pre-tool-edit'], active.root);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/BUILD/);
  });
});

describe('cadence hook — agentId/agentType promotion (subagent task-redundancy monitoring)', () => {
  afterEach(() => {
    dispatchSpy.mockClear();
  });

  it('promotes agentId/agentType from stdin JSON onto the ctx passed to dispatch', async () => {
    const { registerHookCommand } = await import('../../src/cli/commands/hook.js');
    const program = new Command();
    registerHookCommand(program);

    const stdinPayload = JSON.stringify({ agentId: 'agent-123', agentType: 'general-purpose' });
    const fakeStdin = Readable.from([stdinPayload]) as unknown as NodeJS.ReadStream;
    Object.defineProperty(fakeStdin, 'isTTY', { value: false, configurable: true });
    const originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });

    try {
      await program.parseAsync(['node', 'cadence', 'hook', 'pre-tool-edit']);
    } finally {
      Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    }

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const [event, ctx] = dispatchSpy.mock.calls[0]!;
    expect(event).toBe('pre-tool-edit');
    expect(ctx.agentId).toBe('agent-123');
    expect(ctx.agentType).toBe('general-purpose');
  });

  it('omits agentId/agentType from ctx when absent from stdin JSON', async () => {
    const { registerHookCommand } = await import('../../src/cli/commands/hook.js');
    const program = new Command();
    registerHookCommand(program);

    const fakeStdin = Readable.from([JSON.stringify({ files: ['src/a.ts'] })]) as unknown as NodeJS.ReadStream;
    Object.defineProperty(fakeStdin, 'isTTY', { value: false, configurable: true });
    const originalStdin = process.stdin;
    Object.defineProperty(process, 'stdin', { value: fakeStdin, configurable: true });

    try {
      await program.parseAsync(['node', 'cadence', 'hook', 'pre-tool-edit']);
    } finally {
      Object.defineProperty(process, 'stdin', { value: originalStdin, configurable: true });
    }

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const [, ctx] = dispatchSpy.mock.calls[0]!;
    expect(ctx.agentId).toBeUndefined();
    expect(ctx.agentType).toBeUndefined();
  });
});
