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

// The cadence slash-command catalog, rendered as Codex *prompts*. The prose is
// shared with Claude/MCP; the host-specific CLI and prompt shape stay here.
const g = COMMAND_GUIDANCE;
const COMMANDS: CommandSpec[] = [
  { name: 'cadence-progress', description: g['cadence-progress'].description, cli: 'progress', trailing: g['cadence-progress'].trailing },
  { name: 'cadence-draft', description: g['cadence-draft'].description, argumentHint: '<phase-id> <task-num> [--title=<title>]', cli: 'draft new $ARGUMENTS', trailing: g['cadence-draft'].trailing },
  { name: 'cadence-approve', description: g['cadence-approve'].description, argumentHint: '<phase-id> <task-num>', cli: 'draft approve $ARGUMENTS', trailing: g['cadence-approve'].trailing },
  { name: 'cadence-check', description: g['cadence-check'].description, argumentHint: '<phase-id> <task-num>', cli: 'draft check $ARGUMENTS', trailing: g['cadence-check'].trailing },
  { name: 'cadence-build', description: g['cadence-build'].description, argumentHint: '<task-id> --status=<PASS|FAIL|BLOCKED|ESCALATED>', cli: 'build task $ARGUMENTS', trailing: g['cadence-build'].trailing },
  { name: 'cadence-settle', description: g['cadence-settle'].description, argumentHint: '[--ac AC-1=pass ...]', cli: 'settle run $ARGUMENTS', trailing: g['cadence-settle'].trailing },
  { name: 'cadence-done', description: g['cadence-done'].description, argumentHint: '<task-id> [--notes=<n>]', cli: 'done $ARGUMENTS', trailing: g['cadence-done'].trailing },
  { name: 'cadence-block', description: g['cadence-block'].description, argumentHint: '<task-id> [--notes=<n>]', cli: 'block $ARGUMENTS', trailing: g['cadence-block'].trailing },
  { name: 'cadence-needs-context', description: g['cadence-needs-context'].description, argumentHint: '<task-id> [--notes=<n>]', cli: 'needs-context $ARGUMENTS', trailing: g['cadence-needs-context'].trailing },
  { name: 'cadence-handoff', description: g['cadence-handoff'].description, argumentHint: '[label]', cli: 'handoff $ARGUMENTS', trailing: g['cadence-handoff'].trailing },
  { name: 'cadence-resume', description: g['cadence-resume'].description, cli: 'resume', trailing: g['cadence-resume'].trailing },
  { name: 'cadence-recommend', description: g['cadence-recommend'].description, argumentHint: '[count]', cli: 'recommend --top 5', trailing: g['cadence-recommend'].trailing },
  { name: 'cadence-scout', description: g['cadence-scout'].description, argumentHint: '[topic]', cli: 'recommend', body: SCOUT_DIALOGUE },
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
