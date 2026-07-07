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

  // Phase 155 T3 (AC-5) — boundaryEnforcement mirrors the profile override.
  it('AC-5: omits boundaryEnforcement when frontmatter has no `boundaryEnforcement:` field', () => {
    const d = parseDraftMd(SAMPLE);
    expect(d.boundaryEnforcement).toBeUndefined();
  });

  it('AC-5: extracts boundaryEnforcement override when frontmatter includes `boundaryEnforcement: block`', () => {
    const withOverride = SAMPLE.replace(
      'status: PENDING',
      'boundaryEnforcement: block\nstatus: PENDING',
    );
    const d = parseDraftMd(withOverride);
    expect(d.boundaryEnforcement).toBe('block');
  });

  it('AC-5: rejects DRAFT with invalid boundaryEnforcement value', () => {
    const bad = SAMPLE.replace(
      'status: PENDING',
      'boundaryEnforcement: refuse\nstatus: PENDING',
    );
    expect(() => parseDraftMd(bad)).toThrow();
  });
});

// Phase 157 (AC-3, AC-4) — rec-20260704-002: mirrors spec-parser.test.ts's
// multi-line coverage for the draft parser's identical bug shape.
describe('parseDraftMd multi-line preservation (Phase 157)', () => {
  it('AC-3: preserves a multi-line Objective in full', () => {
    const draft = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Make the widget glow.
It must also handle the edge case
where the objective spans multiple sentences.

## Acceptance Criteria

### AC-1: Glows
Given widget exists
When user enables glow mode
Then widget emits photons

## Tasks

### T1: Add glow flag
- files: \`src/widget.ts\`
- action: add boolean glow prop
- verify: vitest passes
- done: AC-1

## Boundaries

- Do not change \`src/legacy.ts\`
`;
    const d = parseDraftMd(draft);
    expect(d.objective).toBe(
      'Make the widget glow.\nIt must also handle the edge case\nwhere the objective spans multiple sentences.',
    );
  });

  it('AC-3: preserves multi-line Given/When/Then clauses', () => {
    const draft = `---
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
Given a precondition that spans
more than one line of prose
When an action happens
across two lines too
Then the outcome is observed
on its own wrapped second line

## Tasks

### T1: Add glow flag
- files: \`src/widget.ts\`
- action: add boolean glow prop
- verify: vitest passes
- done: AC-1

## Boundaries

- Do not change \`src/legacy.ts\`
`;
    const d = parseDraftMd(draft);
    expect(d.acceptanceCriteria).toEqual([
      {
        id: 'AC-1',
        name: 'Glows',
        given: 'a precondition that spans\nmore than one line of prose',
        when: 'an action happens\nacross two lines too',
        then: 'the outcome is observed\non its own wrapped second line',
      },
    ]);
  });

  it('AC-4: existing single-line Objective/AC output is byte-identical', () => {
    const d = parseDraftMd(SAMPLE);
    expect(d.objective).toBe('Make widget glow.');
    expect(d.acceptanceCriteria).toEqual([
      { id: 'AC-1', name: 'Glows', given: 'widget exists', when: 'user enables glow mode', then: 'widget emits photons' },
    ]);
  });

  // Phase 151's name-less-heading fix must survive the AC-3 regex change —
  // this is the same regression coverage shape as draft-mutate.test.ts's own
  // round-trip test, re-asserted here since it shares parseAcceptanceCriteria.
  it('does not regress the phase-151 name-less-heading fix', () => {
    const draft = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Make widget glow.

## Acceptance Criteria

### AC-1:
Given widget exists
When user enables glow mode
Then widget emits photons

## Tasks

### T1: Add glow flag
- files: \`src/widget.ts\`
- action: add boolean glow prop
- verify: vitest passes
- done: AC-1

## Boundaries

- Do not change \`src/legacy.ts\`
`;
    const d = parseDraftMd(draft);
    expect(d.acceptanceCriteria[0]?.name).toBe('');
    expect(d.acceptanceCriteria[0]?.given).toBe('widget exists');
  });
});

describe('task depends: line', () => {
  const DRAFT_WITH_DEPENDS = `---
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
- files: \`src/widget.ts\`
- action: add boolean glow prop
- verify: vitest passes
- done: AC-1

### T2: Wire glow flag into UI
- files: \`src/ui.ts\`
- action: read the glow prop
- verify: vitest passes
- depends: T1
- done: AC-1

## Boundaries

- Do not change \`src/legacy.ts\`
`;

  it('parses a comma-separated depends line onto the task', () => {
    const d = parseDraftMd(DRAFT_WITH_DEPENDS);
    expect(d.tasks[1]?.id).toBe('T2');
    expect(d.tasks[1]?.depends).toEqual(['T1']);
  });

  it('omits depends when the line is absent', () => {
    const d = parseDraftMd(DRAFT_WITH_DEPENDS);
    expect(d.tasks[0]?.depends).toBeUndefined();
  });

  it('splits and trims a multi-id depends line', () => {
    const withTwo = DRAFT_WITH_DEPENDS.replace('- depends: T1', '- depends: T1,  T1b ');
    const d = parseDraftMd(withTwo);
    expect(d.tasks[1]?.depends).toEqual(['T1', 'T1b']);
  });
});
