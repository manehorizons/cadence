import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import {
  mergeManagedBlock,
  renderManagedBlock,
  writeContributingMd,
  MANAGED_START,
  MANAGED_END,
} from '../../src/init/contributing-md-template.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '../../dist/cli/index.js');

function run(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], {
      cwd,
      env: { ...process.env, ...env },
    });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const opts = { projectName: 'demo' };

describe('mergeManagedBlock (AC-3 unit)', () => {
  it('created: no existing file → full render with markers, mentions cadence onboard (AC-3)', () => {
    const r = mergeManagedBlock(null, opts);
    expect(r.mode).toBe('created');
    expect(r.content).toContain(MANAGED_START);
    expect(r.content).toContain(MANAGED_END);
    expect(r.content).toContain('demo');
    expect(r.content).toMatch(/cadence onboard/);
  });

  it('regenerated: replaces span, preserves prefix/suffix byte-for-byte (AC-3)', () => {
    const existing = `PREFIX-KEEP\n${MANAGED_START}\nold managed\n${MANAGED_END}\nSUFFIX-KEEP`;
    const r = mergeManagedBlock(existing, opts);
    expect(r.mode).toBe('regenerated');
    expect(r.content.startsWith('PREFIX-KEEP\n')).toBe(true);
    expect(r.content.endsWith('\nSUFFIX-KEEP')).toBe(true);
    expect(r.content).not.toContain('old managed');
    expect(r.content).toMatch(/cadence onboard/);
  });

  it('preserved: marker-less content returned unchanged (AC-3)', () => {
    const existing = '# My hand-written CONTRIBUTING.md\n\nNo markers here.\n';
    const r = mergeManagedBlock(existing, opts);
    expect(r.mode).toBe('preserved');
    expect(r.content).toBe(existing);
  });

  it('renderManagedBlock content points the next contributor at cadence onboard (AC-3)', () => {
    const block = renderManagedBlock(opts);
    expect(block).toMatch(/cadence onboard/);
    expect(block).toContain('demo');
  });
});

describe('writeContributingMd (AC-3 unit, file-level idempotency)', () => {
  it('running the writer twice against the same target does not duplicate the managed block (AC-3)', async () => {
    active = await tempRepo();
    const path = join(active.root, 'CONTRIBUTING.md');

    const firstMode = await writeContributingMd(active.root, opts);
    expect(firstMode).toBe('created');
    const afterFirst = readFileSync(path, 'utf8');
    const firstBlockCount = afterFirst.split(MANAGED_START).length - 1;
    expect(firstBlockCount).toBe(1);

    const secondMode = await writeContributingMd(active.root, opts);
    expect(secondMode).toBe('regenerated');
    const afterSecond = readFileSync(path, 'utf8');
    const secondBlockCount = afterSecond.split(MANAGED_START).length - 1;
    expect(secondBlockCount).toBe(1);
    expect(afterSecond.split(MANAGED_END).length - 1).toBe(1);
  });
});

describe('cadence init — CONTRIBUTING.md (Phase 189, AC-3)', () => {
  it('AC-3: fresh init writes a managed CONTRIBUTING.md at repo root mentioning cadence onboard', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo', '--gate-profile=standard'], active.root);
    expect(r.code).toBe(0);
    const md = readFileSync(join(active.root, 'CONTRIBUTING.md'), 'utf8');
    expect(md).toContain(MANAGED_START);
    expect(md).toContain(MANAGED_END);
    expect(md).toContain('demo');
    expect(md).toMatch(/cadence onboard/);
  });

  it('AC-3: --full init also writes the managed CONTRIBUTING.md block', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--full'],
      active.root,
      { ANTHROPIC_API_KEY: '' },
    );
    expect(r.code).toBe(0);
    const md = readFileSync(join(active.root, 'CONTRIBUTING.md'), 'utf8');
    expect(md).toContain(MANAGED_START);
    expect(md).toContain(MANAGED_END);
    expect(md).toMatch(/cadence onboard/);
  });

  it('AC-3: a pre-existing marker-less CONTRIBUTING.md is preserved byte-identical', async () => {
    active = await tempRepo();
    const path = join(active.root, 'CONTRIBUTING.md');
    const original = '# Mine\n\nhand-written contributing guide, no markers here.\n';
    writeFileSync(path, original);
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(original);
  });
});
