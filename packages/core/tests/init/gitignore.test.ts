import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import {
  CADENCE_OWNED_GITIGNORE_ENTRIES,
  planGitignoreEntries,
  ensureGitignoreEntries,
} from '../../src/init/gitignore.js';

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

describe('CADENCE_OWNED_GITIGNORE_ENTRIES', () => {
  it('is exactly the four cadence-owned ephemeral paths, in order', () => {
    expect(CADENCE_OWNED_GITIGNORE_ENTRIES).toEqual([
      '.cadence/state.json',
      '.cadence/STATE.md',
      '.cadence/mcp-trust.json',
      '.cadence/intelligence/context/',
    ]);
  });
});

describe('planGitignoreEntries (pure)', () => {
  it('returns all four entries when given empty content', () => {
    expect(planGitignoreEntries('')).toEqual([...CADENCE_OWNED_GITIGNORE_ENTRIES]);
  });

  it('returns only the missing entries when some are already present', () => {
    const existing = 'node_modules/\n.cadence/state.json\n.cadence/STATE.md\n';
    expect(planGitignoreEntries(existing)).toEqual([
      '.cadence/mcp-trust.json',
      '.cadence/intelligence/context/',
    ]);
  });

  it('returns [] (idempotent) when all four entries are already present', () => {
    const existing = [
      'node_modules/',
      '.cadence/state.json',
      '.cadence/STATE.md',
      '.cadence/mcp-trust.json',
      '.cadence/intelligence/context/',
      '',
    ].join('\n');
    expect(planGitignoreEntries(existing)).toEqual([]);
  });
});

describe('ensureGitignoreEntries (I/O)', () => {
  it('creates .gitignore with the header + all four entries when none exists', async () => {
    active = await tempRepo();
    expect(existsSync(join(active.root, '.gitignore'))).toBe(false);

    await ensureGitignoreEntries(active.root);

    const content = await readFile(join(active.root, '.gitignore'), 'utf8');
    expect(content).toContain('# cadence-owned ephemeral state (see docs/concepts.md)');
    for (const entry of CADENCE_OWNED_GITIGNORE_ENTRIES) {
      expect(content).toContain(entry);
    }
  });

  it('appends missing entries onto an existing non-empty .gitignore without a trailing-newline glitch', async () => {
    active = await tempRepo();
    const path = join(active.root, '.gitignore');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(path, 'node_modules/'); // no trailing newline

    await ensureGitignoreEntries(active.root);

    const content = await readFile(path, 'utf8');
    expect(content).toContain('node_modules/\n');
    for (const entry of CADENCE_OWNED_GITIGNORE_ENTRIES) {
      expect(content).toContain(entry);
    }
  });

  it('second call is a no-op / does not duplicate lines (idempotent at the I/O layer)', async () => {
    active = await tempRepo();
    await ensureGitignoreEntries(active.root);
    const first = await readFile(join(active.root, '.gitignore'), 'utf8');

    await ensureGitignoreEntries(active.root);
    const second = await readFile(join(active.root, '.gitignore'), 'utf8');

    expect(second).toBe(first);
    for (const entry of CADENCE_OWNED_GITIGNORE_ENTRIES) {
      const occurrences = second.split(entry).length - 1;
      expect(occurrences).toBe(1);
    }
  });
});

describe('cadence init — wires ensureGitignoreEntries into the scaffold (AC-1)', () => {
  it('a fresh `cadence init` writes all four entries into the repo root .gitignore', async () => {
    active = await tempRepo();
    const r = await run(['init', '--name=demo'], active.root);
    expect(r.code).toBe(0);
    const gitignorePath = join(active.root, '.gitignore');
    expect(existsSync(gitignorePath)).toBe(true);
    const content = readFileSync(gitignorePath, 'utf8');
    for (const entry of CADENCE_OWNED_GITIGNORE_ENTRIES) {
      expect(content).toContain(entry);
    }
  });

  it('re-running init-time gitignore writing is idempotent (no duplicate lines)', async () => {
    active = await tempRepo();
    await run(['init', '--name=demo'], active.root);
    const gitignorePath = join(active.root, '.gitignore');
    const before = readFileSync(gitignorePath, 'utf8');

    // simulate a second scaffold pass over the same repo root directly
    // (init itself refuses on an already-initialized repo, so we exercise
    // the idempotent writer function directly against the same root).
    await ensureGitignoreEntries(active.root);
    const after = readFileSync(gitignorePath, 'utf8');

    expect(after).toBe(before);
    for (const entry of CADENCE_OWNED_GITIGNORE_ENTRIES) {
      const occurrences = after.split(entry).length - 1;
      expect(occurrences).toBe(1);
    }
  });
});
