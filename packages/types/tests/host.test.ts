import { describe, it, expect } from 'vitest';
import {
  HostCapabilitiesZ,
  ADAPTER_CONTRACT_VERSION,
  type HostCapabilities,
  type ExtractedPayload,
} from '../src/host.js';

const validCapabilities: HostCapabilities = {
  hooks: [
    'session-start',
    'user-prompt',
    'pre-tool-edit',
    'post-tool-edit',
    'session-stop',
    'subagent-result',
  ],
  slashCommands: true,
  skillSystem: 'native',
  blockingHooks: ['pre-tool-edit', 'session-stop'],
  subagentSpawn: 'native',
  streamingOutput: true,
};

describe('HostCapabilitiesZ (AC-2)', () => {
  it('AC-2: parses a valid HostCapabilities descriptor', () => {
    expect(() => HostCapabilitiesZ.parse(validCapabilities)).not.toThrow();
  });

  it('AC-2: rejects an unknown skillSystem value', () => {
    expect(() =>
      HostCapabilitiesZ.parse({ ...validCapabilities, skillSystem: 'telepathy' }),
    ).toThrow();
  });

  it('AC-2: rejects a hook that is not an AbstractEvent', () => {
    expect(() =>
      HostCapabilitiesZ.parse({ ...validCapabilities, hooks: ['not-an-event'] }),
    ).toThrow();
  });

  it('AC-2: rejects a blockingHook that is not an AbstractEvent', () => {
    expect(() =>
      HostCapabilitiesZ.parse({ ...validCapabilities, blockingHooks: ['nope'] }),
    ).toThrow();
  });
});

describe('ADAPTER_CONTRACT_VERSION (AC-3)', () => {
  it('AC-3: is the integer contract version 1', () => {
    expect(ADAPTER_CONTRACT_VERSION).toBe(1);
  });
});

describe('ExtractedPayload agentId/agentType', () => {
  it('type allows optional agentId/agentType alongside files/skill', () => {
    const payload: ExtractedPayload = { files: ['a.ts'], agentId: 'x', agentType: 'y' };
    expect(payload.agentId).toBe('x');
  });
});
