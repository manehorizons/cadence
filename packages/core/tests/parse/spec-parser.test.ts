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
