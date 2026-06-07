import { describe, it, expect, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { HookDispatcher } from '../../src/hooks/dispatcher.js';
import { resetLogger } from '../../src/logging/logger.js';

let active: Fixture | null = null;
afterEach(async () => {
  resetLogger();
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function setLoggingLevel(root: string, level: string): Promise<void> {
  const p = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(p, 'utf8'));
  cfg.logging = { level };
  await writeFile(p, JSON.stringify(cfg));
}

/** Capture stderr lines while running `fn` (the dispatcher reconfigures the
 *  logger from config, so we observe the real stderr sink, not a setLogger). */
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

describe('hook seam logging (AC-2, AC-4, AC-6)', () => {
  it('AC-2/AC-4: dispatch emits a seam:hook record naming the event at config debug level', async () => {
    active = await tempRepo({ initialized: true });
    await setLoggingLevel(active.root, 'debug');
    const prev = process.env.CADENCE_LOG_LEVEL;
    delete process.env.CADENCE_LOG_LEVEL;
    let lines: string[] = [];
    try {
      lines = await captureStderr(async () => {
        const d = new HookDispatcher(active!.root);
        await d.dispatch('session-start', { cwd: active!.root, event: 'session-start' });
      });
    } finally {
      if (prev !== undefined) process.env.CADENCE_LOG_LEVEL = prev;
    }
    const hookRecs = lines
      .map((l) => {
        try {
          return JSON.parse(l.trim()) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((r): r is Record<string, unknown> => r !== null && r.seam === 'hook');
    expect(hookRecs.length).toBeGreaterThanOrEqual(1);
    expect(hookRecs[0]).toMatchObject({ fields: { event: 'session-start' } });
  });

  it('AC-6: dispatch at the default silent level emits no seam:hook record', async () => {
    active = await tempRepo({ initialized: true }); // default config → logging silent
    const prev = process.env.CADENCE_LOG_LEVEL;
    delete process.env.CADENCE_LOG_LEVEL;
    let lines: string[] = [];
    try {
      lines = await captureStderr(async () => {
        const d = new HookDispatcher(active!.root);
        await d.dispatch('session-start', { cwd: active!.root, event: 'session-start' });
      });
    } finally {
      if (prev !== undefined) process.env.CADENCE_LOG_LEVEL = prev;
    }
    expect(lines.filter((l) => l.includes('"seam":"hook"'))).toHaveLength(0);
  });
});
