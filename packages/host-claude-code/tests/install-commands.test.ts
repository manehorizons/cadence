import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { installCommands } from '../src/install-commands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
  it('AC-1: writes 12 cadence-*.md files under .claude/commands/', async () => {
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
      'cadence-handoff.md',
      'cadence-needs-context.md',
      'cadence-progress.md',
      'cadence-resume.md',
      'cadence-scout.md',
      'cadence-settle.md',
    ]);
  });

  it('AC-1 (phase 119): rejects commandsDir outside the project root', async () => {
    const root = await tempDir();
    await expect(installCommands(root, { commandsDir: '../commands' })).rejects.toThrow(
      /commandsDir must stay within the project root/,
    );
  });

  it('AC-1+AC-3: cadence-scout is tagged managed with valid frontmatter', async () => {
    const root = await tempDir();
    await installCommands(root);
    const scout = await readFile(
      join(root, '.claude/commands/cadence-scout.md'),
      'utf8',
    );
    expect(scout).toMatch(/<!-- managed-by: cadence -->/);
    expect(scout).toMatch(/^---\n/);
    expect(scout).toMatch(/description: .*(ideation|scout|recommendation)/i);
    expect(scout).toMatch(/argument-hint: \[topic\]/);
    expect(scout).toMatch(/allowed-tools: Bash\(cadence:\*\), Read/);
  });

  it('AC-2: scout body encodes the orient→diverge→converge→land contract', async () => {
    const root = await tempDir();
    await installCommands(root);
    const scout = await readFile(
      join(root, '.claude/commands/cadence-scout.md'),
      'utf8',
    );
    // Orients off the ranked ledger.
    expect(scout).toMatch(/^!cadence recommend\s*$/m);
    // Divergent→convergent dialogue language.
    expect(scout).toMatch(/diverge/i);
    expect(scout).toMatch(/converge/i);
    // Lands survivors via the existing rec CRUD with provenance evidence.
    expect(scout).toMatch(/cadence recommendation add/);
    expect(scout).toMatch(/--evidence/);
    // Must NOT pretend to be a loop driver.
    expect(scout).not.toMatch(/draft new|draft approve|settle run/);
  });

  it('AC-5 (phase 61): scout body mints a session id and passes --scout-id on each add', async () => {
    const root = await tempDir();
    await installCommands(root);
    const scout = await readFile(
      join(root, '.claude/commands/cadence-scout.md'),
      'utf8',
    );
    // Documents the scout-YYYYMMDD-HHMM convention...
    expect(scout).toMatch(/scout-YYYYMMDD-HHMM/);
    // ...and wires --scout-id into the landing command.
    expect(scout).toMatch(/--scout-id/);
    // The existing --evidence provenance note must remain.
    expect(scout).toMatch(/--evidence/);
  });

  it('AC-3: a user-overridden cadence-scout.md survives re-install', async () => {
    const root = await tempDir();
    await mkdir(join(root, '.claude/commands'), { recursive: true });
    await writeFile(
      join(root, '.claude/commands/cadence-scout.md'),
      '---\ndescription: my override\n---\nhand-rolled scout\n',
    );
    await installCommands(root);
    const scout = await readFile(
      join(root, '.claude/commands/cadence-scout.md'),
      'utf8',
    );
    expect(scout).toMatch(/hand-rolled scout/);
    expect(scout).not.toMatch(/managed-by: cadence/);
  });

  it('AC-4: docs announce /cadence-scout and its Praxis hand-off', async () => {
    const concepts = await readFile(
      join(__dirname, '../../../docs/concepts.md'),
      'utf8',
    );
    const commands = await readFile(
      join(__dirname, '../../../docs/reference/commands.md'),
      'utf8',
    );
    expect(concepts).toMatch(/\/cadence-scout/);
    expect(commands).toMatch(/\/cadence-scout/);
  });

  it('AC-27: handoff/resume wrappers bind to the right CLI invocation', async () => {
    const root = await tempDir();
    await installCommands(root);
    const handoff = await readFile(join(root, '.claude/commands/cadence-handoff.md'), 'utf8');
    expect(handoff).toMatch(/^!cadence handoff \$ARGUMENTS\s*$/m);
    expect(handoff).toMatch(/<!-- managed-by: cadence -->/);
    const resume = await readFile(join(root, '.claude/commands/cadence-resume.md'), 'utf8');
    expect(resume).toMatch(/^!cadence resume\s*$/m);
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

  it('cadence-build advertises valid task status values', async () => {
    const root = await tempDir();
    await installCommands(root);
    const build = await readFile(join(root, '.claude/commands/cadence-build.md'), 'utf8');
    expect(build).toContain(
      'argument-hint: <task-id> --status=<DONE|DONE_WITH_CONCERNS|NEEDS_CONTEXT|BLOCKED>',
    );
    expect(build).not.toContain('PASS|FAIL|BLOCKED|ESCALATED');
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
