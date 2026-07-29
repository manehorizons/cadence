import { describe, it, expect } from 'vitest';
import type { AcceptanceCriterion, Draft, GateProvenance, Task } from '@manehorizons/cadence-types';
import { MockCodeReviewVerifier } from '../../src/verify/code-review.js';
import type { Finding } from '../../src/verify/code-review.js';
import { resolveAnchor } from '../../src/verify/anchor.js';
import { anchorFindings } from '../../src/verify/criteria-gap.js';
import { runCodeReviewGate } from '../../src/gates/code-review.js';
import type { SettleContext } from '../../src/gates/types.js';
import type { CodeReviewResult } from '../../src/contracts/index.js';

/**
 * Phase 235 (T5) — §6 Slice 3 adversarial corpus, proven offline and
 * deterministic (mock provider only, no live network calls).
 *
 * Two test levels are used deliberately, per a known, filed limitation
 * (`rec-20260729-002`): `SettleContext` does not expose prior-gate
 * provenance to a single `GateImpl`, so `gates/code-review.ts` always calls
 * `anchorFindings(..., [])` — the `executable` tier can never actually occur
 * end-to-end through `runCodeReviewGate` today.
 *
 *  - UNIT level (`resolveAnchor` / `anchorFindings` called directly with an
 *    injected `GateProvenance[]`): the only way to reach `executable` today.
 *    Used for: "defect with executable AC", and the corroborated half of the
 *    anchor-shopping case.
 *  - GATE level (`runCodeReviewGate` over a `SettleContext` whose
 *    `codeReview` verifier is a real `MockCodeReviewVerifier` fed a
 *    synthetic diff): everything reachable in production today — structured,
 *    boundary, undeclared/gap, the non-blocking trivial finding, the
 *    uncorroborated half of anchor-shopping, and the AC-5 round trip.
 */

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
  return { gate: 'build-test-must-pass', status: 'ran', ...overrides };
}

function baseDraft(overrides: Partial<Draft> = {}): Draft {
  return {
    schemaVersion: 1,
    id: '235-01',
    phase: '235-criteria-anchored-review-input',
    tier: 'standard',
    title: 'criteria-anchored review verifier',
    objective: 'corpus proof',
    acceptanceCriteria: [],
    tasks: [],
    boundaries: [],
    status: 'IN_PROGRESS',
    ...overrides,
  };
}

/** Same GATE-level ctx shape used by the sibling T3/T4 test files
 *  (`code-review-criteria-input.test.ts`, `code-review-criteria-gap.test.ts`) —
 *  kept local rather than shared, matching their own convention. */
function buildCtx(over: {
  draft: Draft;
  findings: Record<string, Finding[]>;
  touchedFiles?: string[];
  allowCodeReviewFailure?: boolean;
  errs?: string[];
}): SettleContext {
  const errs = over.errs ?? [];
  const opts: Record<string, boolean> = {};
  if (over.allowCodeReviewFailure) opts.allowCodeReviewFailure = true;
  const result: CodeReviewResult = { findings: over.findings, provider: 'mock' };
  return {
    cwd: '/x',
    state: {
      draftReadAt: null,
      activePhase: '235-criteria-anchored-review-input',
      activeDraft: '235-01',
    } as never,
    draft: over.draft,
    progress: { draftId: '235-01', tasks: {} },
    config: { convergence: { maxAttempts: 3 } } as never,
    gateSet: { gates: ['code-review'], softCap: false } as never,
    opts,
    explicitIds: new Set<string>(),
    touchedFiles: over.touchedFiles ?? Object.keys(over.findings),
    coverage: async () => new Map(),
    draftMtimeMs: async () => null,
    diff: () => 'DIFF',
    verifiers: {
      deep: { verify: async () => ({ verdicts: {}, provider: 'mock' }) },
      codeReview: { verify: async () => result },
    },
    emit: {
      anomalies: async () => {},
      codeReviewHigh: async () => {},
      codeReviewUnconverged: async () => {},
    },
    runner: { test: async () => ({ ran: false, ok: true }) },
    prompter: { create: () => ({ ask: async () => '' }) },
    codeReviewSidecar: {
      read: async () => ({ attemptsSoFar: 0, history: [] }),
      write: async () => {},
    },
    io: { err: (s: string) => errs.push(s) },
  } as unknown as SettleContext;
}

describe('MockCodeReviewVerifier — extra-marker seam is additive (phase 235 T5)', () => {
  it('a marker written with the g flag still matches every line independently (RegExp lastIndex is stateful)', async () => {
    // Regression guard for a latent footgun surfaced by independent review: a
    // `/pattern/g` RegExp advances `lastIndex` on each `.test()`, so without a
    // reset this marker would match line 1, MISS line 2, match line 3, ... —
    // silently producing a corpus fixture that half-works. `/g` is an
    // idiomatic habit, and this seam is test infrastructure other authors will
    // copy, so the failure has to be impossible rather than merely documented.
    const v = new MockCodeReviewVerifier({
      extraMarkers: [{ pattern: /todo/g, severity: 'medium', message: 'TODO left in source' }],
    });
    const diff = [
      '--- a/src/g.ts',
      '+++ b/src/g.ts',
      '@@ -1,0 +1,3 @@',
      '+todo one',
      '+todo two',
      '+todo three',
    ].join('\n');
    const res = await v.verify({ files: ['src/g.ts'], diff });
    // All three added lines must be flagged, at their true post-image lines.
    expect(res.findings['src/g.ts']).toHaveLength(3);
    expect(res.findings['src/g.ts']?.map((f) => f.line)).toEqual([1, 2, 3]);
  });

  it('zero-config behavior (no options) is unchanged: only console.log is flagged, as a HIGH finding at the correct post-image line', async () => {
    const v = new MockCodeReviewVerifier();
    const diff = [
      '--- a/src/f.ts',
      '+++ b/src/f.ts',
      '@@ -1,2 +1,3 @@',
      ' unchanged line',
      '+const x = 1;',
      '+console.log(x);',
    ].join('\n');
    const res = await v.verify({ files: ['src/f.ts'], diff });
    expect(res.findings).toEqual({
      'src/f.ts': [{ severity: 'high', message: 'console.log left in source', line: 3 }],
    });
  });

  it('an empty diff still returns no findings with extraMarkers configured (opt-in never fires on nothing)', async () => {
    const v = new MockCodeReviewVerifier({
      extraMarkers: [{ pattern: /DEFECT_TRIVIAL\(/, severity: 'low', message: 'trivial defect' }],
    });
    const res = await v.verify({ files: [], diff: '' });
    expect(res.findings).toEqual({});
  });

  it('extraMarkers emit findings at their own configured severity, additively alongside the untouched console.log rule', async () => {
    const v = new MockCodeReviewVerifier({
      extraMarkers: [
        { pattern: /DEFECT_TRIVIAL\(/, severity: 'low', message: 'trivial defect' },
        { pattern: /DEFECT_GAP\(/, severity: 'high', message: 'uncovered defect' },
      ],
    });
    const diff = [
      '+++ b/src/f.ts',
      '@@ -0,0 +1,3 @@',
      '+console.log("x");',
      '+DEFECT_TRIVIAL(1);',
      '+DEFECT_GAP(2);',
    ].join('\n');
    const res = await v.verify({ files: ['src/f.ts'], diff });
    expect(res.findings['src/f.ts']).toEqual([
      { severity: 'high', message: 'console.log left in source', line: 1 },
      { severity: 'low', message: 'trivial defect', line: 2 },
      { severity: 'high', message: 'uncovered defect', line: 3 },
    ]);
  });
});

describe('§6 Slice 3 corpus case 1 — defect with an executable AC (UNIT level: executable is unreachable through the live gate today, rec-20260729-002)', () => {
  it('AC-6: a finding on a file covered by a task->AC citation with a runnable verify, corroborated by an injected ran build-test-must-pass, anchors at executable', () => {
    const acceptanceCriteria = [ac({ id: 'AC-1', name: 'covered work' })];
    const tasks = [task({ id: 'T1', files: ['src/executable.ts'], done: 'AC-1', verify: 'pnpm test -- executable.test.ts' })];
    const gateProvenance = [provenance({ status: 'ran' })];

    const findings: Record<string, Finding[]> = {
      'src/executable.ts': [{ severity: 'high', message: 'defect on executable-covered file', line: 5 }],
    };
    const result = anchorFindings(findings, acceptanceCriteria, [], tasks, gateProvenance);
    const anchored = result.findings['src/executable.ts']![0]!;
    expect(anchored.anchor).toEqual({ kind: 'ac', ref: 'AC-1', tier: 'executable' });
    expect(result.summary.gapCount).toBe(0);
  });
});

describe('§6 Slice 3 corpus case 2 — defect with a structured-only AC (GATE level)', () => {
  it('AC-6: a finding on a file covered by a task->AC citation lands at structured through the live gate (no provenance corroboration is threaded there today)', async () => {
    const draft = baseDraft({
      acceptanceCriteria: [ac({ id: 'AC-1', name: 'structured coverage' })],
      tasks: [task({ id: 'T1', files: ['src/structured.ts'], done: 'AC-1', verify: 'pnpm test -- structured.test.ts' })],
    });
    const findings: Record<string, Finding[]> = {
      'src/structured.ts': [{ severity: 'medium', message: 'structured-covered defect', line: 3 }],
    };
    const res = await runCodeReviewGate(buildCtx({ draft, findings }));
    const anchored = res.summaryPatch!.codeReview!['src/structured.ts']![0]!;
    expect(anchored.anchor).toEqual({ kind: 'ac', ref: 'AC-1', tier: 'structured' });
    // structured is weaker than executable — a weak anchor, not a gap.
    expect(anchored.anchor!.tier).not.toBe('undeclared');
    expect(anchored.anchor!.tier).not.toBe('executable');
  });
});

describe('§6 Slice 3 corpus case 3 — defect with a boundary-string anchor (GATE level)', () => {
  it('AC-6: a finding on a file named (exactly) in boundaries[] anchors at declared/boundary', async () => {
    const draft = baseDraft({ boundaries: ['DO NOT touch src/legacy.ts'] });
    const findings: Record<string, Finding[]> = {
      'src/legacy.ts': [{ severity: 'medium', message: 'boundary-covered defect' }],
    };
    const res = await runCodeReviewGate(buildCtx({ draft, findings }));
    const anchored = res.summaryPatch!.codeReview!['src/legacy.ts']![0]!;
    expect(anchored.anchor).toEqual({
      kind: 'boundary',
      ref: 'DO NOT touch src/legacy.ts',
      tier: 'declared',
    });
  });
});

describe('§6 Slice 3 corpus case 4 — defect with no anchor at all (GATE level)', () => {
  it('AC-4/AC-6: a finding on a file no task or boundary covers is a criteria gap ({ kind: "none", tier: "undeclared" })', async () => {
    const draft = baseDraft();
    const findings: Record<string, Finding[]> = {
      'src/unowned.ts': [{ severity: 'high', message: 'unanchored defect', line: 1 }],
    };
    const res = await runCodeReviewGate(buildCtx({ draft, findings }));
    const anchored = res.summaryPatch!.codeReview!['src/unowned.ts']![0]!;
    expect(anchored.anchor).toEqual({ kind: 'none', tier: 'undeclared' });
    // HIGH still refuses — anchoring never changes refusal semantics (AC-7).
    expect(res.outcome).toBe('refuse');
  });
});

describe('§6 Slice 3 corpus case 5 — a trivial unanchored finding must not block settle (AC-6a, GATE level)', () => {
  it('AC-6: a low-severity unanchored finding is declared as a gap but the gate still PASSES (dec-20260729-005: refusal is HIGH-only)', async () => {
    const v = new MockCodeReviewVerifier({
      extraMarkers: [{ pattern: /DEFECT_TRIVIAL\(/, severity: 'low', message: 'trivial nit, no real risk' }],
    });
    const diff = ['+++ b/src/trivial.ts', '@@ -0,0 +1,1 @@', '+DEFECT_TRIVIAL(1);'].join('\n');
    const verifyResult = await v.verify({ files: ['src/trivial.ts'], diff });
    expect(verifyResult.findings['src/trivial.ts']).toEqual([
      { severity: 'low', message: 'trivial nit, no real risk', line: 1 },
    ]);

    const draft = baseDraft();
    const errs: string[] = [];
    const res = await runCodeReviewGate(buildCtx({ draft, findings: verifyResult.findings, errs }));

    // Not blocked.
    expect(res.outcome).toBe('pass');

    // But still counted and declared as a gap (D3) — visibility is
    // unconditional even though it never approached the refusal floor.
    const anchored = res.summaryPatch!.codeReview!['src/trivial.ts']![0]!;
    expect(anchored.anchor).toEqual({ kind: 'none', tier: 'undeclared' });
    expect(errs.some((l) => /criteria-gap/.test(l) && /low=1/.test(l))).toBe(true);
  });

  it('AC-6: a medium-severity unanchored finding also does not refuse (only HIGH does, per dec-20260729-005)', async () => {
    const draft = baseDraft();
    const findings: Record<string, Finding[]> = {
      'src/medium-gap.ts': [{ severity: 'medium', message: 'medium unanchored defect' }],
    };
    const res = await runCodeReviewGate(buildCtx({ draft, findings }));
    expect(res.outcome).toBe('pass');
    expect(res.summaryPatch!.codeReview!['src/medium-gap.ts']![0]!.anchor!.tier).toBe('undeclared');
  });
});

describe('§6 Slice 3 corpus case 6 — anchor-shopping against a vague AC (AC-6, mixed unit + gate level)', () => {
  const vagueAc = ac({
    id: 'AC-9',
    name: 'Security',
    given: 'the API exists',
    when: 'it is used',
    then: 'the API should be secure',
  });

  it('AC-6: a vague-but-fully-structured AC earns exactly structured through the live gate — full G/W/T text alone cannot buy executable', async () => {
    const draft = baseDraft({
      acceptanceCriteria: [vagueAc],
      tasks: [task({ id: 'T1', files: ['src/vague.ts'], done: 'AC-9', verify: 'pnpm test -- security.test.ts' })],
    });
    const findings: Record<string, Finding[]> = {
      'src/vague.ts': [{ severity: 'high', message: 'a finding that could be dressed up as "insecure"' }],
    };
    const res = await runCodeReviewGate(buildCtx({ draft, findings }));
    const anchored = res.summaryPatch!.codeReview!['src/vague.ts']![0]!;
    expect(anchored.anchor!.tier).toBe('structured');
    expect(anchored.anchor!.tier).not.toBe('executable');
  });

  it('AC-6: the SAME vague AC reaches executable ONLY when the real two-condition check is satisfied (UNIT level, injected provenance) — proving the ladder measures facts, not alarming prose', () => {
    const acceptanceCriteria = [vagueAc];
    const tasks = [task({ id: 'T1', done: 'AC-9', verify: 'pnpm test -- security.test.ts' })];
    const gateProvenance = [provenance({ status: 'ran' })];
    const anchor = resolveAnchor({ kind: 'ac', ref: 'AC-9' }, acceptanceCriteria, [], tasks, gateProvenance);
    expect(anchor.tier).toBe('executable');
  });

  it('AC-6: an AC with vague prose but NO structure at all never rises above declared — vagueness cannot inflate a weak anchor either', () => {
    const bare = ac({ id: 'AC-9', given: 'the API should just be secure, somehow', when: '', then: '' });
    const anchor = resolveAnchor({ kind: 'ac', ref: 'AC-9' }, [bare], [], [], []);
    expect(anchor.tier).toBe('declared');
  });
});

describe('§6 Slice 3 corpus — weak-tier distinguishability (AC-6b): the tier IS the "weak" record, no redundant boolean field', () => {
  it('AC-6: structured, declared and executable are three distinct, mutually distinguishable tiers, and only executable carries full authority', () => {
    const structured = resolveAnchor({ kind: 'ac', ref: 'AC-1' }, [ac({ id: 'AC-1' })], [], [], []);
    const declared = resolveAnchor(
      { kind: 'ac', ref: 'AC-1' },
      [ac({ id: 'AC-1', when: '', then: '' })],
      [],
      [],
      [],
    );
    const executable = resolveAnchor(
      { kind: 'ac', ref: 'AC-1' },
      [ac({ id: 'AC-1' })],
      [],
      [task({ done: 'AC-1', verify: 'pnpm test' })],
      [provenance({ status: 'ran' })],
    );

    expect(structured.tier).toBe('structured');
    expect(declared.tier).toBe('declared');
    expect(executable.tier).toBe('executable');

    // All three pairwise distinct.
    expect(structured.tier).not.toBe(declared.tier);
    expect(structured.tier).not.toBe(executable.tier);
    expect(declared.tier).not.toBe(executable.tier);

    // "Weak" is derived from the tier itself (tier !== 'executable') — no
    // separate boolean field exists or is asserted here on purpose.
    const isWeak = (a: { tier: string }) => a.tier !== 'executable';
    expect(isWeak(structured)).toBe(true);
    expect(isWeak(declared)).toBe(true);
    expect(isWeak(executable)).toBe(false);
    expect('weak' in structured).toBe(false);
    expect('weak' in declared).toBe(false);
    expect('weak' in executable).toBe(false);
  });
});

describe('§6 Slice 3 corpus case 7 — AC-5 round trip: amending the DRAFT converts a gap into an anchored finding over an UNCHANGED diff/findings input', () => {
  const findings: Record<string, Finding[]> = {
    'src/roundtrip.ts': [{ severity: 'medium', message: 'defect discovered before the AC existed', line: 7 }],
  };

  it('AC-5: BEFORE — no criterion or boundary covers the file, so the defect is a criteria gap', async () => {
    const draftBefore = baseDraft();
    const res = await runCodeReviewGate(buildCtx({ draft: draftBefore, findings, touchedFiles: ['src/roundtrip.ts'] }));
    expect(res.outcome).toBe('pass'); // medium severity, never refuses on its own
    const anchored = res.summaryPatch!.codeReview!['src/roundtrip.ts']![0]!;
    expect(anchored.anchor).toEqual({ kind: 'none', tier: 'undeclared' });

    const gapCount = Object.values(res.summaryPatch!.codeReview!)
      .flat()
      .filter((f) => f.anchor?.tier === 'undeclared').length;
    expect(gapCount).toBe(1);
  });

  it('AC-5: AFTER — the SAME findings input over the SAME diff, once the DRAFT is amended with a criterion covering the file, anchors at the tier that criterion earns and is no longer a gap', async () => {
    const draftAfter = baseDraft({
      acceptanceCriteria: [ac({ id: 'AC-1', name: 'roundtrip coverage' })],
      tasks: [task({ id: 'T1', files: ['src/roundtrip.ts'], done: 'AC-1', verify: 'pnpm test -- roundtrip.test.ts' })],
    });
    const res = await runCodeReviewGate(buildCtx({ draft: draftAfter, findings, touchedFiles: ['src/roundtrip.ts'] }));
    expect(res.outcome).toBe('pass');
    const anchored = res.summaryPatch!.codeReview!['src/roundtrip.ts']![0]!;

    // Anchored at the tier this new criterion genuinely earns (structured —
    // the live gate threads no gate provenance, so executable is out of
    // reach here regardless; see the case-1 UNIT-level test above).
    expect(anchored.anchor).toEqual({ kind: 'ac', ref: 'AC-1', tier: 'structured' });

    // No longer a gap for this finding.
    expect(anchored.anchor!.tier).not.toBe('undeclared');
    const gapCount = Object.values(res.summaryPatch!.codeReview!)
      .flat()
      .filter((f) => f.anchor?.tier === 'undeclared').length;
    expect(gapCount).toBe(0);
  });

  it('AC-5: the exact same message/severity/line survive unanchored -> anchored — only the anchor changed, not the finding itself', async () => {
    const draftBefore = baseDraft();
    const draftAfter = baseDraft({
      acceptanceCriteria: [ac({ id: 'AC-1' })],
      tasks: [task({ id: 'T1', files: ['src/roundtrip.ts'], done: 'AC-1', verify: 'pnpm test -- roundtrip.test.ts' })],
    });

    const before = await runCodeReviewGate(buildCtx({ draft: draftBefore, findings, touchedFiles: ['src/roundtrip.ts'] }));
    const after = await runCodeReviewGate(buildCtx({ draft: draftAfter, findings, touchedFiles: ['src/roundtrip.ts'] }));

    const beforeFinding = before.summaryPatch!.codeReview!['src/roundtrip.ts']![0]!;
    const afterFinding = after.summaryPatch!.codeReview!['src/roundtrip.ts']![0]!;

    expect(beforeFinding.severity).toBe(afterFinding.severity);
    expect(beforeFinding.message).toBe(afterFinding.message);
    expect(beforeFinding.line).toBe(afterFinding.line);
    expect(beforeFinding.anchor).not.toEqual(afterFinding.anchor);
    expect(beforeFinding.anchor!.tier).toBe('undeclared');
    expect(afterFinding.anchor!.tier).toBe('structured');
  });
});
