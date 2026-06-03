import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveLocalPaths } from './locate-self.js';

export interface InstallCommandsOptions {
  /** Base CLI invocation. Default `cadence`. */
  cadenceCommand?: string;
  /** Override commands dir relative to root. Default `.claude/commands`. */
  commandsDir?: string;
  /**
   * Use the absolute path to the local workspace core CLI instead of the
   * `cadence` shorthand. Intended for monorepo dogfood before publishing.
   */
  local?: boolean;
}

const MANAGED_MARKER = '<!-- managed-by: cadence -->';

interface CommandSpec {
  name: string;
  description: string;
  argumentHint?: string;
  cli: string; // suffix appended to cadenceCommand; may include $ARGUMENTS
  trailing?: string;
}

const COMMANDS: CommandSpec[] = [
  {
    name: 'cadence-progress',
    description: "Show CADENCE's next suggested action",
    cli: 'progress',
    trailing: 'Read the output above and take the suggested next step.',
  },
  {
    name: 'cadence-draft',
    description: 'Scaffold a new DRAFT.md for a phase task',
    argumentHint: '<phase-id> <task-num> [--title=<title>]',
    cli: 'draft new $ARGUMENTS',
    trailing: 'Open the new DRAFT.md and fill in summary, ACs, and tasks.',
  },
  {
    name: 'cadence-approve',
    description: 'Approve a draft and enter BUILD',
    argumentHint: '<phase-id> <task-num>',
    cli: 'draft approve $ARGUMENTS',
    trailing: 'Loop is now in BUILD. Use /cadence-build to record task outcomes.',
  },
  {
    name: 'cadence-check',
    description: 'Run structural coherence check on a draft',
    argumentHint: '<phase-id> <task-num>',
    cli: 'draft check $ARGUMENTS',
    trailing: 'Address any issues reported before approving the draft.',
  },
  {
    name: 'cadence-build',
    description: 'Record outcome of a build task',
    argumentHint: '<task-id> --status=<PASS|FAIL|BLOCKED|ESCALATED>',
    cli: 'build task $ARGUMENTS',
    trailing: 'Continue with the next task or run /cadence-settle when done.',
  },
  {
    name: 'cadence-settle',
    description: 'Close the loop and write SUMMARY',
    argumentHint: '[--ac AC-1=pass ...]',
    cli: 'settle run $ARGUMENTS',
    trailing: 'Review SUMMARY.md; loop is back to IDLE.',
  },
  {
    name: 'cadence-done',
    description: 'Mark a task DONE (shortcut for build task --status=DONE)',
    argumentHint: '<task-id> [--notes=<n>]',
    cli: 'done $ARGUMENTS',
    trailing: 'Continue with the next task or run /cadence-settle when done.',
  },
  {
    name: 'cadence-block',
    description: 'Mark a task BLOCKED (shortcut for build task --status=BLOCKED)',
    argumentHint: '<task-id> [--notes=<n>]',
    cli: 'block $ARGUMENTS',
    trailing: 'Record the blocker, then unblock or escalate before settling.',
  },
  {
    name: 'cadence-needs-context',
    description:
      'Mark a task NEEDS_CONTEXT (shortcut for build task --status=NEEDS_CONTEXT)',
    argumentHint: '<task-id> [--notes=<n>]',
    cli: 'needs-context $ARGUMENTS',
    trailing: 'Supply the missing context, then re-run the task.',
  },
  {
    name: 'cadence-handoff',
    description: 'Scaffold a SESSION handoff doc with machine facts pre-filled',
    argumentHint: '[label]',
    cli: 'handoff $ARGUMENTS',
    trailing: 'Open the new SESSION doc and fill the narrative sections (TL;DR, what landed, gotchas, next action).',
  },
  {
    name: 'cadence-resume',
    description: 'Replay the freshest session handoff + live context (read-only)',
    cli: 'resume',
    trailing: 'Read the replayed handoff and continue from the documented next action.',
  },
];

function renderFile(spec: CommandSpec, cadenceCommand: string): string {
  const fm: string[] = ['---'];
  fm.push(`description: ${spec.description}`);
  if (spec.argumentHint) fm.push(`argument-hint: ${spec.argumentHint}`);
  fm.push('allowed-tools: Bash(cadence:*), Read');
  fm.push('---');
  const lines = [
    fm.join('\n'),
    '',
    MANAGED_MARKER,
    '',
    `!${cadenceCommand} ${spec.cli}`.trimEnd(),
    '',
  ];
  if (spec.trailing) lines.push(spec.trailing, '');
  return lines.join('\n');
}

export async function installCommands(
  root: string,
  opts: InstallCommandsOptions = {},
): Promise<void> {
  const local = opts.local ? resolveLocalPaths() : null;
  const cadenceCommand = opts.cadenceCommand ?? (local ? `node ${local.coreCli}` : 'cadence');
  const dir = join(root, opts.commandsDir ?? '.claude/commands');
  await mkdir(dir, { recursive: true });

  for (const spec of COMMANDS) {
    const path = join(dir, `${spec.name}.md`);
    let existing: string | null = null;
    try {
      existing = await readFile(path, 'utf8');
    } catch {
      // missing — create fresh
    }
    if (existing !== null && !existing.includes(MANAGED_MARKER)) {
      // User-customized; leave it alone.
      continue;
    }
    await writeFile(path, renderFile(spec, cadenceCommand), 'utf8');
  }
}
