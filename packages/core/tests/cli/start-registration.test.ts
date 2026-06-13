import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { registerAllCommands } from '../../src/cli/register.js';
import { buildQuickstart } from '../../src/quickstart/build.js';

describe('start command registration', () => {
  it('registers `start` on the program (AC-7)', () => {
    const program = new Command();
    registerAllCommands(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('start');
  });

  it('lists `start` in the quickstart command map (AC-13)', () => {
    const qs = buildQuickstart({ initialized: false });
    expect(qs.commandMap.map((e) => e.name)).toContain('start');
  });
});
