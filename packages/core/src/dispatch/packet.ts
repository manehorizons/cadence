import type { Draft, Task } from '@thomas-powers-jr/cadence-types';
import type { ExecutionVerdict } from './policy.js';

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
 * Builds the full line array for a dispatch packet: the DRAFT's objective,
 * the task's action/verify/done, its files: boundary stated explicitly, and
 * a reminder of Spec 1's redundant-work monitoring. When the task declares a
 * `stop:` field, a `**Stop condition:**` bold-label line (matching the
 * `**Recommended isolation:**` convention, not a heading) is spliced in
 * right after the isolation-recommendation line via a conditional spread —
 * absent tasks get nothing added, which is what keeps the rendered packet
 * byte-identical to the pre-DP-B baseline when no stop: is declared.
 * `verdictLines` (empty for the base packet) is spliced in right after that
 * and before the following blank line. Pure — no I/O.
 */
function buildLines(task: Task, draft: Draft, verdictLines: string[]): string[] {
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
    ...(task.stop ? [`**Stop condition:** ${task.stop}`, ''] : []),
    ...verdictLines,
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
  ];
}

/**
 * Renders a self-contained dispatch prompt for one task, with no execution
 * verdict included. Byte-identical to the pre-verdict-split renderPacket
 * output — the baseline other AC-5 non-regression comparisons are pinned
 * against. Pure — no I/O.
 */
export function renderPacketBase(task: Task, draft: Draft): string {
  return buildLines(task, draft, []).join('\n');
}

/**
 * Renders a self-contained dispatch prompt for one task, including the
 * dispatch-policy classifier's Execution (and, when dispatched, Model)
 * lines spliced into a fixed slot between the isolation-recommendation line
 * and the following blank line. Pure — no I/O.
 */
export function renderPacket(task: Task, draft: Draft, verdict: ExecutionVerdict): string {
  const execLine =
    `**Execution:** ${verdict.execution} — ` +
    (verdict.reasons.length > 0 ? verdict.reasons.join('; ') : 'no dispatch trigger met');
  const verdictLines =
    verdict.execution === 'dispatch' ? [execLine, `**Model:** ${verdict.model} (${verdict.modelClass})`] : [execLine];
  return buildLines(task, draft, verdictLines).join('\n');
}
