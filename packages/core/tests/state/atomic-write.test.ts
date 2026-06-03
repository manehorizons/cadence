import { describe, it, expect, afterEach } from 'vitest';
import { readFile } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  atomicWriteJSON,
  renameWithRetry,
  renameBackoffBudgetMs,
} from '../../src/state/atomic-write.js';

const readFileP = promisify(readFile);
let active: Fixture | null = null;
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

describe('atomicWriteJSON', () => {
  it('writes JSON to the target path', async () => {
    active = await tempRepo();
    const path = join(active.root, 'a.json');
    await atomicWriteJSON(path, { x: 1 });
    const contents = await readFileP(path, 'utf8');
    expect(JSON.parse(contents)).toEqual({ x: 1 });
  });

  it('leaves no temp file after successful rename', async () => {
    active = await tempRepo();
    const path = join(active.root, 'a.json');
    await atomicWriteJSON(path, { x: 1 });
    const leftover = (await readdir(active.root)).filter((f) =>
      f.endsWith('.tmp'),
    );
    expect(leftover).toEqual([]);
  });
});

describe('renameWithRetry (Windows transient-handle resilience)', () => {
  function flakyRename(failCode: string, failTimes: number) {
    let calls = 0;
    const rename = async (): Promise<void> => {
      calls += 1;
      if (calls <= failTimes) {
        const err = new Error(`transient ${failCode}`) as NodeJS.ErrnoException;
        err.code = failCode;
        throw err;
      }
    };
    return { rename, calls: () => calls };
  }

  it('retries a transient EPERM until it clears, then resolves (AC-2)', async () => {
    const f = flakyRename('EPERM', 2);
    await expect(
      renameWithRetry('a.tmp', 'a', { rename: f.rename, backoffMs: 0 }),
    ).resolves.toBeUndefined();
    expect(f.calls()).toBe(3);
  });

  it('rethrows a non-retryable error on the first attempt', async () => {
    const f = flakyRename('ENOENT', 5);
    await expect(
      renameWithRetry('a.tmp', 'a', { rename: f.rename, backoffMs: 0 }),
    ).rejects.toThrow(/ENOENT/);
    expect(f.calls()).toBe(1);
  });

  it('gives the OS at least 500ms of cumulative backoff headroom', () => {
    expect(renameBackoffBudgetMs()).toBeGreaterThanOrEqual(500);
  });
});
