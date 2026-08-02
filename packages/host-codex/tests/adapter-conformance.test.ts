import { describe, it, expect } from 'vitest';
import {
  HostCapabilitiesZ,
  AbstractEventZ,
  ADAPTER_CONTRACT_VERSION,
} from '@thomas-powers-jr/cadence-types';
import { codexAdapter } from '../src/index.js';
import { mapEvent, extractPayload } from '../src/event-map.js';
import { codexCapabilities } from '../src/capabilities.js';

// Every Codex hook event name the adapter knows how to translate.
const CODEX_EVENTS = ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop', 'SubagentStop'];

describe('codexAdapter conforms to HostAdapter (AC-4)', () => {
  it('AC-4: exposes the full typed contract surface', () => {
    expect(codexAdapter).toMatchObject({
      contractVersion: expect.any(Number),
      capabilities: expect.any(Object),
      mapEvent: expect.any(Function),
      extractPayload: expect.any(Function),
      installHooks: expect.any(Function),
      installCommands: expect.any(Function),
    });
  });

  it('AC-4: declares the current contract version', () => {
    expect(codexAdapter.contractVersion).toBe(ADAPTER_CONTRACT_VERSION);
  });

  it('AC-1: capabilities validate against HostCapabilitiesZ', () => {
    expect(() => HostCapabilitiesZ.parse(codexAdapter.capabilities)).not.toThrow();
  });

  it('AC-1: capabilities reflect the Codex environment', () => {
    expect(codexAdapter.capabilities.slashCommands).toBe(true);
    expect(codexAdapter.capabilities.skillSystem).toBe('prompted');
    expect(codexAdapter.capabilities.subagentSpawn).toBe('native');
    expect(codexAdapter.capabilities.blockingHooks).toContain('pre-tool-edit');
  });

  it('AC-4: wires the real translation functions', () => {
    expect(codexAdapter.mapEvent).toBe(mapEvent);
    expect(codexAdapter.extractPayload).toBe(extractPayload);
    expect(codexAdapter.capabilities).toBe(codexCapabilities);
    expect(typeof codexAdapter.installHooks).toBe('function');
    expect(typeof codexAdapter.installCommands).toBe('function');
  });

  it('AC-2/AC-4: every mapped event is a valid AbstractEvent', () => {
    for (const ev of CODEX_EVENTS) {
      const mapped = codexAdapter.mapEvent(ev);
      if (mapped !== null) {
        expect(() => AbstractEventZ.parse(mapped)).not.toThrow();
      }
    }
  });

  it('AC-3: extractPayload recovers apply_patch paths through the adapter', () => {
    const payload = codexAdapter.extractPayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: { input: '*** Begin Patch\n*** Add File: x.ts\n*** End Patch' },
    });
    expect(payload).toEqual({ files: ['x.ts'] });
  });
});
