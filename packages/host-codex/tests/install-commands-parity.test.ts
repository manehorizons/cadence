import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { COMMAND_GUIDANCE, SCOUT_DIALOGUE } from '@thomas-powers-jr/cadence-types';
import { installCommands } from '../src/install-commands.js';

let cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const c of cleanup) await c();
  cleanup = [];
});

async function tempDir(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), 'cadence-codex-parity-'));
  cleanup.push(() => rm(d, { recursive: true, force: true }));
  return d;
}

describe('codex prompt catalog parity with shared guidance', () => {
  it('AC-2: renders one Codex prompt for every shared command guidance key', async () => {
    const home = await tempDir();
    await installCommands(process.cwd(), { codexHome: home });

    const got = (await readdir(join(home, 'prompts'))).sort();
    const expected = Object.keys(COMMAND_GUIDANCE)
      .map((name) => `${name}.md`)
      .sort();
    expect(got).toEqual(expected);
  });

  it('AC-3: keeps Codex prompt shape while using shared prose and scout dialogue', async () => {
    const home = await tempDir();
    await installCommands(process.cwd(), { codexHome: home });

    const progress = await readFile(join(home, 'prompts/cadence-progress.md'), 'utf8');
    expect(progress).toMatch(/^---\n/);
    expect(progress).toContain(`description: ${COMMAND_GUIDANCE['cadence-progress'].description}`);
    expect(progress).toContain(COMMAND_GUIDANCE['cadence-progress'].trailing);
    expect(progress).not.toMatch(/^!/m);
    expect(progress).not.toContain('allowed-tools');

    const scout = await readFile(join(home, 'prompts/cadence-scout.md'), 'utf8');
    expect(scout).toContain(`description: ${COMMAND_GUIDANCE['cadence-scout'].description}`);
    expect(scout).toContain('argument-hint: [topic]');
    expect(scout).toContain('cadence recommend');
    expect(scout).toContain(SCOUT_DIALOGUE);
  });
});
