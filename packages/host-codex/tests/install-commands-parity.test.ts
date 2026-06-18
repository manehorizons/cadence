import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { installCommands } from '../src/install-commands.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLAUDE_GOLDEN = join(
  __dirname,
  '../../host-claude-code/tests/fixtures/golden-root/.claude/commands',
);

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cadence-codex-parity-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

describe('install-commands parity with Claude command catalog', () => {
  it('AC-2: Codex prompt names match the Claude cadence-* command catalog', async () => {
    const home = await tempDir();
    await installCommands(process.cwd(), { codexHome: home });

    const codexNames = (await readdir(join(home, 'prompts'))).sort();
    const claudeNames = (await readdir(CLAUDE_GOLDEN))
      .map((name) => `${basename(name, '.md')}.md`)
      .sort();

    expect(codexNames).toEqual(claudeNames);
  });

  it('AC-3: Codex prompts keep Codex-native format, not Claude command format', async () => {
    const home = await tempDir();
    await installCommands(process.cwd(), { codexHome: home });
    const dir = join(home, 'prompts');

    for (const name of await readdir(dir)) {
      const body = await readFile(join(dir, name), 'utf8');
      expect(body, name).toMatch(/^---\n/);
      expect(body, name).toContain('description:');
      expect(body, name).toContain('<!-- managed-by: cadence -->');
      expect(body, name).toContain('Run the following command in the terminal');
      expect(body, name).toMatch(/```\r?\ncadence /);
      expect(body, name).not.toMatch(/^!/m);
      expect(body, name).not.toContain('allowed-tools');
    }
  });
});
