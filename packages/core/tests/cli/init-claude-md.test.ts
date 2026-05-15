import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@cadence/testkit';
import {
  mergeManagedBlock,
  MANAGED_START,
  MANAGED_END,
} from '../../src/init/claude-md-template.js';

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
afterEach(async () => { if (active) { await active.cleanup(); active = null; } });

const opts = {
  projectName: 'demo',
  gateProfile: 'standard' as const,
  preset: 'team',
};

describe('mergeManagedBlock (AC-2/AC-3 unit)', () => {
  it('created: no existing file → full render with markers', () => {
    const r = mergeManagedBlock(null, opts);
    expect(r.mode).toBe('created');
    expect(r.content).toContain(MANAGED_START);
    expect(r.content).toContain(MANAGED_END);
    expect(r.content).toContain('demo');
    expect(r.content).toContain('standard');
  });

  it('regenerated: replaces span, preserves prefix/suffix byte-for-byte', () => {
    const existing = `PREFIX-KEEP\n${MANAGED_START}\nold managed\n${MANAGED_END}\nSUFFIX-KEEP`;
    const r = mergeManagedBlock(existing, opts);
    expect(r.mode).toBe('regenerated');
    expect(r.content.startsWith('PREFIX-KEEP\n')).toBe(true);
    expect(r.content.endsWith('\nSUFFIX-KEEP')).toBe(true);
    expect(r.content).not.toContain('old managed');
    expect(r.content).toContain('Gate profile');
  });

  it('preserved: marker-less content returned unchanged', () => {
    const existing = '# My hand-written CLAUDE.md\n\nNo markers here.\n';
    const r = mergeManagedBlock(existing, opts);
    expect(r.mode).toBe('preserved');
    expect(r.content).toBe(existing);
  });
});

describe('cadence init — CLAUDE.md (Phase 26.2)', () => {
  it('AC-1: fresh init writes a managed CLAUDE.md at repo root', async () => {
    active = await tempRepo();
    const r = await run(
      ['init', '--name=demo', '--gate-profile=standard'],
      active.root,
    );
    expect(r.code).toBe(0);
    const md = readFileSync(join(active.root, 'CLAUDE.md'), 'utf8');
    expect(md).toContain(MANAGED_START);
    expect(md).toContain(MANAGED_END);
    expect(md).toContain('demo');
    expect(md).toMatch(/Gate profile:\*\* standard/);
    expect(r.stdout).toMatch(/CLAUDE\.md/);
  });

  it('AC-3: --claude-md regenerates managed block, preserves outside', async () => {
    active = await tempRepo();
    const path = join(active.root, 'CLAUDE.md');
    writeFileSync(
      path,
      `# Custom Top\n\nmy notes\n\n${MANAGED_START}\nSTALE\n${MANAGED_END}\n\n## My Footer\n`,
    );
    const r = await run(['init', '--claude-md', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    const md = readFileSync(path, 'utf8');
    expect(md.startsWith('# Custom Top\n\nmy notes\n\n')).toBe(true);
    expect(md.endsWith('\n\n## My Footer\n')).toBe(true);
    expect(md).not.toContain('STALE');
    expect(md).toContain('CADENCE');
    expect(r.stdout).toMatch(/CLAUDE\.md regenerated/);
  });

  it('AC-3: marker-less CLAUDE.md is preserved (note on stderr, exit 0)', async () => {
    active = await tempRepo();
    const path = join(active.root, 'CLAUDE.md');
    const original = '# Mine\n\nhand-written, no markers\n';
    writeFileSync(path, original);
    const r = await run(['init', '--claude-md'], active.root);
    expect(r.code).toBe(0);
    expect(readFileSync(path, 'utf8')).toBe(original);
    expect(r.stderr).toMatch(/preserved: no cadence:managed markers/);
  });

  it('AC-4: --claude-md on initialized project reads state/config, no refuse', async () => {
    active = await tempRepo({ initialized: true });
    // initialized fixture has .cadence/ — normal init would refuse here.
    const r = await run(['init', '--claude-md'], active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/already initialized/);
    const md = readFileSync(join(active.root, 'CLAUDE.md'), 'utf8');
    expect(md).toContain(MANAGED_START);
  });
});
