import { describe, it, expect } from 'vitest';
import { satisfies, missingSkills } from '../../src/verify/skill-match.js';

describe('skill-match (AC-2)', () => {
  it('AC-2: exact match', () => {
    expect(satisfies('brainstorming', ['brainstorming'])).toBe(true);
  });
  it('AC-2: namespace-suffix match (plugin-qualified invoked)', () => {
    expect(satisfies('brainstorming', ['superpowers:brainstorming'])).toBe(true);
    expect(satisfies('caveman', ['caveman:caveman'])).toBe(true);
  });
  it('AC-2: no loose substring / no false positive', () => {
    expect(satisfies('brain', ['superpowers:brainstorming'])).toBe(false);
    expect(satisfies('storming', ['superpowers:brainstorming'])).toBe(false);
  });
  it('AC-2: case-sensitive', () => {
    expect(satisfies('Brainstorming', ['brainstorming'])).toBe(false);
  });
  it('AC-2: empty invoked → unsatisfied', () => {
    expect(satisfies('tdd', [])).toBe(false);
  });
  it('AC-2: missingSkills returns only unsatisfied', () => {
    expect(missingSkills(['a', 'b'], ['superpowers:a'])).toEqual(['b']);
    expect(missingSkills([], ['x'])).toEqual([]);
  });
});
