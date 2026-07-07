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
    `When finished, record the outcome yourself: \`cadence build task ${task.id} --status=<DONE|BLOCKED|NEEDS_CONTEXT>\`.`,
  ].join('\n');
}
