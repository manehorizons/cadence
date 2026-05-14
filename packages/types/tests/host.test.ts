import { describe, it, expect } from 'vitest';
import { HostCapabilitiesZ, type HostCapabilities } from '../src/host.js';

const wellFormed: HostCapabilities = {
  hooks: ['session-start', 'user-prompt', 'pre-tool-edit', 'post-tool-edit', 'session-stop'],
  slashCommands: true,
  skillSystem: 'native',
  blockingHooks: ['pre-tool-edit', 'session-stop'],
  subagentSpawn: 'none',
  streamingOutput: true,
};

describe('HostCapabilitiesZ', () => {
  it('accepts a well-formed capabilities object', () => {
    const r = HostCapabilitiesZ.safeParse(wellFormed);
    expect(r.success).toBe(true);
  });

  it('accepts subagentSpawn = "native" | "shell-out" | "none"', () => {
    for (const v of ['native', 'shell-out', 'none'] as const) {
      const r = HostCapabilitiesZ.safeParse({ ...wellFormed, subagentSpawn: v });
      expect(r.success).toBe(true);
    }
  });

  it('accepts skillSystem = "native" | "prompted" | "none"', () => {
    for (const v of ['native', 'prompted', 'none'] as const) {
      const r = HostCapabilitiesZ.safeParse({ ...wellFormed, skillSystem: v });
      expect(r.success).toBe(true);
    }
  });

  it('rejects a missing field', () => {
    const { streamingOutput: _drop, ...rest } = wellFormed;
    const r = HostCapabilitiesZ.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it('rejects a wrong union literal on skillSystem', () => {
    const r = HostCapabilitiesZ.safeParse({ ...wellFormed, skillSystem: 'made-up' });
    expect(r.success).toBe(false);
  });

  it('rejects a non-abstract-event in hooks[]', () => {
    const r = HostCapabilitiesZ.safeParse({ ...wellFormed, hooks: ['not-an-event'] });
    expect(r.success).toBe(false);
  });

  it('rejects a non-boolean slashCommands', () => {
    const r = HostCapabilitiesZ.safeParse({ ...wellFormed, slashCommands: 'yes' });
    expect(r.success).toBe(false);
  });
});
