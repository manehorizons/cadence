import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface InstallCommandsOptions {
  /** Base CLI invocation. Default `keel`. */
  keelCommand?: string;
  /** Override commands dir relative to root. Default `.claude/commands`. */
  commandsDir?: string;
}

const MANAGED_MARKER = '<!-- managed-by: keel -->';

interface CommandSpec {
  name: string;
  description: string;
  argumentHint?: string;
  cli: string; // suffix appended to keelCommand; may include $ARGUMENTS
  trailing?: string;
}

const COMMANDS: CommandSpec[] = [
  {
    name: 'keel-progress',
    description: "Show KEEL's next suggested action",
    cli: 'progress',
    trailing: 'Read the output above and take the suggested next step.',
  },
  {
    name: 'keel-draft',
    description: 'Scaffold a new DRAFT.md for a phase task',
    argumentHint: '<phase-id> <task-num> [--title=<title>]',
    cli: 'draft new $ARGUMENTS',
    trailing: 'Open the new DRAFT.md and fill in summary, ACs, and tasks.',
  },
  {
    name: 'keel-approve',
    description: 'Approve a draft and enter BUILD',
    argumentHint: '<phase-id> <task-num>',
    cli: 'draft approve $ARGUMENTS',
    trailing: 'Loop is now in BUILD. Use /keel-build to record task outcomes.',
  },
  {
    name: 'keel-check',
    description: 'Run structural coherence check on a draft',
    argumentHint: '<phase-id> <task-num>',
    cli: 'draft check $ARGUMENTS',
    trailing: 'Address any issues reported before approving the draft.',
  },
  {
    name: 'keel-build',
    description: 'Record outcome of a build task',
    argumentHint: '<task-id> --status=<PASS|FAIL|BLOCKED|ESCALATED>',
    cli: 'build task $ARGUMENTS',
    trailing: 'Continue with the next task or run /keel-settle when done.',
  },
  {
    name: 'keel-settle',
    description: 'Close the loop and write SUMMARY',
    argumentHint: '[--ac AC-1=pass ...]',
    cli: 'settle run $ARGUMENTS',
    trailing: 'Review SUMMARY.md; loop is back to IDLE.',
  },
];

function renderFile(spec: CommandSpec, keelCommand: string): string {
  const fm: string[] = ['---'];
  fm.push(`description: ${spec.description}`);
  if (spec.argumentHint) fm.push(`argument-hint: ${spec.argumentHint}`);
  fm.push('allowed-tools: Bash(keel:*), Read');
  fm.push('---');
  const lines = [
    fm.join('\n'),
    '',
    MANAGED_MARKER,
    '',
    `!${keelCommand} ${spec.cli}`.trimEnd(),
    '',
  ];
  if (spec.trailing) lines.push(spec.trailing, '');
  return lines.join('\n');
}

export async function installCommands(
  root: string,
  opts: InstallCommandsOptions = {},
): Promise<void> {
  const keelCommand = opts.keelCommand ?? 'keel';
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
    await writeFile(path, renderFile(spec, keelCommand), 'utf8');
  }
}
