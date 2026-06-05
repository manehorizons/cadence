import { describe, it, expect } from 'vitest';
import {
  HostCapabilitiesZ,
  AbstractEventZ,
  ADAPTER_CONTRACT_VERSION,
} from '@manehorizons/cadence-types';
import { claudeCodeAdapter } from '../src/index.js';
import { mapEvent, extractPayload } from '../src/event-map.js';
import { claudeCodeCapabilities } from '../src/capabilities.js';

// Every Claude Code hook event name the adapter knows how to translate.
const CLAUDE_CODE_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Stop',
  'SubagentStop',
];

describe('claudeCodeAdapter conforms to HostAdapter (AC-4)', () => {
  it('AC-1: exposes the full typed contract surface', () => {
    // The HostAdapter contract pins six members; the adapter must expose all of
    // them (the compile-time `satisfies` proves the types, this proves shape).
    expect(claudeCodeAdapter).toMatchObject({
      contractVersion: expect.any(Number),
      capabilities: expect.any(Object),
      mapEvent: expect.any(Function),
      extractPayload: expect.any(Function),
      installHooks: expect.any(Function),
      installCommands: expect.any(Function),
    });
  });

  it('AC-4: declares the current contract version', () => {
    expect(claudeCodeAdapter.contractVersion).toBe(ADAPTER_CONTRACT_VERSION);
  });

  it('AC-4: capabilities validate against HostCapabilitiesZ', () => {
    expect(() => HostCapabilitiesZ.parse(claudeCodeAdapter.capabilities)).not.toThrow();
  });

  it('AC-4: wires the real translation + install functions', () => {
    expect(claudeCodeAdapter.mapEvent).toBe(mapEvent);
    expect(claudeCodeAdapter.extractPayload).toBe(extractPayload);
    expect(claudeCodeAdapter.capabilities).toBe(claudeCodeCapabilities);
    expect(typeof claudeCodeAdapter.installHooks).toBe('function');
    expect(typeof claudeCodeAdapter.installCommands).toBe('function');
  });

  it('AC-4: every mapped event is a valid AbstractEvent', () => {
    for (const ev of CLAUDE_CODE_EVENTS) {
      const mapped = claudeCodeAdapter.mapEvent(ev);
      if (mapped !== null) {
        expect(() => AbstractEventZ.parse(mapped)).not.toThrow();
      }
    }
    // The Skill disambiguation path (Phase 23.4) also yields a valid event.
    const skillEvent = claudeCodeAdapter.mapEvent('PostToolUse', 'Skill');
    expect(AbstractEventZ.parse(skillEvent)).toBe('skill-invoke');
  });

  it('AC-6: extractPayload behavior is unchanged (edit-tool path)', () => {
    const payload = claudeCodeAdapter.extractPayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'Edit',
      tool_input: { file_path: '/tmp/x.ts' },
    });
    expect(payload).toEqual({ files: ['/tmp/x.ts'] });
  });
});
