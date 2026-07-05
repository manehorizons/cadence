import { describe, it, expect } from 'vitest';
import { parseSpecMd } from '../../src/parse/spec-parser.js';

const SPEC = `---
phase: 36-x
id: 36-01
status: PENDING
---

# 36-01 — t

## Objective

Build the thing.

## Acceptance Criteria

### AC-1: a
Given g
When w
Then t

## Constraints

- no new deps
- host-agnostic

## Open Questions

- which provider default?
`;

describe('parseSpecMd (AC-2)', () => {
  it('AC-2: parses objective/AC/constraints/openQuestions', () => {
    const s = parseSpecMd(SPEC);
    expect(s.objective).toBe('Build the thing.');
    expect(s.acceptanceCriteria).toEqual([{ id: 'AC-1', name: 'a', given: 'g', when: 'w', then: 't' }]);
    expect(s.constraints).toEqual(['no new deps', 'host-agnostic']);
    expect(s.openQuestions).toEqual(['which provider default?']);
    expect(s.status).toBe('PENDING');
    expect(s.id).toBe('36-01');
    expect(s.phase).toBe('36-x');
  });
  it('AC-2: absent optional sections → []', () => {
    const bare = `---
phase: 36-x
id: 36-01
status: PENDING
---

# 36-01 — t

## Objective

O

## Acceptance Criteria

### AC-1: a
Given g
When w
Then t
`;
    const s = parseSpecMd(bare);
    expect(s.constraints).toEqual([]);
    expect(s.openQuestions).toEqual([]);
  });
});

// Phase 157 (AC-1, AC-2, AC-4) — rec-20260704-002: multi-line Objective/AC
// clauses were silently truncated to their first line.
describe('parseSpecMd multi-line preservation (Phase 157)', () => {
  it('AC-1: preserves a multi-line Objective in full', () => {
    const spec = `---
phase: 36-x
id: 36-01
status: PENDING
---

# 36-01 — t

## Objective

Build the thing correctly.
It must also handle the edge case
where input spans multiple sentences.

## Acceptance Criteria

### AC-1: a
Given g
When w
Then t
`;
    const s = parseSpecMd(spec);
    expect(s.objective).toBe(
      'Build the thing correctly.\nIt must also handle the edge case\nwhere input spans multiple sentences.',
    );
  });

  it('AC-2: preserves multi-line Given/When/Then clauses', () => {
    const spec = `---
phase: 36-x
id: 36-01
status: PENDING
---

# 36-01 — t

## Objective

Build the thing.

## Acceptance Criteria

### AC-1: a
Given a precondition that spans
more than one line of prose
When an action happens
across two lines too
Then the outcome is observed
on its own wrapped second line
`;
    const s = parseSpecMd(spec);
    expect(s.acceptanceCriteria).toEqual([
      {
        id: 'AC-1',
        name: 'a',
        given: 'a precondition that spans\nmore than one line of prose',
        when: 'an action happens\nacross two lines too',
        then: 'the outcome is observed\non its own wrapped second line',
      },
    ]);
  });

  it('AC-2: a wrapped clause stops at the next label, not mid-clause', () => {
    const spec = `---
phase: 36-x
id: 36-01
status: PENDING
---

# 36-01 — t

## Objective

Build the thing.

## Acceptance Criteria

### AC-1: a
Given g1
g2
When w1
w2
Then t1
t2

### AC-2: b
Given g
When w
Then t
`;
    const s = parseSpecMd(spec);
    expect(s.acceptanceCriteria).toEqual([
      { id: 'AC-1', name: 'a', given: 'g1\ng2', when: 'w1\nw2', then: 't1\nt2' },
      { id: 'AC-2', name: 'b', given: 'g', when: 'w', then: 't' },
    ]);
  });

  it('AC-4: existing single-line Objective/AC output is byte-identical', () => {
    const s = parseSpecMd(SPEC);
    expect(s.objective).toBe('Build the thing.');
    expect(s.acceptanceCriteria).toEqual([{ id: 'AC-1', name: 'a', given: 'g', when: 'w', then: 't' }]);
  });
});
