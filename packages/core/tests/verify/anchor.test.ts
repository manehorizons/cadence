import { describe, it, expect } from 'vitest';
import type { AcceptanceCriterion, Task, GateProvenance } from '@manehorizons/cadence-types';
import { resolveAnchor } from '../../src/verify/anchor.js';

// Phase 235, T2 — the pure anchor resolver (§7.1 ladder). AC-2: the ladder
// classifies findings by measured criterion strength. AC-3: `executable` is
// derived from real gate provenance, never assumed from the DRAFT alone.

function ac(overrides: Partial<AcceptanceCriterion> = {}): AcceptanceCriterion {
  return {
    id: 'AC-1',
    name: 'Example AC',
    given: 'a precondition',
    when: 'an action occurs',
    then: 'an outcome is observed',
    ...overrides,
  };
}

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'T1',
    name: 'Example task',
    files: ['src/example.ts'],
    action: 'do the thing',
    verify: 'pnpm test -- example.test.ts',
    done: 'AC-1',
    ...overrides,
  };
}

function provenance(overrides: Partial<GateProvenance> = {}): GateProvenance {
  return {
    gate: 'build-test-must-pass',
    status: 'ran',
    ...overrides,
  };
}

describe('resolveAnchor — the four §7.1 tiers (AC-2)', () => {
  it('AC-2: an AC referenced by a task with a runnable verify, corroborated by a ran build-test-must-pass, resolves to executable', () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-1' },
      [ac()],
      [],
      [task()],
      [provenance({ status: 'ran' })],
    );
    expect(anchor).toEqual({ kind: 'ac', ref: 'AC-1', tier: 'executable' });
  });

  it('AC-2: an AC with non-empty given/when/then but no executable-task corroboration resolves to structured', () => {
    const anchor = resolveAnchor({ kind: 'ac', ref: 'AC-1' }, [ac()], [], [], []);
    expect(anchor).toEqual({ kind: 'ac', ref: 'AC-1', tier: 'structured' });
  });

  it('AC-2: an AC with empty when/then resolves to declared, not structured', () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-1' },
      [ac({ when: '', then: '' })],
      [],
      [],
      [],
    );
    expect(anchor).toEqual({ kind: 'ac', ref: 'AC-1', tier: 'declared' });
  });

  it('AC-2: a boundaries[] string resolves to declared with kind boundary', () => {
    const anchor = resolveAnchor(
      { kind: 'boundary', ref: 'DO NOT touch the migration scripts' },
      [],
      ['DO NOT touch the migration scripts'],
      [],
      [],
    );
    expect(anchor).toEqual({
      kind: 'boundary',
      ref: 'DO NOT touch the migration scripts',
      tier: 'declared',
    });
  });

  it('AC-2: no citable criterion resolves to undeclared with kind none and no ref', () => {
    const anchor = resolveAnchor({ kind: 'none' }, [ac()], ['some boundary'], [task()], [
      provenance(),
    ]);
    expect(anchor).toEqual({ kind: 'none', tier: 'undeclared' });
    expect('ref' in anchor).toBe(false);
  });

  it('AC-2: an ac-kind candidate whose ref cites no real AC falls back to undeclared/none rather than fabricating an anchor', () => {
    const anchor = resolveAnchor({ kind: 'ac', ref: 'AC-99' }, [ac()], [], [task()], [
      provenance(),
    ]);
    expect(anchor).toEqual({ kind: 'none', tier: 'undeclared' });
  });

  it('AC-2: a boundary-kind candidate whose ref cites no declared boundary falls back to undeclared/none', () => {
    const anchor = resolveAnchor(
      { kind: 'boundary', ref: 'a boundary nobody declared' },
      [],
      ['a real declared boundary'],
      [],
      [],
    );
    expect(anchor).toEqual({ kind: 'none', tier: 'undeclared' });
  });
});

describe('resolveAnchor — AC-3: executable is derived from real gate provenance, never assumed', () => {
  // Hold the DRAFT constant (one AC, one task referencing it with a
  // non-empty verify command) and vary ONLY the gate provenance passed in.
  const constantAcs = [ac({ id: 'AC-1' })];
  const constantTasks = [task({ id: 'T1', done: 'AC-1', verify: 'pnpm test -- foo.test.ts' })];

  it("AC-3: build-test-must-pass status 'ran' lets the anchor reach executable", () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-1' },
      constantAcs,
      [],
      constantTasks,
      [provenance({ status: 'ran' })],
    );
    expect(anchor.tier).toBe('executable');
  });

  it("AC-3: build-test-must-pass status 'skipped' drops the anchor to structured, never executable", () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-1' },
      constantAcs,
      [],
      constantTasks,
      [provenance({ status: 'skipped', skipReason: 'not in gate set' })],
    );
    expect(anchor.tier).not.toBe('executable');
    expect(anchor.tier).toBe('structured');
  });

  it("AC-3: build-test-must-pass status 'refused' drops the anchor to structured, never executable", () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-1' },
      constantAcs,
      [],
      constantTasks,
      [provenance({ status: 'refused', reason: 'test command failed' })],
    );
    expect(anchor.tier).not.toBe('executable');
    expect(anchor.tier).toBe('structured');
  });

  it('AC-3: a missing build-test-must-pass provenance entry drops the anchor to structured, never executable', () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-1' },
      constantAcs,
      [],
      constantTasks,
      // Provenance array present but with no build-test-must-pass entry at all.
      [provenance({ gate: 'coherence-check', status: 'ran' })],
    );
    expect(anchor.tier).not.toBe('executable');
    expect(anchor.tier).toBe('structured');
  });

  it('AC-3: an empty provenance array (no gates ran this settle) also drops the anchor to structured, never executable', () => {
    const anchor = resolveAnchor({ kind: 'ac', ref: 'AC-1' }, constantAcs, [], constantTasks, []);
    expect(anchor.tier).not.toBe('executable');
    expect(anchor.tier).toBe('structured');
  });
});

describe('resolveAnchor — task verify must be a runnable (non-empty) command for the executable condition', () => {
  it('an AC referenced only by a task with an empty verify never reaches executable, even when build-test-must-pass ran', () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-1' },
      [ac({ id: 'AC-1' })],
      [],
      [task({ id: 'T1', done: 'AC-1', verify: '   ' })],
      [provenance({ status: 'ran' })],
    );
    expect(anchor.tier).toBe('structured');
  });

  it('an AC not referenced by any task (done points elsewhere) never reaches executable, even when build-test-must-pass ran', () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-1' },
      [ac({ id: 'AC-1' })],
      [],
      [task({ id: 'T1', done: 'AC-2', verify: 'pnpm test' })],
      [provenance({ status: 'ran' })],
    );
    expect(anchor.tier).toBe('structured');
  });
});

describe('resolveAnchor — anchor-shopping: a vague AC must never earn more than its measured tier (AC-2, §7.1)', () => {
  it('a vague, fully-structured AC ("the API should be secure") earns structured, not executable, absent real corroboration', () => {
    const vague = ac({
      id: 'AC-9',
      name: 'Security',
      given: 'the API exists',
      when: 'it is used',
      then: 'the API should be secure',
    });
    const anchor = resolveAnchor({ kind: 'ac', ref: 'AC-9' }, [vague], [], [], []);
    expect(anchor.tier).toBe('structured');
    expect(anchor.tier).not.toBe('executable');
  });

  it('a vague AC referenced by a task and corroborated by a ran build-test-must-pass DOES earn executable — the resolver measures facts, not prose quality, and the two-condition test is the only gate', () => {
    const vague = ac({
      id: 'AC-9',
      given: 'the API exists',
      when: 'it is used',
      then: 'the API should be secure',
    });
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-9' },
      [vague],
      [],
      [task({ id: 'T1', done: 'AC-9', verify: 'pnpm test -- security.test.ts' })],
      [provenance({ status: 'ran' })],
    );
    // This is the tier the measured facts genuinely earn — not proof the
    // finding is well-anchored in substance. Anchor-shopping resistance
    // lives in never inflating BEYOND what these facts support, which the
    // next assertion checks: no amount of vague prose can shortcut past a
    // real task+provenance pair to reach a tier it hasn't earned, and no
    // amount of vague prose alone (without task+provenance) can reach
    // executable either, per the two prior tests in this block.
    expect(anchor.tier).toBe('executable');
  });

  it('a vague AC with NO structure at all (empty when/then) never rises above declared, no matter how alarming its message would be downstream', () => {
    const vague = ac({ id: 'AC-9', given: 'the API should be secure', when: '', then: '' });
    const anchor = resolveAnchor({ kind: 'ac', ref: 'AC-9' }, [vague], [], [], []);
    expect(anchor.tier).toBe('declared');
  });
});

/**
 * Regression: a task's `done:` field is a comma-separated LIST, and may carry
 * trailing annotation text (`AC-4 (core logic)`). Matching it against an AC id
 * with string equality makes `executable` unreachable for every multi-AC task
 * — which is most tasks in practice (this phase's own DRAFT has three, e.g.
 * `- done: AC-2, AC-3`). The failure is silent and in the "safe" direction (a
 * quiet under-claim to `structured`), which is exactly why it needs a test
 * rather than trust. `parse/ac-refs.ts` is the canonical splitter; this block
 * pins that it is actually used.
 */
describe('resolveAnchor — task done: is a comma-separated AC list, not a single id (AC-3)', () => {
  it('AC-3: an AC cited second in a multi-AC done: list still reaches executable', () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-3' },
      [ac({ id: 'AC-3' })],
      [],
      [task({ done: 'AC-2, AC-3' })],
      [provenance({ status: 'ran' })],
    );
    expect(anchor).toEqual({ kind: 'ac', ref: 'AC-3', tier: 'executable' });
  });

  it('AC-3: an AC cited first in a multi-AC done: list still reaches executable', () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-2' },
      [ac({ id: 'AC-2' })],
      [],
      [task({ done: 'AC-2, AC-3' })],
      [provenance({ status: 'ran' })],
    );
    expect(anchor.tier).toBe('executable');
  });

  it('AC-3: a done: entry carrying trailing annotation text still counts as a citation', () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-4' },
      [ac({ id: 'AC-4' })],
      [],
      [task({ done: 'AC-4 (core logic)' })],
      [provenance({ status: 'ran' })],
    );
    expect(anchor.tier).toBe('executable');
  });

  it('AC-3: an AC absent from a multi-AC done: list does NOT reach executable via a sibling citation', () => {
    const anchor = resolveAnchor(
      { kind: 'ac', ref: 'AC-7' },
      [ac({ id: 'AC-7' })],
      [],
      [task({ done: 'AC-2, AC-3' })],
      [provenance({ status: 'ran' })],
    );
    // Structured G/W/T from the fixture, but no task cites AC-7 — so the
    // executable condition must fail rather than borrow AC-2/AC-3's task.
    expect(anchor.tier).toBe('structured');
  });
});
