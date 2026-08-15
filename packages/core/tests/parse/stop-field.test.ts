// Phase 280-dispatch-contract, DRAFT 280-01 (DP-B), T1 — adversarial fixtures
// seeded ahead of the code that satisfies them (this repo's "corpus before
// code" standing rule). Both halves below cover DRAFT T1's fixture (b): a
// task declaring `files:` and no `stop:`. Fixture (a) (stray-file + block
// mode) and fixture (c) (no-git baseline) live in
// ../cli/build-task-boundary.test.ts instead — CLI-level record-time
// behavior, not parser/coherence-level, per the DRAFT's own T1 action text
// read closely against AC-2/AC-4's CLI framing.
//
// DO NOT implement production code changes here. T2 (packages/types/src/plan.ts
// — TaskZ.stop) and T3 (packages/core/src/parse/draft-parser.ts — stop: line
// parsing) satisfy the parsing half; T5 (packages/core/src/coherence/check.ts
// — STOP_CONDITION_MISSING) satisfies the coherence half.

import { describe, it, expect } from 'vitest';
import { emptyState, type Draft } from '@thomas-powers-jr/cadence-types';
import { parseDraftMd } from '../../src/parse/draft-parser.js';
import { coherenceCheck } from '../../src/coherence/check.js';

const DRAFT_WITH_STOP = `---
phase: 280-dispatch-contract
id: 280-99
tier: standard
status: PENDING
---

# 280-99 — Stop field fixture

## Objective

Seed fixture for DP-B's stop: field.

## Acceptance Criteria

### AC-1: one
Given a
When b
Then c

## Tasks

### T1: risky migration step
- files: \`src/risky.ts\`
- action: run a risky schema migration
- verify: tests pass
- stop: If the migration touches more than 3 tables, halt and ask a human before continuing
- done: AC-1

## Boundaries

- none
`;

describe('draft T1 fixture (b), parsing half — parseDraftMd now parses `- stop:` (T2+T3 landed)', () => {
  it('280-01/AC-1: task.stop IS populated from a `- stop:` line', () => {
    const draft = parseDraftMd(DRAFT_WITH_STOP);
    const t1 = draft.tasks[0];
    expect(t1).toBeDefined();
    // Was RED pre-T2/T3: draft-parser.ts's parseTasks had no `stop:` regex,
    // and even if it had captured the text, TaskZ had no `stop` field --
    // DraftZ.parse (zod's default strip-unknown-keys behavior on
    // `z.object`) would have dropped an unrecognized key regardless. Now
    // that T2 (TaskZ field, packages/types/src/plan.ts) and T3 (parser
    // regex, packages/core/src/parse/draft-parser.ts) have landed, this
    // asserts the verbatim stop text is actually captured.
    expect(t1?.stop).toBe(
      'If the migration touches more than 3 tables, halt and ask a human before continuing',
    );
  });
});

describe('draft T1 fixture (b), coherence half — STOP_CONDITION_MISSING (T5 landed; fully green)', () => {
  it('280-01/AC-7: coherenceCheck emits one STOP_CONDITION_MISSING warning for a files:-declaring task with no stop:', () => {
    const draft: Draft = {
      schemaVersion: 1,
      id: '280-98',
      phase: '280-dispatch-contract',
      tier: 'standard',
      title: 'demo',
      objective: 'do a risky thing',
      acceptanceCriteria: [{ id: 'AC-1', name: '', given: 'x', when: 'y', then: 'z' }],
      tasks: [
        {
          id: 'T1',
          name: 'risky task',
          files: ['src/risky.ts'],
          action: 'do a risky thing',
          verify: 'tests pass',
          done: 'AC-1',
          // deliberately no `stop:` — this is the fixture's whole point.
        },
      ],
      boundaries: [],
      status: 'PENDING',
    };

    const result = coherenceCheck(draft, emptyState(), 'PROJECT body');
    const stopIssues = result.issues.filter((i) => i.code === 'STOP_CONDITION_MISSING');

    // T5 (280-01) added the STOP_CONDITION_MISSING check: a task with
    // files: and no stop: now emits exactly one warn-severity issue naming
    // the task. T5's own coherence/check.test.ts carries the fuller
    // red/then-green coverage (files+no-stop -> warn; files+stop -> no warn;
    // no-files -> no warn regardless of stop); this test just confirms the
    // same behavior holds for fixture (b)'s specific draft.
    expect(stopIssues).toHaveLength(1);
    expect(stopIssues[0]!.severity).toBe('warn');
    expect(stopIssues[0]!.message).toContain('T1');
  });
});
