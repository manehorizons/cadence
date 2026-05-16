import { describe, it, expect } from 'vitest';
import { parseDraftMd } from '../../src/parse/draft-parser.js';

const base = (fm: string) => `---
phase: 34-x
id: 34-01
tier: standard
${fm}---

# 34-01 — t

## Objective
o

## Acceptance Criteria

### AC-1: a
Given g
When w
Then t

## Tasks

### T1: t
- files: \`x.ts\`
- action: a
- verify: v
- done: AC-1

## Boundaries

- none
`;

describe('draft-parser requiredSkills (AC-1)', () => {
  it('AC-1: absent → undefined', () => {
    expect(parseDraftMd(base('')).requiredSkills).toBeUndefined();
  });
  it('AC-1: comma list parsed + trimmed', () => {
    expect(
      parseDraftMd(base('requiredSkills: brainstorming, writing-plans\n')).requiredSkills,
    ).toEqual(['brainstorming', 'writing-plans']);
  });
  it('AC-1: brackets/quotes tolerated, empties dropped', () => {
    expect(
      parseDraftMd(base('requiredSkills: ["tdd", , brainstorming]\n')).requiredSkills,
    ).toEqual(['tdd', 'brainstorming']);
  });
});
