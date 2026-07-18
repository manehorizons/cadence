import type { Draft, Task } from '@manehorizons/cadence-types';

/**
 * Renders a self-contained dispatch prompt for one task: the DRAFT's
 * objective, the task's action/verify/done, its files: boundary stated
 * explicitly, and a reminder of Spec 1's redundant-work monitoring. Pure —
 * no I/O.
 */
export function renderPacket(task: Task, draft: Draft): string {
  const filesStr = task.files.length > 0 ? task.files.map((f) => `\`${f}\``).join(', ') : '(none declared)';
  return [
    `# Task ${task.id}: ${task.name}`,
    '',
    `**Phase objective:** ${draft.objective}`,
    '',
    `**Action:** ${task.action}`,
    `**Verify:** ${task.verify}`,
    `**Done when:** ${task.done}`,
    '',
    `**Files (stay within these):** ${filesStr}`,
    '',
    "Do not touch files declared under any other task. If a task already marked",
    "DONE or DONE_WITH_CONCERNS genuinely needs revisiting, say so explicitly",
    "rather than silently redoing it — CADENCE's redundant-work monitoring will",
    'flag an edit to an already-finished task\'s files.',
    '',
    '**You are forbidden from taking the following actions, with no exceptions:**',
    '- Any state-mutating `cadence` subcommand — including but not limited to',
    '  `cadence build` and `cadence settle` — or any other command that mutates',
    '  `.cadence/` state.',
    '- `git commit` or `git push`.',
    '- gh (the GitHub CLI) or any other command that reaches a network or',
    '  external service.',
    '- Invoking `AskUserQuestion` or any other mechanism to prompt a human',
    '  interactively.',
    '',
    `The moment your Verify condition is met — or the moment you are genuinely`,
    'blocked or need more context — STOP. Do not record the outcome yourself.',
    'Report back to the orchestrating session with what you did, the exact',
    'commands you ran and their real output, and the resulting diff. The',
    'orchestrator alone runs `cadence build task` (or `cadence settle`) and',
    'records the outcome.',
  ].join('\n');
}
