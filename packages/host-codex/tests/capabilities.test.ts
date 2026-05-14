import { describe, it, expect } from 'vitest';
import { codexCapabilities } from '../src/capabilities.js';

describe('codexCapabilities', () => {
  it('lists the 5 supported abstract events', () => {
    expect(codexCapabilities.hooks).toEqual([
      'session-start',
      'user-prompt',
      'pre-tool-edit',
      'post-tool-edit',
      'session-stop',
    ]);
  });

  it('does not advertise subagent-result (Codex has no SubagentStop)', () => {
    expect(codexCapabilities.hooks).not.toContain('subagent-result');
  });

  it('marks pre-tool-edit and session-stop as blocking', () => {
    expect(codexCapabilities.blockingHooks).toEqual(['pre-tool-edit', 'session-stop']);
  });

  it('exposes slash commands via skills system', () => {
    expect(codexCapabilities.slashCommands).toBe(true);
    expect(codexCapabilities.skillSystem).toBe('native');
  });

  it('reports no subagent spawn capability', () => {
    expect(codexCapabilities.subagentSpawn).toBe('none');
  });
});
