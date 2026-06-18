import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { COMMAND_GUIDANCE, SCOUT_DIALOGUE } from '@manehorizons/cadence-types';
import { resolveLocalPaths } from './locate-self.js';

export interface InstallCommandsOptions {
  /** Base CLI invocation written into prompts. Default `cadence`. */
  cadenceCommand?: string;
  /**
   * Codex home dir whose `prompts/` receives the files. Default
   * `$CODEX_HOME` ?? `~/.codex`. Tests MUST pass a temp dir here — Codex
   * prompts are GLOBAL, so a real install touches every project.
   */
  codexHome?: string;
  /**
   * Use the absolute workspace core CLI path instead of the `cadence`
   * shorthand. Monorepo dogfood only — writes a machine-absolute path that must
   * not be committed.
   */
  local?: boolean;
}

const MANAGED_MARKER = '<!-- managed-by: cadence -->';

interface CommandSpec {
  name: string;
  description: string;
  argumentHint?: string;
  cli: string; // suffix appended to the cadence command; may include $ARGUMENTS
  trailing?: string;
  body?: string; // multi-line prompt template for dialogue commands
}

// The cadence slash-command catalog, rendered as Codex *prompts*. Same commands
// as the Claude adapter, but Codex prompts are prompt templates (no `!`-autorun,
// no `allowed-tools`), so the rendering differs. (Catalog duplication with the
// Claude adapter is deliberate for now; a shared catalog is a future cleanup.)
const COMMANDS: CommandSpec[] = [
  { name: 'cadence-progress', description: "Show CADENCE's next suggested action", cli: 'progress', trailing: 'Read the output and take the suggested next step.' },
  { name: 'cadence-draft', description: 'Scaffold a new DRAFT.md for a phase task', argumentHint: '[phase-id] [task-num] --title=<title>', cli: 'draft new $ARGUMENTS', trailing: 'Open the new DRAFT.md and fill in summary, ACs, and tasks.' },
  { name: 'cadence-approve', description: 'Approve a draft and enter BUILD', argumentHint: '<phase-id> <task-num>', cli: 'draft approve $ARGUMENTS', trailing: 'Loop is now in BUILD. Use /cadence-build to record task outcomes.' },
  { name: 'cadence-check', description: 'Run structural coherence check on a draft', argumentHint: '<phase-id> <task-num>', cli: 'draft check $ARGUMENTS', trailing: 'Address any issues reported before approving the draft.' },
  { name: 'cadence-build', description: 'Record outcome of a build task', argumentHint: '<task-id> --status=<PASS|FAIL|BLOCKED|ESCALATED>', cli: 'build task $ARGUMENTS', trailing: 'Continue with the next task or run /cadence-settle when done.' },
  { name: 'cadence-settle', description: 'Close the loop and write SUMMARY', argumentHint: '[--pass-all | --ac-pass AC-1 ... | --ac AC-1=pass ...]', cli: 'settle run $ARGUMENTS', trailing: 'Use --pass-all for simple green paths, then review SUMMARY.md; loop is back to IDLE.' },
  { name: 'cadence-done', description: 'Mark a task DONE (shortcut for build task --status=DONE)', argumentHint: '<task-id> [--notes=<n>]', cli: 'done $ARGUMENTS', trailing: 'Continue with the next task or run /cadence-settle when done.' },
  { name: 'cadence-block', description: 'Mark a task BLOCKED (shortcut for build task --status=BLOCKED)', argumentHint: '<task-id> [--notes=<n>]', cli: 'block $ARGUMENTS', trailing: 'Record the blocker, then unblock or escalate before settling.' },
  { name: 'cadence-needs-context', description: 'Mark a task NEEDS_CONTEXT (shortcut for build task --status=NEEDS_CONTEXT)', argumentHint: '<task-id> [--notes=<n>]', cli: 'needs-context $ARGUMENTS', trailing: 'Supply the missing context, then re-run the task.' },
  { name: 'cadence-handoff', description: 'Scaffold a SESSION handoff doc with machine facts pre-filled', argumentHint: '[label]', cli: 'handoff $ARGUMENTS', trailing: 'Open the new SESSION doc and fill the narrative sections.' },
  { name: 'cadence-resume', description: 'Replay the freshest session handoff (brief by default; --full adds live context)', cli: 'resume', trailing: 'Read the replayed handoff and continue from the documented next action.' },
  { name: 'cadence-scout', description: COMMAND_GUIDANCE['cadence-scout'].description, argumentHint: '[topic]', cli: 'recommend', body: SCOUT_DIALOGUE },
];

function renderFile(spec: CommandSpec, cadenceCommand: string): string {
  const fm: string[] = ['---', `description: ${spec.description}`];
  if (spec.argumentHint) fm.push(`argument-hint: ${spec.argumentHint}`);
  fm.push('---');
  const lines = [
    fm.join('\n'),
    '',
    MANAGED_MARKER,
    '',
    'Run the following command in the terminal and act on its output:',
    '',
    '```',
    `${cadenceCommand} ${spec.cli}`.trimEnd(),
    '```',
    '',
  ];
  if (spec.body) lines.push(spec.body, '');
  if (spec.trailing) lines.push(spec.trailing, '');
  return lines.join('\n');
}

/** Resolve the Codex home dir: explicit override → $CODEX_HOME → ~/.codex. */
export function resolveCodexHome(override?: string): string {
  return override ?? process.env.CODEX_HOME ?? join(homedir(), '.codex');
}

/**
 * Write the cadence slash commands as Codex custom prompts into
 * `<codexHome>/prompts/cadence-*.md` (FINDINGS §1). Unlike the Claude adapter's
 * project-scoped `.claude/commands/`, Codex has no project-level prompt dir yet
 * (openai/codex#4734), so this is a GLOBAL install — the CLI warns accordingly.
 * User-customized files (missing the managed marker) are left untouched.
 */
export async function installCommands(_root: string, opts: InstallCommandsOptions = {}): Promise<void> {
  const local = opts.local ? resolveLocalPaths() : null;
  const cadenceCommand = opts.cadenceCommand ?? (local ? `node ${local.coreCli}` : 'cadence');
  const dir = join(resolveCodexHome(opts.codexHome), 'prompts');
  await mkdir(dir, { recursive: true });

  for (const spec of COMMANDS) {
    const path = join(dir, `${spec.name}.md`);
    let existing: string | null = null;
    try {
      existing = await readFile(path, 'utf8');
    } catch {
      // missing — create fresh
    }
    if (existing !== null && !existing.includes(MANAGED_MARKER)) continue; // user-customized
    await writeFile(path, renderFile(spec, cadenceCommand), 'utf8');
  }
}
