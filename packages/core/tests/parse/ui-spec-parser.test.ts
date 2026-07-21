import { describe, it, expect } from 'vitest';
import { parseUiSpecMd, renderUiSpecScaffold } from '../../src/parse/ui-spec-parser.js';

const FULL = `---
phase: 205-ui-spec-gate
id: 205-01
status: PENDING
---

# 205-01 — demo

## Components

### StructuredWizardShell
- modified
- adds a fourth step

#### Layout & Tokens
- spacing-4 between fields
- uses \`color.border.subtle\` for dividers

#### Precedent References
- reuse StructuredWizardShell's visual language

### ConfirmDialog
- new

#### Layout & Tokens
- (none yet)

#### Precedent References
- (none)

## Responsive & Interaction
- collapses to single column below 768px
- shows a spinner in the confirm button while pending
`;

describe('parseUiSpecMd', () => {
  it('AC-1: parses nested per-component Layout & Tokens / Precedent References', () => {
    const spec = parseUiSpecMd(FULL);
    expect(spec.id).toBe('205-01');
    expect(spec.phase).toBe('205-ui-spec-gate');
    expect(spec.status).toBe('PENDING');
    expect(spec.components).toHaveLength(2);
    expect(spec.components[0]).toEqual({
      name: 'StructuredWizardShell',
      detail: ['modified', 'adds a fourth step'],
      layoutTokens: ['spacing-4 between fields', 'uses `color.border.subtle` for dividers'],
      precedent: ["reuse StructuredWizardShell's visual language"],
    });
    expect(spec.responsiveInteraction).toEqual([
      'collapses to single column below 768px',
      'shows a spinner in the confirm button while pending',
    ]);
  });

  it('parses zero components as an empty array, not a throw', () => {
    const raw = `---\nphase: p\nid: 205-02\nstatus: PENDING\n---\n\n# 205-02 — empty\n\n## Components\n\n## Responsive & Interaction\n`;
    const spec = parseUiSpecMd(raw);
    expect(spec.components).toEqual([]);
    expect(spec.responsiveInteraction).toEqual([]);
  });

  it('throws on missing frontmatter', () => {
    expect(() => parseUiSpecMd('# no frontmatter\n')).toThrow();
  });
});

describe('renderUiSpecScaffold', () => {
  it('AC-1: round-trips through parseUiSpecMd as an empty-but-valid PENDING ui-spec', () => {
    const body = renderUiSpecScaffold('205-ui-spec-gate', '205-01');
    const spec = parseUiSpecMd(body);
    expect(spec.status).toBe('PENDING');
    expect(spec.components).toHaveLength(1); // the placeholder component block
    expect(spec.responsiveInteraction).toHaveLength(1); // the placeholder bullet
  });
});
