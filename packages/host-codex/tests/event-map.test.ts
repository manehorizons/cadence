import { describe, it, expect } from 'vitest';
import { AbstractEventZ } from '@manehorizons/cadence-types';
import { mapEvent, extractPayload } from '../src/event-map.js';

describe('codex event-map', () => {
  // AC-2: Codex hook event names map to cadence abstract events.
  it('AC-2: maps every known Codex event to a valid AbstractEvent', () => {
    const table: Array<[string, string]> = [
      ['SessionStart', 'session-start'],
      ['UserPromptSubmit', 'user-prompt'],
      ['PreToolUse', 'pre-tool-edit'],
      ['PostToolUse', 'post-tool-edit'],
      ['Stop', 'session-stop'],
      ['SubagentStop', 'subagent-result'],
    ];
    for (const [codexEvent, abstract] of table) {
      const mapped = mapEvent(codexEvent);
      expect(mapped).toBe(abstract);
      expect(() => AbstractEventZ.parse(mapped)).not.toThrow();
    }
  });

  // AC-2: an unmapped Codex event returns null (contract allows null).
  it('AC-2: returns null for unmapped events', () => {
    for (const ev of ['PreCompact', 'PostCompact', 'PermissionRequest', 'SubagentStart', 'Bogus']) {
      expect(mapEvent(ev)).toBeNull();
    }
  });

  // AC-3: extractPayload recovers every touched path from an apply_patch envelope.
  it('AC-3: extracts add/update/delete/move paths from apply_patch', () => {
    const patch = [
      '*** Begin Patch',
      '*** Add File: src/new.ts',
      '*** Update File: src/existing.ts',
      '*** Delete File: src/old.ts',
      '*** Update File: src/renamed-from.ts',
      '*** Move to: src/renamed-to.ts',
      '*** End Patch',
    ].join('\n');
    const payload = extractPayload({
      hook_event_name: 'PreToolUse',
      tool_name: 'apply_patch',
      tool_input: { input: patch },
    });
    expect(payload).toEqual({
      files: [
        'src/new.ts',
        'src/existing.ts',
        'src/old.ts',
        'src/renamed-from.ts',
        'src/renamed-to.ts',
      ],
    });
  });

  // AC-3: the parser is robust to which tool_input field carries the patch text
  // (the Codex docs are ambiguous between `input`/`command`).
  it('AC-3: finds the patch envelope regardless of tool_input field name', () => {
    const patch = '*** Begin Patch\n*** Add File: a.ts\n*** End Patch';
    expect(
      extractPayload({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { command: patch } }),
    ).toEqual({ files: ['a.ts'] });
  });

  // AC-3: PostToolUse for apply_patch also extracts (boundary check fires both sides).
  it('AC-3: extracts on PostToolUse too', () => {
    const patch = '*** Begin Patch\n*** Update File: b.ts\n*** End Patch';
    expect(
      extractPayload({ hook_event_name: 'PostToolUse', tool_name: 'apply_patch', tool_input: { input: patch } }),
    ).toEqual({ files: ['b.ts'] });
  });

  // AC-3: non-edit tools and non-tool events yield undefined.
  it('AC-3: returns undefined for Bash, MCP tools, and non-tool events', () => {
    expect(
      extractPayload({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }),
    ).toBeUndefined();
    expect(
      extractPayload({ hook_event_name: 'PreToolUse', tool_name: 'mcp__fs__read', tool_input: {} }),
    ).toBeUndefined();
    expect(extractPayload({ hook_event_name: 'SessionStart' })).toBeUndefined();
    expect(extractPayload(null)).toBeUndefined();
    expect(extractPayload('nope')).toBeUndefined();
  });

  // AC-3: an apply_patch event with no recoverable paths yields undefined, not {files: []}.
  it('AC-3: returns undefined when no patch markers are present', () => {
    expect(
      extractPayload({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', tool_input: { input: 'no markers here' } }),
    ).toBeUndefined();
  });
});
