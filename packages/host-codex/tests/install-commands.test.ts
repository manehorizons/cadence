import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { installCommands } from '../src/install-commands.js';

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'keel-codex-cmd-'));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

describe('installCommands', () => {
  it('creates 9 keel-* skill directories under .agents/skills/', async () => {
    const root = await tempDir();
    await installCommands(root);
    const entries = await readdir(join(root, '.agents/skills'));
    expect(entries.sort()).toEqual(
      [
        'keel-approve',
        'keel-block',
        'keel-build',
        'keel-check',
        'keel-done',
        'keel-draft',
        'keel-needs-context',
        'keel-progress',
        'keel-settle',
      ].sort(),
    );
  });

  it('each skill dir contains SKILL.md', async () => {
    const root = await tempDir();
    await installCommands(root);
    for (const name of [
      'keel-progress',
      'keel-draft',
      'keel-approve',
      'keel-check',
      'keel-build',
      'keel-settle',
      'keel-done',
      'keel-block',
      'keel-needs-context',
    ]) {
      const body = await readFile(join(root, '.agents/skills', name, 'SKILL.md'), 'utf8');
      expect(body).toBeTruthy();
    }
  });

  it('shortcut-verb skills bind to the right CLI invocation', async () => {
    const root = await tempDir();
    await installCommands(root);

    const done = await readFile(join(root, '.agents/skills/keel-done/SKILL.md'), 'utf8');
    expect(done).toMatch(/keel done \$ARGUMENTS/);
    expect(done).toMatch(/description: .*DONE/);
    expect(done).toMatch(/<!-- managed-by: keel -->/);

    const block = await readFile(join(root, '.agents/skills/keel-block/SKILL.md'), 'utf8');
    expect(block).toMatch(/keel block \$ARGUMENTS/);
    expect(block).toMatch(/description: .*BLOCKED/);

    const nc = await readFile(join(root, '.agents/skills/keel-needs-context/SKILL.md'), 'utf8');
    expect(nc).toMatch(/keel needs-context \$ARGUMENTS/);
    expect(nc).toMatch(/description: .*NEEDS_CONTEXT/);
  });

  it('SKILL.md has YAML frontmatter with required name + description', async () => {
    const root = await tempDir();
    await installCommands(root);
    const body = await readFile(join(root, '.agents/skills/keel-progress/SKILL.md'), 'utf8');
    expect(body.startsWith('---\n')).toBe(true);
    expect(body).toMatch(/^name: keel-progress$/m);
    expect(body).toMatch(/^description: /m);
  });

  it('description includes trigger words for implicit discovery', async () => {
    const root = await tempDir();
    await installCommands(root);
    const body = await readFile(join(root, '.agents/skills/keel-progress/SKILL.md'), 'utf8');
    // Should mention KEEL context so Codex can match user intent
    expect(body.toLowerCase()).toMatch(/keel/);
  });

  it('body references the underlying keel CLI command', async () => {
    const root = await tempDir();
    await installCommands(root);
    const progress = await readFile(join(root, '.agents/skills/keel-progress/SKILL.md'), 'utf8');
    expect(progress).toMatch(/keel progress/);
    const draft = await readFile(join(root, '.agents/skills/keel-draft/SKILL.md'), 'utf8');
    expect(draft).toMatch(/keel draft new/);
    const settle = await readFile(join(root, '.agents/skills/keel-settle/SKILL.md'), 'utf8');
    expect(settle).toMatch(/keel settle run/);
  });

  it('writes agents/openai.yaml disabling implicit invocation by default', async () => {
    const root = await tempDir();
    await installCommands(root);
    const cfg = await readFile(join(root, '.agents/skills/keel-build/agents/openai.yaml'), 'utf8');
    expect(cfg).toMatch(/allow_implicit_invocation:\s*false/);
  });

  it('opts.allowImplicit=true omits the gate', async () => {
    const root = await tempDir();
    await installCommands(root, { allowImplicit: true });
    let found: string | null = null;
    try {
      found = await readFile(
        join(root, '.agents/skills/keel-build/agents/openai.yaml'),
        'utf8',
      );
    } catch {
      // expected when allowImplicit=true
    }
    expect(found).toBeNull();
  });

  it('keelCommand override appears in SKILL.md body', async () => {
    const root = await tempDir();
    await installCommands(root, { keelCommand: 'node /abs/keel.js' });
    const body = await readFile(join(root, '.agents/skills/keel-progress/SKILL.md'), 'utf8');
    expect(body).toMatch(/node \/abs\/keel\.js progress/);
  });

  it('skillsDir option overrides target dir', async () => {
    const root = await tempDir();
    await installCommands(root, { skillsDir: 'custom-skills' });
    const entries = await readdir(join(root, 'custom-skills'));
    expect(entries).toContain('keel-progress');
  });

  it('leaves user-customized SKILL.md (no managed marker) alone', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.agents/skills/keel-progress'), { recursive: true });
    const customBody = '---\nname: keel-progress\ndescription: user override\n---\nMY OWN BODY';
    await writeFile(join(root, '.agents/skills/keel-progress/SKILL.md'), customBody, 'utf8');
    await installCommands(root);
    const after = await readFile(join(root, '.agents/skills/keel-progress/SKILL.md'), 'utf8');
    expect(after).toBe(customBody);
  });

  it('overwrites KEEL-managed SKILL.md on re-install', async () => {
    const root = await tempDir();
    await installCommands(root);
    const first = await readFile(join(root, '.agents/skills/keel-progress/SKILL.md'), 'utf8');
    await writeFile(
      join(root, '.agents/skills/keel-progress/SKILL.md'),
      first.replace('keel progress', 'STALE TEXT'),
      'utf8',
    );
    await installCommands(root);
    const after = await readFile(join(root, '.agents/skills/keel-progress/SKILL.md'), 'utf8');
    expect(after).toMatch(/keel progress/);
    expect(after).not.toMatch(/STALE TEXT/);
  });

  it('local=true renders absolute core path in SKILL.md body', async () => {
    const root = await tempDir();
    await installCommands(root, { local: true });
    const body = await readFile(join(root, '.agents/skills/keel-progress/SKILL.md'), 'utf8');
    expect(body).toMatch(/node .+core[\\/]dist[\\/]cli[\\/]index\.js progress/);
  });
});
