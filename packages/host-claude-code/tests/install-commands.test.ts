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
  const d = await mkdtemp(join(tmpdir(), 'cadence-cc-cmd-'));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

describe('installCommands', () => {
  it('writes 9 cadence-*.md files under .claude/commands/', async () => {
    const root = await tempDir();
    await installCommands(root);
    const entries = await readdir(join(root, '.claude/commands'));
    expect(entries.sort()).toEqual([
      'cadence-approve.md',
      'cadence-block.md',
      'cadence-build.md',
      'cadence-check.md',
      'cadence-done.md',
      'cadence-draft.md',
      'cadence-needs-context.md',
      'cadence-progress.md',
      'cadence-settle.md',
    ]);
  });

  it('shortcut verbs (done/block/needs-context) bind to the right CLI invocation', async () => {
    const root = await tempDir();
    await installCommands(root);
    const done = await readFile(join(root, '.claude/commands/cadence-done.md'), 'utf8');
    expect(done).toMatch(/^!cadence done \$ARGUMENTS\s*$/m);
    expect(done).toMatch(/description: .*DONE/);
    expect(done).toMatch(/<!-- managed-by: cadence -->/);

    const block = await readFile(join(root, '.claude/commands/cadence-block.md'), 'utf8');
    expect(block).toMatch(/^!cadence block \$ARGUMENTS\s*$/m);
    expect(block).toMatch(/description: .*BLOCKED/);

    const nc = await readFile(join(root, '.claude/commands/cadence-needs-context.md'), 'utf8');
    expect(nc).toMatch(/^!cadence needs-context \$ARGUMENTS\s*$/m);
    expect(nc).toMatch(/description: .*NEEDS_CONTEXT/);
  });

  it('each file has frontmatter with description and allowed-tools', async () => {
    const root = await tempDir();
    await installCommands(root);
    const body = await readFile(join(root, '.claude/commands/cadence-progress.md'), 'utf8');
    expect(body).toMatch(/^---\n/);
    expect(body).toMatch(/description: /);
    expect(body).toMatch(/allowed-tools: /);
    expect(body).toMatch(/\n---\n/);
  });

  it('cadence-progress invokes !cadence progress with no args', async () => {
    const root = await tempDir();
    await installCommands(root);
    const body = await readFile(join(root, '.claude/commands/cadence-progress.md'), 'utf8');
    expect(body).toMatch(/^!cadence progress\s*$/m);
  });

  it('parameterized commands use $ARGUMENTS', async () => {
    const root = await tempDir();
    await installCommands(root);
    const draft = await readFile(join(root, '.claude/commands/cadence-draft.md'), 'utf8');
    expect(draft).toMatch(/^!cadence draft new \$ARGUMENTS\s*$/m);
    expect(draft).toMatch(/argument-hint: /);

    const approve = await readFile(join(root, '.claude/commands/cadence-approve.md'), 'utf8');
    expect(approve).toMatch(/^!cadence draft approve \$ARGUMENTS\s*$/m);

    const build = await readFile(join(root, '.claude/commands/cadence-build.md'), 'utf8');
    expect(build).toMatch(/^!cadence build task \$ARGUMENTS\s*$/m);

    const settle = await readFile(join(root, '.claude/commands/cadence-settle.md'), 'utf8');
    expect(settle).toMatch(/^!cadence settle run \$ARGUMENTS\s*$/m);

    const check = await readFile(join(root, '.claude/commands/cadence-check.md'), 'utf8');
    expect(check).toMatch(/^!cadence draft check \$ARGUMENTS\s*$/m);
  });

  it('files are tagged cadence-managed via a comment header', async () => {
    const root = await tempDir();
    await installCommands(root);
    const body = await readFile(join(root, '.claude/commands/cadence-progress.md'), 'utf8');
    expect(body).toMatch(/<!-- managed-by: cadence -->/);
  });

  it('idempotent: re-install overwrites cadence-managed files only', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.claude/commands'), { recursive: true });
    // User-defined sibling command must survive.
    await writeFile(
      join(root, '.claude/commands/my-custom.md'),
      '---\ndescription: custom\n---\nuser content\n',
    );
    // User-overridden cadence command (no managed marker) must survive.
    await writeFile(
      join(root, '.claude/commands/cadence-progress.md'),
      '---\ndescription: my override\n---\nhand-rolled\n',
    );
    await installCommands(root);

    const custom = await readFile(join(root, '.claude/commands/my-custom.md'), 'utf8');
    expect(custom).toMatch(/user content/);

    const progress = await readFile(join(root, '.claude/commands/cadence-progress.md'), 'utf8');
    expect(progress).toMatch(/hand-rolled/);
    expect(progress).not.toMatch(/managed-by: cadence/);
  });

  it('honors cadenceCommand override (replaces `cadence` prefix)', async () => {
    const root = await tempDir();
    await installCommands(root, { cadenceCommand: 'node /abs/cadence.js' });
    const body = await readFile(join(root, '.claude/commands/cadence-progress.md'), 'utf8');
    expect(body).toMatch(/^!node \/abs\/cadence\.js progress\s*$/m);
  });

  it('local=true renders absolute core path in slash body', async () => {
    const root = await tempDir();
    await installCommands(root, { local: true });
    const body = await readFile(join(root, '.claude/commands/cadence-progress.md'), 'utf8');
    expect(body).toMatch(/!node .+core[\\/]dist[\\/]cli[\\/]index\.js progress/);
  });
});
