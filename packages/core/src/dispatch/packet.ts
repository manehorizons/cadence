import type { Draft, Task } from '@manehorizons/cadence-types';

/**
 * Recommends whether a task should be dispatched into an isolated git
 * worktree: 'worktree' when the task declares one or more files (it will
 * mutate the working tree), 'none' when it declares no files (read-only /
 * no mutation expected). Pure — no I/O. See rec-20260718-002.
 */
export function recommendIsolation(task: Task): 'worktree' | 'none' {
  return task.files.length > 0 ? 'worktree' : 'none';
}

/**
 * Renders a self-contained dispatch prompt for one task: the DRAFT's
 * objective, the task's action/verify/done, its files: boundary stated
 * explicitly, and a reminder of Spec 1's redundant-work monitoring. Pure —
 * no I/O.
 */
export function renderPacket(task: Task, draft: Draft): string {
  const filesStr = task.files.length > 0 ? task.files.map((f) => `\`${f}\``).join(', ') : '(none declared)';
  const isolation = recommendIsolation(task);
  const isolationLine =
    isolation === 'worktree'
      ? '**Recommended isolation:** worktree — this task mutates files; dispatch it into its own git worktree if you are running multiple tasks concurrently.'
      : '**Recommended isolation:** none — no files declared, so no worktree isolation is needed for this task.';
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
    isolationLine,
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
