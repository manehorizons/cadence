import { describe, it, expect } from 'vitest';
import { parseChoice } from '../../src/config-edit/parse.js';
import { EDITABLE_FIELDS } from '../../src/config-edit/fields.js';

const profile = EDITABLE_FIELDS[0]!; // choices: strict(1) standard(2) auto(3)

describe('parseChoice', () => {
  // AC-3: a number in range selects that choice's value.
  it('AC-3: numbered input selects the choice', () => {
    expect(parseChoice('1', profile)).toEqual({ value: 'strict' });
    expect(parseChoice('3', profile)).toEqual({ value: 'auto' });
  });

  // AC-3: empty / whitespace keeps the current value.
  it('AC-3: empty input keeps current', () => {
    expect(parseChoice('', profile)).toEqual({ keep: true });
    expect(parseChoice('   ', profile)).toEqual({ keep: true });
  });

  // AC-3: out-of-range and non-numeric input is an error (re-prompt).
  it('AC-3: invalid input returns an error', () => {
    expect(parseChoice('0', profile)).toMatchObject({ error: expect.any(String) });
    expect(parseChoice('9', profile)).toMatchObject({ error: expect.any(String) });
    expect(parseChoice('auto', profile)).toMatchObject({ error: expect.any(String) });
  });
});
