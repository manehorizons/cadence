import { describe, it, expect } from 'vitest';
import { CLAUDE_CODE_EXPECTED_HOOKS as TOOLKIT_EXPECTED_HOOKS } from '@thomas-powers-jr/cadence-host-toolkit';
import { CLAUDE_CODE_EXPECTED_HOOKS as CORE_EXPECTED_HOOKS } from '@thomas-powers-jr/cadence-core';

/**
 * Phase 295 (AC-5): `install.ts` (this package) builds its `desired` hook
 * map from `@thomas-powers-jr/cadence-host-toolkit`'s `CLAUDE_CODE_EXPECTED_HOOKS`;
 * `cadence doctor`'s `checkHostHooks` (core) holds its own independent copy,
 * since core cannot import host-toolkit or any host-adapter package. This
 * package already depends on both, so it is where the two get pinned
 * against each other — the Slice-4 `COMMAND_GUIDANCE`-vs-`COMMANDS`
 * precedent (packages/host-toolkit/tests/routing.test.ts) applied to this
 * pair. If either list gains, loses, or changes an entry without the other
 * following, this test fails instead of the installer and the doctor check
 * silently disagreeing about what "fully installed" means.
 */
function sortedKey(list: readonly { event: string; matcher: string | null }[]): string[] {
  return list.map((e) => `${e.event}::${e.matcher ?? ''}`).sort();
}

describe('295-01/AC-5: host-toolkit and core agree on the expected Claude Code hook set', () => {
  it('the two independently-held lists describe the same (event, matcher) pairs', () => {
    expect(sortedKey(CORE_EXPECTED_HOOKS)).toEqual(sortedKey(TOOLKIT_EXPECTED_HOOKS));
  });

  it('the set matches what this repo actually needs (sanity, not just self-consistency)', () => {
    expect(sortedKey(TOOLKIT_EXPECTED_HOOKS)).toEqual(
      [
        'PostToolUse::Edit|Write|MultiEdit|NotebookEdit',
        'PostToolUse::Skill',
        'PreToolUse::Edit|Write|MultiEdit|NotebookEdit',
        'SessionStart::',
        'Stop::',
        'SubagentStart::',
        'SubagentStop::',
        'UserPromptSubmit::',
      ].sort(),
    );
  });
});
