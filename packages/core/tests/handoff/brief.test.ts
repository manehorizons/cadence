import { describe, expect, it } from 'vitest';
import { extractBriefSections } from '../../src/handoff/brief.js';

const DOC = [
  '# Session Handoff — demo',
  '',
  '## TL;DR for the next session',
  '- ship it',
  '',
  "## State on handoff   ·  pre-filled — verify, don't retype",
  '- Branch: main',
  '',
  '## CADENCE context   ·  pre-filled from `cadence context handoff`',
  '- heavy block',
  '',
  '## What landed this session',
  '- narrative',
  '',
  '## Carry-forward gotchas',
  '- Stashed as: stash@{0}',
  '',
  '## Next action',
  '**Action:** do the thing',
  '',
].join('\n');

describe('extractBriefSections', () => {
  it('AC-21: keeps brief sections and drops the heavy ones', () => {
    const out = extractBriefSections(DOC);
    expect(out).toContain('## TL;DR for the next session');
    expect(out).toContain('## State on handoff');
    expect(out).toContain('## Carry-forward gotchas');
    expect(out).toContain('## Next action');
    expect(out).not.toContain('## CADENCE context');
    expect(out).not.toContain('## What landed this session');
  });

  it('AC-28: preserves a Stashed-as line inside Carry-forward gotchas', () => {
    expect(extractBriefSections(DOC)).toContain('Stashed as: stash@{0}');
  });

  it('AC-27: keeps Quick resume commands when present (pre-1.5 fallback anchor)', () => {
    const legacy = '# Old\n\n## Quick resume commands\n- npm test\n';
    expect(extractBriefSections(legacy)).toContain('## Quick resume commands');
  });

  it('AC-27: returns full content unchanged when no brief section matches', () => {
    const none = '# Old\n\n## Summary\n- stuff\n';
    expect(extractBriefSections(none)).toBe(none);
  });
});
