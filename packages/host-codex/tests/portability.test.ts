import { describe, it, expect } from 'vitest';
import { HostCapabilitiesZ } from '@keel/types';
import { claudeCodeCapabilities } from '@keel/host-claude-code';
import { MockHostAdapter } from '@keel/testkit';
import { codexCapabilities } from '../src/capabilities.js';

describe('host adapter portability', () => {
  it('claudeCodeCapabilities conforms to HostCapabilitiesZ', () => {
    const r = HostCapabilitiesZ.safeParse(claudeCodeCapabilities);
    expect(r.success).toBe(true);
  });

  it('codexCapabilities conforms to HostCapabilitiesZ', () => {
    const r = HostCapabilitiesZ.safeParse(codexCapabilities);
    expect(r.success).toBe(true);
  });

  it('MockHostAdapter default capabilities conform to HostCapabilitiesZ', () => {
    const mock = new MockHostAdapter();
    const r = HostCapabilitiesZ.safeParse(mock.capabilities);
    expect(r.success).toBe(true);
  });

  it('Claude Code lists all 6 abstract events', () => {
    expect(claudeCodeCapabilities.hooks).toEqual(
      expect.arrayContaining([
        'session-start',
        'user-prompt',
        'pre-tool-edit',
        'post-tool-edit',
        'session-stop',
        'subagent-result',
      ]),
    );
    expect(claudeCodeCapabilities.hooks).toHaveLength(6);
  });

  it('Codex does NOT list subagent-result (no SubagentStop event upstream)', () => {
    expect(codexCapabilities.hooks).not.toContain('subagent-result');
  });

  it('both real adapters mark pre-tool-edit as blocking', () => {
    expect(claudeCodeCapabilities.blockingHooks).toContain('pre-tool-edit');
    expect(codexCapabilities.blockingHooks).toContain('pre-tool-edit');
  });

  it('both real adapters expose slash commands and native skill system', () => {
    for (const caps of [claudeCodeCapabilities, codexCapabilities]) {
      expect(caps.slashCommands).toBe(true);
      expect(caps.skillSystem).toBe('native');
    }
  });
});
