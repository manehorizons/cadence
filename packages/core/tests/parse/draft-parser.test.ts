import { describe, it, expect } from 'vitest';
import { parseDraftMd } from '../../src/parse/draft-parser.js';

const SAMPLE = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Make widget glow.

## Acceptance Criteria

### AC-1: Glows
Given widget exists
When user enables glow mode
Then widget emits photons

## Tasks

### T1: Add glow flag
- files: \`src/widget.ts\`, \`tests/widget.test.ts\`
- action: add boolean glow prop
- verify: vitest passes
- done: AC-1

## Boundaries

- Do not change \`src/legacy.ts\`
`;

describe('parseDraftMd', () => {
  it('extracts frontmatter', () => {
    const d = parseDraftMd(SAMPLE);
    expect(d.id).toBe('01-01');
    expect(d.phase).toBe('01-foundation');
    expect(d.tier).toBe('standard');
    expect(d.status).toBe('PENDING');
  });

  it('extracts title + objective', () => {
    const d = parseDraftMd(SAMPLE);
    expect(d.title).toBe('Demo');
    expect(d.objective).toBe('Make widget glow.');
  });

  it('extracts one AC', () => {
    const d = parseDraftMd(SAMPLE);
    expect(d.acceptanceCriteria).toHaveLength(1);
    expect(d.acceptanceCriteria[0]?.id).toBe('AC-1');
    expect(d.acceptanceCriteria[0]?.then).toMatch(/photons/);
  });

  it('extracts one task with all four fields', () => {
    const d = parseDraftMd(SAMPLE);
    expect(d.tasks).toHaveLength(1);
    const t = d.tasks[0]!;
    expect(t.id).toBe('T1');
    expect(t.files).toEqual(['src/widget.ts', 'tests/widget.test.ts']);
    expect(t.action).toBe('add boolean glow prop');
    expect(t.verify).toBe('vitest passes');
    expect(t.done).toBe('AC-1');
  });

  it('extracts one boundary', () => {
    expect(parseDraftMd(SAMPLE).boundaries).toEqual(['Do not change `src/legacy.ts`']);
  });

  it('omits profile when frontmatter has no `profile:` field', () => {
    const d = parseDraftMd(SAMPLE);
    expect(d.profile).toBeUndefined();
  });

  it('extracts profile override when frontmatter includes `profile: strict`', () => {
    const withProfile = SAMPLE.replace(
      'status: PENDING',
      'profile: strict\nstatus: PENDING',
    );
    const d = parseDraftMd(withProfile);
    expect(d.profile).toBe('strict');
  });

  it('rejects DRAFT with invalid profile value', () => {
    const bad = SAMPLE.replace(
      'status: PENDING',
      'profile: lenient\nstatus: PENDING',
    );
    expect(() => parseDraftMd(bad)).toThrow();
  });
});
