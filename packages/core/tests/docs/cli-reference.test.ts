import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerAllCommands } from '../../src/cli/register.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

function documentedCommands(): Set<string> {
  const md = readFileSync(join(REPO_ROOT, 'docs/reference/commands.md'), 'utf8');
  const m = md.match(
    /<!-- cadence:commands:start -->\s*([\s\S]*?)\s*<!-- cadence:commands:end -->/,
  );
  if (!m) throw new Error('commands.md: drift-guard marker block missing');
  return new Set(
    m[1]!.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('<!--')),
  );
}

function cliCommands(): Set<string> {
  const program = new Command();
  registerAllCommands(program);
  return new Set(program.commands.map((c) => c.name()).filter((n) => n !== 'help'));
}

describe('docs/reference/commands.md drift guard', () => {
  it('documents exactly the CLI top-level command set', () => {
    expect([...documentedCommands()].sort()).toEqual([...cliCommands()].sort());
  });
});
