import { describe, expect, it } from 'vitest';
import { findUnfilledSections } from '../../src/handoff/placeholders.js';

const DOC = [
  '## TL;DR for the next session',
  '<!-- 4–6 bullets: where things stand, the single next action, blockers. FILL IN. -->',
  '',
  "## State on handoff   ·  pre-filled — verify, don't retype",
  '- Branch `main` (clean), 0 ahead / 0 behind origin',
  '',
  '## What landed this session',
  '- shipped the thing',
  '',
  '## Next action',
  '<!-- FILL IN -->',
].join('\n');

describe('findUnfilledSections', () => {
  it('AC-4: names each section that still holds a FILL IN marker, once', () => {
    expect(findUnfilledSections(DOC)).toEqual(['TL;DR for the next session', 'Next action']);
  });
  it('AC-4: returns [] for a completed doc', () => {
    expect(findUnfilledSections('## Next action\n**Action:** run x\n')).toEqual([]);
  });
});
