import { describe, it, expect } from 'vitest';
import { runExplain, CONCEPTS } from '../../src/cli/commands/explain.js';
import { bufferIO } from '../../src/services/io.js';

/** The concepts the command advertises in its list, in canonical form. */
const CANONICAL = ['loop', 'gates', 'tiers', 'profiles', 'config'] as const;

describe('cadence explain', () => {
  // AC-1: each named concept prints its explanation body and exits 0.
  it('AC-1: prints the explanation for each named concept', () => {
    const distinctive: Record<string, RegExp> = {
      loop: /DRAFT.*BUILD.*SETTLE/s,
      gates: /13 gates|always-fire/i,
      tiers: /quick-fix|standard|complex/i,
      profiles: /strict|standard|auto/i,
      config: /cadence config explain/i,
    };
    for (const name of CANONICAL) {
      const io = bufferIO();
      const res = runExplain({ concept: name }, io);
      expect(res.exitCode).toBe(0);
      expect(io.stdout()).toMatch(distinctive[name]!);
    }
  });

  // AC-2: bare invocation lists the available concepts with one-line blurbs, exit 0.
  it('AC-2: bare invocation lists available concepts and exits 0', () => {
    const io = bufferIO();
    const res = runExplain({}, io);
    expect(res.exitCode).toBe(0);
    const out = io.stdout();
    for (const name of CANONICAL) {
      expect(out).toContain(name);
    }
    // A blurb line exists for at least one concept (discovery affordance).
    expect(out.split('\n').some((l) => l.includes('loop') && l.length > 'loop'.length + 3)).toBe(true);
  });

  // AC-3: an unknown concept lists the concepts, suggests the nearest match, and exits non-zero.
  it('AC-3: unknown concept lists concepts with a did-you-mean nudge, non-zero exit', () => {
    const io = bufferIO();
    const res = runExplain({ concept: 'gatez' }, io);
    expect(res.exitCode).not.toBe(0);
    const text = io.stdout() + io.stderr();
    expect(text.toLowerCase()).toMatch(/no such concept|unknown concept/);
    expect(text).toMatch(/did you mean.*gates/i);
    for (const name of CANONICAL) {
      expect(text).toContain(name);
    }
  });

  // AC-4: aliases and casing normalize to the canonical concept.
  it('AC-4: resolves aliases and is case-insensitive', () => {
    const cases: Array<[string, RegExp]> = [
      ['gate', /13 gates|always-fire/i],
      ['Profiles', /strict|auto/i],
      ['TIER', /quick-fix/i],
      ['profile', /strict|auto/i],
      ['configuration', /cadence config explain/i],
      ['Config', /cadence config explain/i],
    ];
    for (const [input, expected] of cases) {
      const io = bufferIO();
      const res = runExplain({ concept: input }, io);
      expect(res.exitCode).toBe(0);
      expect(io.stdout()).toMatch(expected);
    }
  });

  // AC-5: every canonical concept in the registry has non-empty body content (drift guard).
  it('AC-5: every advertised concept has non-empty explanation content', () => {
    const names = Object.keys(CONCEPTS);
    // The four scoped concepts must all be present.
    for (const name of CANONICAL) {
      expect(names).toContain(name);
    }
    for (const [name, entry] of Object.entries(CONCEPTS)) {
      expect(entry.blurb.trim().length, `${name} blurb`).toBeGreaterThan(0);
      expect(entry.body.trim().length, `${name} body`).toBeGreaterThan(0);
    }
  });

  // AC-2: the profile × tier → gate-set connection is taught, and points at
  // `cadence config explain` for the reader's concrete set. The concepts form a
  // graph, not four flashcards.
  it('AC-2: teaches the profile × tier → gate-set connection', () => {
    // The connection prose appears in at least one of the three axis concepts.
    const connection = /profile.*tier.*gate set|tier.*profile.*gate set/is;
    const taught = ['profiles', 'tiers', 'gates'].some((name) =>
      connection.test(CONCEPTS[name]!.body),
    );
    expect(taught, 'profile × tier → gate set connection prose').toBe(true);
    // …and the reader is pointed at `cadence config explain` to see the concrete
    // set for their own config.
    const bridged = ['profiles', 'tiers', 'gates', 'config'].some((name) =>
      /cadence config explain/i.test(CONCEPTS[name]!.body),
    );
    expect(bridged, 'bridge to `cadence config explain`').toBe(true);
  });

  // AC-3: every concept cross-links (a "See also" line) so none is an orphan node.
  it('AC-3: every concept cross-links to related concepts (no orphans)', () => {
    for (const [name, entry] of Object.entries(CONCEPTS)) {
      expect(entry.body, `${name} See also`).toMatch(/See also:/i);
    }
  });
});
