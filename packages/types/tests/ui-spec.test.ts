import { describe, it, expect } from 'vitest';
import { UiSpecZ, UiComponentZ } from '../src/ui-spec.js';

describe('UiSpecZ', () => {
  it('AC-1: parses a full valid ui-spec', () => {
    const value = {
      schemaVersion: 1,
      id: '205-01',
      phase: '205-ui-spec-gate',
      components: [
        {
          name: 'StructuredWizardShell',
          detail: ['new'],
          layoutTokens: ['spacing-4 between fields'],
          precedent: ['reuse existing shell'],
        },
      ],
      responsiveInteraction: ['collapses to single column below 768px'],
      status: 'PENDING',
    };
    expect(UiSpecZ.parse(value)).toEqual(value);
  });

  it('rejects a component missing required array fields', () => {
    expect(() =>
      UiComponentZ.parse({ name: 'X', detail: [], layoutTokens: [] }),
    ).toThrow();
  });

  it('rejects an unknown status', () => {
    expect(() =>
      UiSpecZ.parse({
        schemaVersion: 1,
        id: '205-01',
        phase: '205-ui-spec-gate',
        components: [],
        responsiveInteraction: [],
        status: 'DRAFT',
      }),
    ).toThrow();
  });
});
