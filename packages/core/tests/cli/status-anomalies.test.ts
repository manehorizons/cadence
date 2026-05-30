import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

// AC-2: `cadence status anomalies` reader.

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

const ev = (overrides: Partial<{ type: string; severity: string; message: string; ts: string }> = {}) =>
  JSON.stringify({
    type: overrides.type ?? 'ac-blocked',
    severity: overrides.severity ?? 'warn',
    message: overrides.message ?? 'T1 BLOCKED (AC-1)',
    context: {},
    ts: overrides.ts ?? '2026-05-14T22:30:00.000Z',
  });

async function seedLog(root: string, lines: string[]): Promise<void> {
  const path = join(root, '.cadence/anomalies.log');
  await mkdir(join(root, '.cadence'), { recursive: true });
  await writeFile(path, lines.join('\n') + (lines.length > 0 ? '\n' : ''));
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence status anomalies', () => {
  it('reports "No anomalies recorded." when the file is missing', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['status', 'anomalies'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('No anomalies recorded.');
  });

  it('renders a table newest-first (file tail = newest)', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ message: 'older', ts: '2026-05-14T22:00:00.000Z' }),
      ev({ message: 'newer', ts: '2026-05-14T23:00:00.000Z' }),
    ]);
    const r = await run(['status', 'anomalies'], active.root);
    expect(r.code).toBe(0);
    const newerIdx = r.stdout.indexOf('newer');
    const olderIdx = r.stdout.indexOf('older');
    expect(newerIdx).toBeGreaterThan(-1);
    expect(olderIdx).toBeGreaterThan(newerIdx);
  });

  it('honors --type filter', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ type: 'ac-blocked', message: 'is-ac' }),
      ev({ type: 'files-outside-boundary', message: 'is-fob' }),
    ]);
    const r = await run(
      ['status', 'anomalies', '--type', 'files-outside-boundary'],
      active.root,
    );
    expect(r.stdout).toContain('is-fob');
    expect(r.stdout).not.toContain('is-ac');
  });

  it('rejects unknown --type with exit 1', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [ev()]);
    const r = await run(['status', 'anomalies', '--type', 'bogus'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('invalid --type');
  });

  it('honors --limit truncation (newest-first)', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ message: 'oldest' }),
      ev({ message: 'middle' }),
      ev({ message: 'newest' }),
    ]);
    const r = await run(['status', 'anomalies', '--limit', '1'], active.root);
    expect(r.stdout).toContain('newest');
    expect(r.stdout).not.toContain('middle');
    expect(r.stdout).not.toContain('oldest');
  });

  it('skips malformed lines and reports count on stderr', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ message: 'good-one' }),
      'not-json-at-all',
      '{"type":"ac-blocked"}', // missing required fields
    ]);
    const r = await run(['status', 'anomalies'], active.root);
    expect(r.stdout).toContain('good-one');
    expect(r.stderr).toContain('2 unparseable lines skipped');
  });

  it('rejects invalid --since with exit 1', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [ev()]);
    const r = await run(['status', 'anomalies', '--since', 'not-iso'], active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('invalid --since');
  });

  // AC-4 (Phase 17.3) — --since is a live filter, no longer a no-op.
  it('--since filters events strictly before the boundary out (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ message: 'before', ts: '2026-05-14T20:00:00.000Z' }),
      ev({ message: 'after', ts: '2026-05-14T23:30:00.000Z' }),
    ]);
    const r = await run(
      ['status', 'anomalies', '--since', '2026-05-14T23:00:00.000Z'],
      active.root,
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('after');
    expect(r.stdout).not.toContain('before');
    // The 17.2 stderr no-op note must be gone.
    expect(r.stderr).not.toMatch(/--since is accepted but currently a no-op/);
  });

  it('--since is inclusive on the boundary (>=)', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ message: 'on-boundary', ts: '2026-05-14T23:00:00.000Z' }),
      ev({ message: 'after', ts: '2026-05-14T23:30:00.000Z' }),
    ]);
    const r = await run(
      ['status', 'anomalies', '--since', '2026-05-14T23:00:00.000Z'],
      active.root,
    );
    expect(r.stdout).toContain('on-boundary');
    expect(r.stdout).toContain('after');
  });

  it('--since AND-s with --type', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ type: 'ac-blocked', message: 'old-ac', ts: '2026-05-14T20:00:00.000Z' }),
      ev({ type: 'files-outside-boundary', message: 'old-fob', ts: '2026-05-14T20:00:00.000Z' }),
      ev({ type: 'ac-blocked', message: 'new-ac', ts: '2026-05-14T23:30:00.000Z' }),
      ev({ type: 'files-outside-boundary', message: 'new-fob', ts: '2026-05-14T23:30:00.000Z' }),
    ]);
    const r = await run(
      ['status', 'anomalies', '--since', '2026-05-14T23:00:00.000Z', '--type', 'ac-blocked'],
      active.root,
    );
    expect(r.stdout).toContain('new-ac');
    expect(r.stdout).not.toContain('new-fob'); // type filter
    expect(r.stdout).not.toContain('old-ac');  // since filter
    expect(r.stdout).not.toContain('old-fob');
  });

  it('--since clamps with --limit after the time filter', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ message: 'a-old', ts: '2026-05-14T20:00:00.000Z' }),
      ev({ message: 'b-mid', ts: '2026-05-14T23:00:00.000Z' }),
      ev({ message: 'c-new', ts: '2026-05-14T23:30:00.000Z' }),
    ]);
    const r = await run(
      ['status', 'anomalies', '--since', '2026-05-14T22:00:00.000Z', '--limit', '1'],
      active.root,
    );
    // Only b-mid and c-new survive --since; --limit 1 keeps the newest.
    expect(r.stdout).toContain('c-new');
    expect(r.stdout).not.toContain('b-mid');
    expect(r.stdout).not.toContain('a-old');
  });

  it('legacy log lines without ts are skipped + counted bad', async () => {
    active = await tempRepo({ initialized: true });
    await seedLog(active.root, [
      ev({ message: 'good' }),
      JSON.stringify({ type: 'ac-blocked', severity: 'warn', message: 'no-ts', context: {} }),
    ]);
    const r = await run(['status', 'anomalies'], active.root);
    expect(r.stdout).toContain('good');
    expect(r.stdout).not.toContain('no-ts');
    expect(r.stderr).toContain('1 unparseable lines skipped');
  });

  it('default status (no subcommand) still works', async () => {
    active = await tempRepo({ initialized: true });
    const r = await run(['status'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('CADENCE');
  });
});
