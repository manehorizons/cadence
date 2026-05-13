import { describe, it, expect } from 'vitest';
import { MockHostAdapter } from '../src/mock-host.js';

describe('MockHostAdapter', () => {
  it('records all hook calls in order', async () => {
    const host = new MockHostAdapter();
    await host.dispatchHook('session-start', { cwd: '/tmp/x' });
    await host.dispatchHook('user-prompt', { cwd: '/tmp/x', raw: 'hi' });
    expect(host.calls).toHaveLength(2);
    expect(host.calls[0]?.event).toBe('session-start');
    expect(host.calls[1]?.event).toBe('user-prompt');
  });

  it('declares full capability set by default', () => {
    const host = new MockHostAdapter();
    expect(host.capabilities.hooks).toContain('session-start');
    expect(host.capabilities.hooks).toContain('subagent-result');
    expect(host.capabilities.slashCommands).toBe(true);
  });

  it('can override capabilities for degradation tests', () => {
    const host = new MockHostAdapter({ capabilities: { slashCommands: false } });
    expect(host.capabilities.slashCommands).toBe(false);
  });
});
