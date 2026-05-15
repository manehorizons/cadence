import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@cadence/testkit';

// AC-3, AC-4, AC-5 (Phase 23.3) — loop-violation anomaly emission.

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

async function enableFileTransport(root: string): Promise<string> {
  const cfgPath = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  const logPath = join(root, '.cadence/anomalies.log');
  cfg.notify = { transport: 'file', file: logPath };
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
  return logPath;
}

async function readEvents(path: string): Promise<Array<{ type: string; severity: string; context: Record<string, unknown> }>> {
  if (!existsSync(path)) return [];
  const raw = await readFile(path, 'utf8');
  return raw.split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l));
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('loop-violation anomaly emission', () => {
  it('cadence settle run from IDLE → loop-violation event (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    const logPath = await enableFileTransport(active.root);
    // State is IDLE by default — settle should throw LoopViolationError.
    const r = await run(['settle', 'run', '--auto', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/settle run requires loopPosition=BUILD/);
    const events = await readEvents(logPath);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('loop-violation');
    expect(events[0]!.severity).toBe('error');
    expect(events[0]!.context.expected).toBe('BUILD');
    expect(events[0]!.context.actual).toBe('IDLE');
    expect(events[0]!.context.source).toBe('settle.run');
  });

  it('cadence build task from IDLE → loop-violation event (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    const logPath = await enableFileTransport(active.root);
    const r = await run(['build', 'task', 'T1', '--status=DONE'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/task outcome can only be recorded while loopPosition=BUILD/);
    const events = await readEvents(logPath);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('loop-violation');
    expect(events[0]!.context.source).toBe('build.task');
  });

  it('cadence done shortcut from IDLE → loop-violation event with source=build.done (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    const logPath = await enableFileTransport(active.root);
    const r = await run(['done', 'T1', '--notes=x'], active.root);
    expect(r.code).toBe(1);
    const events = await readEvents(logPath);
    expect(events).toHaveLength(1);
    expect(events[0]!.context.source).toBe('build.done');
  });

  it('cadence block shortcut from IDLE → source=build.block (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    const logPath = await enableFileTransport(active.root);
    const r = await run(['block', 'T1', '--notes=x'], active.root);
    expect(r.code).toBe(1);
    const events = await readEvents(logPath);
    expect(events).toHaveLength(1);
    expect(events[0]!.context.source).toBe('build.block');
  });

  it('cadence needs-context shortcut from IDLE → source=build.needs-context (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    const logPath = await enableFileTransport(active.root);
    const r = await run(['needs-context', 'T1', '--notes=x'], active.root);
    expect(r.code).toBe(1);
    const events = await readEvents(logPath);
    expect(events).toHaveLength(1);
    expect(events[0]!.context.source).toBe('build.needs-context');
  });

  // AC-5 — gate-absent
  it('strict profile (no anomaly-notify gate) → no event but exit 1 (AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    const cfgPath = join(active.root, '.cadence/config.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    cfg.profile = 'strict';
    const logPath = join(active.root, '.cadence/anomalies.log');
    cfg.notify = { transport: 'file', file: logPath };
    await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
    const r = await run(['settle', 'run', '--auto', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/settle run requires loopPosition=BUILD/);
    expect(existsSync(logPath)).toBe(false);
  });

  // AC-5 — best-effort emission swallows config-load failures
  it('missing config.json → still exits 1, no crash (AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    await rm(join(active.root, '.cadence/config.json'), { force: true });
    const r = await run(['settle', 'run', '--auto', '--allow-missing-coverage'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/settle run requires loopPosition=BUILD/);
  });
});
