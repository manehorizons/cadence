import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installCommands } from '../src/install-commands.js';

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'cadence-codex-cmd-'));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe('installCommands (AC-2)', () => {
  it('AC-2: writes cadence-*.md prompts into <codexHome>/prompts/', async () => {
    const home = await tempDir();
    await installCommands(process.cwd(), { codexHome: home });
    expect(await exists(join(home, 'prompts/cadence-progress.md'))).toBe(true);
    expect(await exists(join(home, 'prompts/cadence-draft.md'))).toBe(true);
  });

  it('AC-2: renders Codex prompt-template format — frontmatter + cadence CLI, NO !-autorun', async () => {
    const home = await tempDir();
    await installCommands(process.cwd(), { codexHome: home });
    const body = await readFile(join(home, 'prompts/cadence-progress.md'), 'utf8');
    expect(body).toMatch(/^---\n/); // YAML frontmatter
    expect(body).toMatch(/description:/);
    expect(body).toContain('cadence progress'); // the CLI invocation
    expect(body).not.toMatch(/^!/m); // NOT Claude's !-autorun line
    expect(body).not.toContain('allowed-tools'); // Codex prompts have no allowed-tools
  });

  it('AC-2: argument commands carry $ARGUMENTS and an argument-hint', async () => {
    const home = await tempDir();
    await installCommands(process.cwd(), { codexHome: home });
    const draft = await readFile(join(home, 'prompts/cadence-draft.md'), 'utf8');
    expect(draft).toContain('$ARGUMENTS');
    expect(draft).toMatch(/argument-hint:/);
  });

  it('AC-2: leaves a user-customized (un-managed) file untouched', async () => {
    const home = await tempDir();
    await mkdir(join(home, 'prompts'), { recursive: true });
    const p = join(home, 'prompts/cadence-progress.md');
    await writeFile(p, 'my own prompt, hands off');
    await installCommands(process.cwd(), { codexHome: home });
    expect(await readFile(p, 'utf8')).toBe('my own prompt, hands off');
  });

  it('AC-2: re-writes a cadence-managed file (managed marker present)', async () => {
    const home = await tempDir();
    await installCommands(process.cwd(), { codexHome: home });
    const p = join(home, 'prompts/cadence-progress.md');
    const first = await readFile(p, 'utf8');
    await writeFile(p, first + '\nstale edit');
    await installCommands(process.cwd(), { codexHome: home });
    expect(await readFile(p, 'utf8')).toBe(first); // managed → overwritten back
  });

  it('AC-4: --local embeds the absolute workspace core path, not bare cadence', async () => {
    const home = await tempDir();
    await installCommands(process.cwd(), { codexHome: home, local: true });
    const body = await readFile(join(home, 'prompts/cadence-progress.md'), 'utf8');
    // Platform-aware: absolute core path is OS-native; don't assume a POSIX
    // leading slash (`node .+core…` rules out the bare `cadence` command).
    expect(body).toMatch(/node .+core.*progress/);
  });

  it('respects $CODEX_HOME when no override is given', async () => {
    const home = await tempDir();
    const saved = process.env.CODEX_HOME;
    process.env.CODEX_HOME = home;
    cleanup.push(async () => {
      if (saved === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = saved;
    });
    await installCommands(process.cwd(), {});
    expect(await exists(join(home, 'prompts/cadence-progress.md'))).toBe(true);
  });
});
