import { describe, it, expect } from 'vitest';
import { resolveInteractivity } from '../../src/gates/interactivity.js';

/**
 * AC-1 — the pure interactivity resolver covers the full env/TTY table.
 * `CADENCE_REQUIRE_TTY` wins over `CADENCE_NONINTERACTIVE`; with neither set the
 * mode follows `isTTY`. No I/O.
 */
describe('resolveInteractivity (AC-1)', () => {
  it('returns require-tty whenever CADENCE_REQUIRE_TTY=1, regardless of the others', () => {
    expect(resolveInteractivity({ CADENCE_REQUIRE_TTY: '1' }, true)).toBe('require-tty');
    expect(resolveInteractivity({ CADENCE_REQUIRE_TTY: '1' }, false)).toBe('require-tty');
    expect(
      resolveInteractivity({ CADENCE_REQUIRE_TTY: '1', CADENCE_NONINTERACTIVE: '1' }, false),
    ).toBe('require-tty');
  });

  it('returns bypass when CADENCE_NONINTERACTIVE=1 and REQUIRE_TTY is unset (even under a TTY)', () => {
    expect(resolveInteractivity({ CADENCE_NONINTERACTIVE: '1' }, true)).toBe('bypass');
    expect(resolveInteractivity({ CADENCE_NONINTERACTIVE: '1' }, false)).toBe('bypass');
  });

  it('follows isTTY when neither override is set', () => {
    expect(resolveInteractivity({}, true)).toBe('interactive');
    expect(resolveInteractivity({}, false)).toBe('bypass');
  });

  it('honors a scripted prompter (never bypasses a CADENCE_PROMPTER_SCRIPT run, even non-TTY)', () => {
    expect(resolveInteractivity({ CADENCE_PROMPTER_SCRIPT: 'y' }, false)).toBe('interactive');
    expect(resolveInteractivity({ CADENCE_PROMPTER_SCRIPT: '' }, false)).toBe('interactive');
    // script wins even over the override env vars — explicit answers are supplied
    expect(
      resolveInteractivity(
        { CADENCE_PROMPTER_SCRIPT: 'n', CADENCE_NONINTERACTIVE: '1', CADENCE_REQUIRE_TTY: '1' },
        false,
      ),
    ).toBe('interactive');
  });

  it('treats only "1" as the truthy override value (a stray empty/other value does not trigger)', () => {
    expect(resolveInteractivity({ CADENCE_REQUIRE_TTY: '' }, false)).toBe('bypass');
    expect(resolveInteractivity({ CADENCE_NONINTERACTIVE: '0' }, true)).toBe('interactive');
  });
});
