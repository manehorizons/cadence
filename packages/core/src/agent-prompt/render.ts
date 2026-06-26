/**
 * `renderAgentPrompt` — the single source of truth for the "hand the loop to
 * your agent" prompt. Pure: no I/O, content embedded (same discipline as
 * `cadence explain`). Consumed by the `cadence agent-prompt` command and by
 * `cadence init`'s next-steps output, so the two surfaces never drift.
 *
 * The prompt is host-agnostic: it tells the agent to use the `cadence` CLI,
 * which works identically under Claude Code, Codex, Cursor, or none.
 */
const PLACEHOLDER = '<your goal>';

export function renderAgentPrompt(goal?: string): string {
  const g = goal !== undefined && goal.trim() !== '' ? goal.trim() : PLACEHOLDER;
  return (
    [
      "You're working in a repo set up with CADENCE — a DRAFT→BUILD→SETTLE loop that",
      "re-checks your declared acceptance criteria and refuses to settle work the tests",
      "don't actually back. Drive it with the `cadence` CLI.",
      '',
      'Scaffold the first phase for this goal:',
      '',
      `    ${g}`,
      '',
      'Steps:',
      `1. Run:  cadence draft new --title "${g}" --template <bugfix|feature|refactor>`,
      '   (pick the template that fits; --title derives the phase id for you)',
      '2. Edit the generated DRAFT.md:',
      '   • Objective — one sentence defining what "done" means.',
      '   • Acceptance criteria — each one testable and tagged AC-1, AC-2, …',
      '     A real test must be able to reference the tag. No vague criteria.',
      '   • Tasks — T1, T2, … each tied to the ACs it satisfies.',
      '3. STOP. Do not approve. Show me the DRAFT and wait for my review.',
      '',
      'Once I approve, build the tasks, then run `cadence settle` — it re-verifies each',
      "AC and will refuse to close the loop if any isn't genuinely met.",
    ].join('\n') + '\n'
  );
}
