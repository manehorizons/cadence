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
  const d = await mkdtemp(join(tmpdir(), 'keel-cc-cmd-'));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

describe('installCommands', () => {
  it('writes 6 keel-*.md files under .claude/commands/', async () => {
    const root = await tempDir();
    await installCommands(root);
    const entries = await readdir(join(root, '.claude/commands'));
    expect(entries.sort()).toEqual([
      'keel-approve.md',
      'keel-build.md',
      'keel-check.md',
      'keel-draft.md',
      'keel-progress.md',
      'keel-settle.md',
    ]);
  });

  it('each file has frontmatter with description and allowed-tools', async () => {
    const root = await tempDir();
    await installCommands(root);
    const body = await readFile(join(root, '.claude/commands/keel-progress.md'), 'utf8');
    expect(body).toMatch(/^---\n/);
    expect(body).toMatch(/description: /);
    expect(body).toMatch(/allowed-tools: /);
    expect(body).toMatch(/\n---\n/);
  });

  it('keel-progress invokes !keel progress with no args', async () => {
    const root = await tempDir();
    await installCommands(root);
    const body = await readFile(join(root, '.claude/commands/keel-progress.md'), 'utf8');
    expect(body).toMatch(/^!keel progress\s*$/m);
  });

  it('parameterized commands use $ARGUMENTS', async () => {
    const root = await tempDir();
    await installCommands(root);
    const draft = await readFile(join(root, '.claude/commands/keel-draft.md'), 'utf8');
    expect(draft).toMatch(/^!keel draft new \$ARGUMENTS\s*$/m);
    expect(draft).toMatch(/argument-hint: /);

    const approve = await readFile(join(root, '.claude/commands/keel-approve.md'), 'utf8');
    expect(approve).toMatch(/^!keel draft approve \$ARGUMENTS\s*$/m);

    const build = await readFile(join(root, '.claude/commands/keel-build.md'), 'utf8');
    expect(build).toMatch(/^!keel build task \$ARGUMENTS\s*$/m);

    const settle = await readFile(join(root, '.claude/commands/keel-settle.md'), 'utf8');
    expect(settle).toMatch(/^!keel settle run \$ARGUMENTS\s*$/m);

    const check = await readFile(join(root, '.claude/commands/keel-check.md'), 'utf8');
    expect(check).toMatch(/^!keel draft check \$ARGUMENTS\s*$/m);
  });

  it('files are tagged keel-managed via a comment header', async () => {
    const root = await tempDir();
    await installCommands(root);
    const body = await readFile(join(root, '.claude/commands/keel-progress.md'), 'utf8');
    expect(body).toMatch(/<!-- managed-by: keel -->/);
  });

  it('idempotent: re-install overwrites keel-managed files only', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.claude/commands'), { recursive: true });
    // User-defined sibling command must survive.
    await writeFile(
      join(root, '.claude/commands/my-custom.md'),
      '---\ndescription: custom\n---\nuser content\n',
    );
    // User-overridden keel command (no managed marker) must survive.
    await writeFile(
      join(root, '.claude/commands/keel-progress.md'),
      '---\ndescription: my override\n---\nhand-rolled\n',
    );
    await installCommands(root);

    const custom = await readFile(join(root, '.claude/commands/my-custom.md'), 'utf8');
    expect(custom).toMatch(/user content/);

    const progress = await readFile(join(root, '.claude/commands/keel-progress.md'), 'utf8');
    expect(progress).toMatch(/hand-rolled/);
    expect(progress).not.toMatch(/managed-by: keel/);
  });

  it('honors keelCommand override (replaces `keel` prefix)', async () => {
    const root = await tempDir();
    await installCommands(root, { keelCommand: 'node /abs/keel.js' });
    const body = await readFile(join(root, '.claude/commands/keel-progress.md'), 'utf8');
    expect(body).toMatch(/^!node \/abs\/keel\.js progress\s*$/m);
  });

  it('local=true renders absolute core path in slash body', async () => {
    const root = await tempDir();
    await installCommands(root, { local: true });
    const body = await readFile(join(root, '.claude/commands/keel-progress.md'), 'utf8');
    expect(body).toMatch(/!node .+core[\\/]dist[\\/]cli[\\/]index\.js progress/);
  });
});
