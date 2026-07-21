import { describe, it, expect } from 'vitest';
import { renderDraftBody, frontmatterStatus } from '../../src/parse/draft-scaffold.js';
import { parseSpecMd } from '../../src/parse/spec-parser.js';
import { parseDraftMd } from '../../src/parse/draft-parser.js';
import type { Spec, UiSpec } from '@manehorizons/cadence-types';

// Verbatim pre-#1b scaffold (draft.ts:77) for phase='p' id='99-01' tier='standard' title='T'.
const LEGACY =
  `---\nphase: p\nid: 99-01\ntier: standard\nstatus: PENDING\n---\n\n` +
  `# 99-01 — T\n\n## Objective\n\n_(one sentence)_\n\n` +
  `## Acceptance Criteria\n\n### AC-1: _(name)_\nGiven _(precondition)_\nWhen _(action)_\nThen _(outcome)_\n\n` +
  `## Tasks\n\n### T1: _(task name)_\n- files: \`path/to/file.ts\`\n- action: _(what to do)_\n- verify: _(how to verify)_\n- done: AC-1\n\n` +
  `## Boundaries\n\n- _(DO NOT change …)_\n`;

const spec1: Spec = {
  schemaVersion: 1,
  id: '99-01',
  phase: 'p',
  objective: 'Build the widget.',
  acceptanceCriteria: [
    { id: 'AC-1', name: 'happy path', given: 'a fresh repo', when: 'run it', then: 'it works' },
  ],
  constraints: [],
  openQuestions: [],
  status: 'APPROVED',
};

describe('renderDraftBody (AC-1)', () => {
  it('AC-1: no spec → byte-identical to the legacy scaffold', () => {
    expect(renderDraftBody('p', '99-01', 'standard', 'T')).toBe(LEGACY);
  });
  it('AC-1: spec → seeds objective + AC (id, name, GWT); tasks/boundaries placeholder; title from arg', () => {
    const out = renderDraftBody('p', '99-01', 'standard', 'My Title', spec1);
    expect(out).toContain('## Objective\n\nBuild the widget.\n');
    expect(out).toContain('### AC-1: happy path\nGiven a fresh repo\nWhen run it\nThen it works');
    expect(out).toContain('# 99-01 — My Title\n');
    expect(out).toContain('### T1: _(task name)_');
    expect(out).toContain('## Boundaries\n\n- _(DO NOT change …)_\n');
    expect(out).not.toContain('_(one sentence)_');
  });
  it('AC-1: multiple ACs render in order, blank-line separated', () => {
    const s: Spec = {
      ...spec1,
      acceptanceCriteria: [
        { id: 'AC-1', name: 'one', given: 'g1', when: 'w1', then: 't1' },
        { id: 'AC-2', name: 'two', given: 'g2', when: 'w2', then: 't2' },
      ],
    };
    const out = renderDraftBody('p', '99-01', 'standard', 'T', s);
    expect(out).toContain(
      '### AC-1: one\nGiven g1\nWhen w1\nThen t1\n\n### AC-2: two\nGiven g2\nWhen w2\nThen t2\n\n## Tasks',
    );
  });
  it('AC-1: empty AC name → "### AC-1: " (no junk)', () => {
    const s: Spec = {
      ...spec1,
      acceptanceCriteria: [{ id: 'AC-1', name: '', given: 'g', when: 'w', then: 't' }],
    };
    expect(renderDraftBody('p', '99-01', 'standard', 'T', s)).toContain('### AC-1: \nGiven g');
  });
});

// Phase 157 (AC-5) — rec-20260704-002: reproduces and closes the exact
// phase-155 discovery scenario. An approved multi-line SPEC.md, fed through
// parseSpecMd → renderDraftBody → parseDraftMd (the real `draft new
// --from-spec` seeding path), must carry its full Objective and AC clause
// text — not just the first line of each — all the way into the parsed
// DRAFT.
describe('SPEC-to-DRAFT round-trip preserves multi-line text (Phase 157, AC-5)', () => {
  it('seeds a DRAFT whose Objective and AC clauses match the original multi-line SPEC', () => {
    const specMd = `---
phase: 157-x
id: 157-01
status: PENDING
---

# 157-01 — t

## Objective

Build the thing correctly.
It must also handle the edge case
where the objective spans multiple sentences.

## Acceptance Criteria

### AC-1: happy path
Given a precondition that spans
more than one line of prose
When an action happens
across two lines too
Then the outcome is observed
on its own wrapped second line
`;
    const spec = parseSpecMd(specMd);
    const draftMd = renderDraftBody('157-x', '157-01', 'standard', 'Seeded', spec);
    const draft = parseDraftMd(draftMd);

    expect(draft.objective).toBe(spec.objective);
    expect(draft.objective).toBe(
      'Build the thing correctly.\nIt must also handle the edge case\nwhere the objective spans multiple sentences.',
    );
    expect(draft.acceptanceCriteria).toEqual(spec.acceptanceCriteria);
    expect(draft.acceptanceCriteria[0]).toEqual({
      id: 'AC-1',
      name: 'happy path',
      given: 'a precondition that spans\nmore than one line of prose',
      when: 'an action happens\nacross two lines too',
      then: 'the outcome is observed\non its own wrapped second line',
    });
  });
});

// rec-20260711-004 (Phase 205, T8) — UI Contract seed from an APPROVED
// sibling UI-SPEC. Mirrors the spec-present-vs-absent structure above.
const UI_SPEC: UiSpec = {
  schemaVersion: 1,
  id: '205-01',
  phase: '205-ui-spec-gate',
  components: [
    {
      name: 'ConfirmDialog',
      detail: ['new'],
      layoutTokens: ['spacing-4 between buttons', 'uses color.border.subtle'],
      precedent: ['reuse existing shell'],
    },
  ],
  responsiveInteraction: ['stacks buttons vertically below 480px'],
  status: 'APPROVED',
};

describe('renderDraftBody — UI Contract seed (rec-20260711-004)', () => {
  it('AC-6: seeds a ## UI Contract section with no nested markdown headings, between Acceptance Criteria and Tasks', () => {
    const body = renderDraftBody('205-ui-spec-gate', '205-01', 'standard', 'demo', undefined, UI_SPEC);
    expect(body).toContain('## UI Contract');
    expect(body.indexOf('## Acceptance Criteria')).toBeLessThan(body.indexOf('## UI Contract'));
    expect(body.indexOf('## UI Contract')).toBeLessThan(body.indexOf('## Tasks'));
    expect(body).toContain('**ConfirmDialog**');
    expect(body).toContain('spacing-4 between buttons');
    expect(body).toContain('**Responsive & Interaction**');
    expect(body).toContain('stacks buttons vertically below 480px');
    // No nested ##/### headings inside the seeded content.
    const uiSection = body.slice(body.indexOf('## UI Contract'), body.indexOf('## Tasks'));
    expect(/\n###? /.test(uiSection)).toBe(false);
  });

  it('AC-6: parseDraftMd round-trip still extracts the four core sections identically with a UI Contract present', () => {
    const body = renderDraftBody('205-ui-spec-gate', '205-01', 'standard', 'demo', undefined, UI_SPEC);
    const withoutUi = renderDraftBody('205-ui-spec-gate', '205-01', 'standard', 'demo');
    const draftWithUi = parseDraftMd(body);
    const draftWithoutUi = parseDraftMd(withoutUi);
    expect(draftWithUi.objective).toBe(draftWithoutUi.objective);
    expect(draftWithUi.acceptanceCriteria).toEqual(draftWithoutUi.acceptanceCriteria);
    expect(draftWithUi.tasks).toEqual(draftWithoutUi.tasks);
    expect(draftWithUi.boundaries).toEqual(draftWithoutUi.boundaries);
  });

  it('omits the UI Contract section when no uiSpec is passed', () => {
    const body = renderDraftBody('205-ui-spec-gate', '205-01', 'standard', 'demo');
    expect(body).not.toContain('## UI Contract');
  });
});

describe('frontmatterStatus (AC-1)', () => {
  it('AC-1: reads status from frontmatter', () => {
    expect(frontmatterStatus('---\nphase: p\nid: 99-01\nstatus: APPROVED\n---\n\n# x')).toBe(
      'APPROVED',
    );
    expect(frontmatterStatus('---\nstatus: PENDING\n---\n')).toBe('PENDING');
  });
  it('AC-1: no frontmatter / no status → undefined', () => {
    expect(frontmatterStatus('# no frontmatter')).toBeUndefined();
    expect(frontmatterStatus('---\nphase: p\n---\n')).toBeUndefined();
  });
});
