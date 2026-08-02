import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';
import { NullNotifier } from '../../src/notify/null.js';
import { StderrNotifier } from '../../src/notify/stderr.js';
import { FileNotifier } from '../../src/notify/file.js';

const evt = (over: Partial<AnomalyEvent> = {}): AnomalyEvent => ({
  type: 'force-used',
  severity: 'warn',
  message: 'placeholder',
  context: {},
  ...over,
});

describe('NullNotifier (AC-2)', () => {
  it('drops events silently', async () => {
    const n = new NullNotifier();
    await expect(n.notify([evt(), evt()])).resolves.toBeUndefined();
    expect(n.name).toBe('null');
  });
});

describe('StderrNotifier (AC-2)', () => {
  it('writes one line per event via the injected writer', async () => {
    const lines: string[] = [];
    const n = new StderrNotifier({ write: (c) => lines.push(c) });
    await n.notify([
      evt({ type: 'ac-blocked', severity: 'warn', message: 'AC-1 blocked' }),
      evt({ type: 'force-used', severity: 'error', message: 'used --force' }),
    ]);
    expect(lines).toEqual([
      'cadence anomaly [warn] ac-blocked: AC-1 blocked\n',
      'cadence anomaly [error] force-used: used --force\n',
    ]);
  });

  it('emits nothing for empty event list', async () => {
    const lines: string[] = [];
    const n = new StderrNotifier({ write: (c) => lines.push(c) });
    await n.notify([]);
    expect(lines).toHaveLength(0);
  });

  it('exposes name = "stderr"', () => {
    expect(new StderrNotifier({ write: () => undefined }).name).toBe('stderr');
  });
});

describe('FileNotifier (AC-2)', () => {
  it('appends NDJSON and creates parent dirs', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cadence-notify-'));
    const path = join(dir, 'nested', 'sub', 'anomalies.log');
    const n = new FileNotifier(path);
    await n.notify([
      evt({ type: 'verifier-failure', severity: 'error', message: 'boom' }),
      evt({ type: 'coverage-bypassed', severity: 'info', message: 'AC-2 skipped' }),
    ]);
    // append a second batch — confirms append semantics, not overwrite
    await n.notify([
      evt({ type: 'files-outside-boundary', severity: 'warn', message: 'extra.ts' }),
    ]);
    const text = await readFile(path, 'utf8');
    const lines = text.trim().split('\n');
    expect(lines).toHaveLength(3);
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed[0].type).toBe('verifier-failure');
    expect(parsed[1].type).toBe('coverage-bypassed');
    expect(parsed[2].type).toBe('files-outside-boundary');
    const s = await stat(path);
    expect(s.isFile()).toBe(true);
  });

  it('is a no-op when given an empty event list', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cadence-notify-'));
    const path = join(dir, 'anomalies.log');
    const n = new FileNotifier(path);
    await n.notify([]);
    await expect(stat(path)).rejects.toThrow();
  });

  it('exposes name = "file"', () => {
    expect(new FileNotifier('/tmp/x').name).toBe('file');
  });
});
