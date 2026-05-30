import { describe, it, expect } from 'vitest';
import { renderDraftBody, frontmatterStatus } from '../../src/parse/draft-scaffold.js';
import type { Spec } from '@manehorizons/cadence-types';

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
