import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { installCommands } from '../src/install-commands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'cadence-cc-doc-count-'));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

/**
 * Phase 138 (rec-20260701-011 / audit F9): the slash-command count was
 * published inconsistently across README.md ("eleven"), docs/quickstart.md
 * ("nine", table only listing 9), and docs/claude-code.md (TOC said "9"
 * while its own section header said "12" — a broken anchor). Code truth is
 * whatever `installCommands` actually writes; derive it the same way the
 * existing install-commands.test.ts does (readdir count) rather than
 * hardcoding a number here, so this test fails loud if that ever changes
 * without the docs following.
 */
describe('docs stay truthful about the slash-command count (138 AC-1/AC-2)', () => {
  it('the three docs all name the code-truth count', async () => {
    const root = await tempDir();
    await installCommands(root);
    const entries = await readdir(join(root, '.claude/commands'));
    const trueCount = entries.filter((f) => f.startsWith('cadence-')).length;

    const readme = await readFile(join(REPO_ROOT, 'README.md'), 'utf8');
    const quickstart = await readFile(join(REPO_ROOT, 'docs/quickstart.md'), 'utf8');
    const claudeCode = await readFile(join(REPO_ROOT, 'docs/claude-code.md'), 'utf8');

    expect(readme).toMatch(new RegExp(`${trueCount} slash command`));
    expect(readme).not.toMatch(/eleven slash command/);

    expect(quickstart).toMatch(new RegExp(`${trueCount} slash command`));
    expect(quickstart).not.toMatch(/nine slash command/);

    expect(claudeCode).toMatch(new RegExp(`The ${trueCount} slash commands`));
    // The TOC entry must match the actual section heading (else the anchor
    // link `#the-N-slash-commands` is broken).
    const tocEntries = [...claudeCode.matchAll(/\[The \d+ slash commands\]/g)];
    const headingEntries = [...claudeCode.matchAll(/^## The \d+ slash commands$/gm)];
    expect(tocEntries).toHaveLength(1);
    expect(headingEntries).toHaveLength(1);
    expect(tocEntries[0]![0]).toBe(`[The ${trueCount} slash commands]`);
  });

  it("docs/quickstart.md's table lists every command install writes", async () => {
    const root = await tempDir();
    await installCommands(root);
    const entries = await readdir(join(root, '.claude/commands'));
    const names = entries
      .filter((f) => f.startsWith('cadence-'))
      .map((f) => f.replace(/\.md$/, ''));

    const quickstart = await readFile(join(REPO_ROOT, 'docs/quickstart.md'), 'utf8');
    for (const name of names) {
      expect(quickstart).toContain(`/${name}\``);
    }
  });
});
