import { describe, it, expect } from 'vitest';
import { setObjective, addAcceptanceCriterion, addTask } from '../../src/parse/draft-mutate.js';
import { parseDraftMd } from '../../src/parse/draft-parser.js';

const DRAFT = `---
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

describe('setObjective (AC-1)', () => {
  it('replaces only the Objective body; parseDraftMd sees the new objective', () => {
    const out = setObjective(DRAFT, 'Make widget sparkle.');
    expect(parseDraftMd(out).objective).toBe('Make widget sparkle.');
  });

  it('leaves every other section byte-identical', () => {
    const out = setObjective(DRAFT, 'Make widget sparkle.');
    const before = parseDraftMd(DRAFT);
    const after = parseDraftMd(out);
    expect(after.acceptanceCriteria).toEqual(before.acceptanceCriteria);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.boundaries).toEqual(before.boundaries);
    expect(after.status).toBe(before.status);
    expect(after.phase).toBe(before.phase);
    expect(after.id).toBe(before.id);
    expect(after.tier).toBe(before.tier);
  });

  it('frontmatter and everything up to Objective is untouched', () => {
    const out = setObjective(DRAFT, 'Make widget sparkle.');
    expect(out.startsWith('---\nphase: 01-foundation\nid: 01-01\ntier: standard\nstatus: PENDING\n---\n\n# 01-01 — Demo\n\n## Objective\n\nMake widget sparkle.\n\n## Acceptance Criteria')).toBe(true);
  });
});

describe('addAcceptanceCriterion (AC-2)', () => {
  it('appends AC-2 with sequential id after the highest existing AC id', () => {
    const out = addAcceptanceCriterion(DRAFT, {
      given: 'a logged-in user',
      when: 'they click save',
      then: 'the record persists',
      name: 'Saves record',
    });
    const d = parseDraftMd(out);
    expect(d.acceptanceCriteria).toHaveLength(2);
    expect(d.acceptanceCriteria[1]).toEqual({
      id: 'AC-2',
      name: 'Saves record',
      given: 'a logged-in user',
      when: 'they click save',
      then: 'the record persists',
    });
    // Original AC-1 untouched.
    expect(d.acceptanceCriteria[0]?.id).toBe('AC-1');
  });

  it('supports an omitted name (empty name, no junk in heading)', () => {
    const out = addAcceptanceCriterion(DRAFT, {
      given: 'g',
      when: 'w',
      then: 't',
    });
    expect(out).toContain('### AC-2: \nGiven g\nWhen w\nThen t');
    const d = parseDraftMd(out);
    expect(d.acceptanceCriteria[1]?.name).toBe('');
  });

  it('leaves Tasks/Boundaries/frontmatter untouched', () => {
    const out = addAcceptanceCriterion(DRAFT, { given: 'g', when: 'w', then: 't' });
    const before = parseDraftMd(DRAFT);
    const after = parseDraftMd(out);
    expect(after.tasks).toEqual(before.tasks);
    expect(after.boundaries).toEqual(before.boundaries);
    expect(after.objective).toBe(before.objective);
  });
});

describe('addTask (AC-3)', () => {
  it('appends T2 with sequential id, backtick files, and given action/verify/done', () => {
    const out = addTask(DRAFT, {
      files: ['src/a.ts', 'src/b.ts'],
      action: 'wire the second flag',
      verify: 'vitest passes',
      done: ['AC-1'],
    });
    const d = parseDraftMd(out);
    expect(d.tasks).toHaveLength(2);
    expect(d.tasks[1]).toMatchObject({
      id: 'T2',
      files: ['src/a.ts', 'src/b.ts'],
      action: 'wire the second flag',
      verify: 'vitest passes',
      done: 'AC-1',
    });
    expect(out).toContain('### T2: \n- files: `src/a.ts`, `src/b.ts`\n- action: wire the second flag\n- verify: vitest passes\n- done: AC-1');
  });

  it('supports multiple done AC ids joined with comma-space', () => {
    const withTwoAcs = addAcceptanceCriterion(DRAFT, { given: 'g', when: 'w', then: 't' });
    const out = addTask(withTwoAcs, {
      files: ['x.ts'],
      action: 'a',
      verify: 'v',
      done: ['AC-1', 'AC-2'],
    });
    const d = parseDraftMd(out);
    expect(d.tasks[1]?.done).toBe('AC-1, AC-2');
  });

  it('AC-3/AC-5: refuses (throws) when a referenced AC id does not exist, and leaves the string unmodified', () => {
    expect(() =>
      addTask(DRAFT, { files: ['x.ts'], action: 'a', verify: 'v', done: ['AC-9'] }),
    ).toThrow(/AC-9/);
  });

  it('does not mutate input on refusal (functions are pure)', () => {
    const before = DRAFT;
    try {
      addTask(DRAFT, { files: ['x.ts'], action: 'a', verify: 'v', done: ['AC-9'] });
    } catch {
      // expected
    }
    expect(DRAFT).toBe(before);
  });

  it('leaves Objective/Boundaries/frontmatter untouched', () => {
    const out = addTask(DRAFT, { files: ['x.ts'], action: 'a', verify: 'v', done: ['AC-1'] });
    const before = parseDraftMd(DRAFT);
    const after = parseDraftMd(out);
    expect(after.objective).toBe(before.objective);
    expect(after.boundaries).toEqual(before.boundaries);
    expect(after.acceptanceCriteria).toEqual(before.acceptanceCriteria);
  });
});

describe('AC-5: round-trip regression', () => {
  it('a draft built entirely via the three helpers parses identically to an equivalent hand-edited draft', () => {
    let out = setObjective(DRAFT, 'Make widget sparkle.');
    out = addAcceptanceCriterion(out, {
      given: 'a logged-in user',
      when: 'they click save',
      then: 'the record persists',
      name: 'Saves record',
    });
    out = addTask(out, {
      files: ['src/save.ts'],
      action: 'implement save',
      verify: 'vitest passes',
      done: ['AC-2'],
    });

    const HAND_EDITED = `---
phase: 01-foundation
id: 01-01
tier: standard
status: PENDING
---

# 01-01 — Demo

## Objective

Make widget sparkle.

## Acceptance Criteria

### AC-1: Glows
Given widget exists
When user enables glow mode
Then widget emits photons

### AC-2: Saves record
Given a logged-in user
When they click save
Then the record persists

## Tasks

### T1: Add glow flag
- files: \`src/widget.ts\`, \`tests/widget.test.ts\`
- action: add boolean glow prop
- verify: vitest passes
- done: AC-1

### T2:
- files: \`src/save.ts\`
- action: implement save
- verify: vitest passes
- done: AC-2

## Boundaries

- Do not change \`src/legacy.ts\`
`;

    expect(parseDraftMd(out)).toEqual(parseDraftMd(HAND_EDITED));
  });
});
