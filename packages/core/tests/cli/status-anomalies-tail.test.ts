import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFile, appendFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import type { AnomalyEvent } from '@manehorizons/cadence-types';
import {
  parseAnomalyLines,
  tailSelect,
} from '../../src/cli/commands/status.js';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

const ev = (
  o: Partial<{ type: string; severity: string; message: string; ts: string }> = {},
) =>
  JSON.stringify({
    type: o.type ?? 'ac-blocked',
    severity: o.severity ?? 'warn',
    message: o.message ?? 'msg',
    context: {},
    ts: o.ts ?? '2026-05-14T22:30:00.000Z',
  });

async function seedLog(root: string, lines: string[]): Promise<void> {
  await mkdir(join(root, '.cadence'), { recursive: true });
  await writeFile(
    join(root, '.cadence/anomalies.log'),
    lines.join('\n') + (lines.length > 0 ? '\n' : ''),
  );
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const mkEvent = (message: string, ts: string): AnomalyEvent => ({
  type: 'ac-blocked',
  severity: 'warn',
  message,
  context: {},
  ts,
});

describe('tailSelect / parseAnomalyLines (unit)', () => {
  it('tailSelect returns the last N in chronological order', () => {
    const evs = ['a', 'b', 'c', 'd'].map((m, i) =>
      mkEvent(m, `2026-05-14T2${i}:00:00.000Z`),
    );
    expect(tailSelect(evs, 2).map((e) => e.message)).toEqual(['c', 'd']);
    expect(tailSelect(evs, 99).map((e) => e.message)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
    expect(tailSelect(evs, 0)).toEqual([]);
  });

  it('parseAnomalyLines skips + counts bad lines', () => {
    const raw =
      ev({ message: 'ok' }) +
      '\n' +
      'not-json\n' +
      '{"type":"ac-blocked"}\n';
    const { events, bad } = parseAnomalyLines(raw);
    expect(events).toHaveLength(1);
    expect(events[0]!.message).toBe('ok');
    expect(bad).toBe(2);
  });
});

describe('cadence status anomalies --tail / --follow', () => {
  it('AC-1: --tail prints last N oldest→newest', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ message: 'oldest', ts: '2026-05-14T20:00:00.000Z' }),
      ev({ message: 'middle', ts: '2026-05-14T21:00:00.000Z' }),
      ev({ message: 'newest', ts: '2026-05-14T22:00:00.000Z' }),
    ]);
    const r = await run(
      ['status', 'anomalies', '--tail', '--limit', '2'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('oldest');
    const midIdx = r.stdout.indexOf('middle');
    const newIdx = r.stdout.indexOf('newest');
    expect(midIdx).toBeGreaterThan(-1);
    expect(newIdx).toBeGreaterThan(midIdx); // chronological
  });

  it('regression: without --tail, still newest-first', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ message: 'older', ts: '2026-05-14T20:00:00.000Z' }),
      ev({ message: 'newer', ts: '2026-05-14T23:00:00.000Z' }),
    ]);
    const r = await run(['status', 'anomalies'], active.root);
    expect(r.stdout.indexOf('older')).toBeGreaterThan(
      r.stdout.indexOf('newer'),
    );
  });

  it('AC-5: --follow on non-TTY falls back with a note, exit 0', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [ev({ message: 'one' })]);
    const r = await run(
      ['status', 'anomalies', '--tail', '--follow'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('one');
    expect(r.stderr).toMatch(/--follow needs a TTY/);
  });

  it('AC-2/3/4: --follow streams matching appends then exits 0 on stop', async () => {
    active = await tempRepo({ initialized: true });
    const logPath = join(active.root, '.cadence/anomalies.log');
    await seedLog(active.root, [ev({ message: 'initial' })]);

    const p: ChildProcess = spawn(
      process.execPath,
      [
        CADENCE_CLI,
        'status',
        'anomalies',
        '--tail',
        '--follow',
        '--type',
        'ac-blocked',
      ],
      {
        cwd: active.root,
        env: {
          ...process.env,
          CADENCE_FORCE_FOLLOW: '1',
          CADENCE_FOLLOW_STOP_AFTER_MS: '1600',
        },
      },
    );
    let out = '';
    let err = '';
    p.stdout!.on('data', (d) => (out += d.toString()));
    p.stderr!.on('data', (d) => (err += d.toString()));

    const exited = new Promise<number>((resolve) =>
      p.on('exit', (c) => resolve(c ?? 0)),
    );

    // Let the initial tail print, then append a matching + non-matching event.
    await new Promise((r) => setTimeout(r, 500));
    await appendFile(
      logPath,
      ev({ type: 'ac-blocked', message: 'STREAMED-MATCH' }) + '\n',
    );
    await appendFile(
      logPath,
      ev({ type: 'force-used', message: 'STREAMED-SKIP' }) + '\n',
    );

    const code = await exited;
    expect(code).toBe(0);
    expect(out).toContain('initial'); // initial tail
    expect(out).toContain('STREAMED-MATCH'); // streamed, type matches
    expect(out).not.toContain('STREAMED-SKIP'); // filtered by --type
    expect(err).not.toMatch(/--follow needs a TTY/);
  });
});
