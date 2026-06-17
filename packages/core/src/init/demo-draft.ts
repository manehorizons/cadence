import { derivePhaseTaskId } from '../phases/id.js';

/**
 * Render the shared "toy" demo DRAFT — a coherent quick-fix phase with one
 * objective, one AC, and one task linked to it. Single source for both
 * `cadence tutorial` (sandbox loop) and `cadence init --demo` (a ready-to-approve
 * phase seeded into the user's own repo), so the two can never drift.
 *
 * Pure: `(phase, num) → { id, content }`. The `content` is the full DRAFT.md
 * markdown; `id` is the derived `<phase-num>-<task-num>` id.
 */
export function renderDemoDraft(
  phase: string,
  num: string,
): { id: string; content: string } {
  const id = derivePhaseTaskId(phase, num);
  const content = `---
phase: ${phase}
id: ${id}
tier: quick-fix
status: PENDING
---

# ${id} — Hello loop

## Objective

A throwaway demo so you can watch one DRAFT→BUILD→SETTLE loop run end to end.

## Acceptance Criteria

### AC-1: the loop closes cleanly
Given this demo draft
When the loop settles
Then AC-1 is recorded as pass.

## Tasks

### T1: greet the loop
- files: \`hello.txt\`
- action: write a one-line greeting to hello.txt
- verify: the greeting is present
- done: AC-1

## Boundaries

- DO NOT rely on this demo phase outside the tutorial.
`;
  return { id, content };
}
