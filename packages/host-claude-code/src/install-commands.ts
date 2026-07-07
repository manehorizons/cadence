import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COMMAND_GUIDANCE, DISPATCH_DIALOGUE, SCOUT_DIALOGUE } from '@manehorizons/cadence-types';
import { resolveLocalPaths } from './locate-self.js';

export interface InstallCommandsOptions {
  /** Base CLI invocation. Default `cadence`. */
  cadenceCommand?: string;
  /** Override commands dir relative to root. Default `.claude/commands`. */
  commandsDir?: string;
  /**
   * Use the absolute path to the local workspace core CLI instead of the
   * `cadence` shorthand. Intended for monorepo dogfood before publishing.
   *
   * WARNING: the resulting `.claude/commands/cadence-*.md` files embed a
   * MACHINE-ABSOLUTE path and must NOT be committed — they break on every
   * other clone/machine. The committed form must be the portable default
   * (`cadence …`, written when `local` is omitted). The CLI emits a stderr
   * warning naming this surface; see `docs/claude-code.md` § "The --local
   * warning".
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
  /**
   * Multi-line prompt body rendered after the auto-run `!`-orient line. Used by
   * dialogue commands (e.g. cadence-scout) that are a prompt template rather
   * than a thin CLI shell-out. Thin commands leave this unset.
   */
  body?: string;
}

// Guidance prose (description/trailing) + the scout dialogue body now live in
// the shared `@manehorizons/cadence-types` guidance module (phase 77) so the MCP
// prompts and these slash commands share one source of truth. The host-specific
// fields (cli, argumentHint) stay here. Rendered output is byte-identical —
// guarded by tests/install-commands-parity.test.ts.
const g = COMMAND_GUIDANCE;
const COMMANDS: CommandSpec[] = [
  {
    name: 'cadence-progress',
    description: g['cadence-progress'].description,
    cli: 'progress',
    trailing: g['cadence-progress'].trailing,
  },
  {
    name: 'cadence-draft',
    description: g['cadence-draft'].description,
    argumentHint: '<phase-id> <task-num> [--title=<title>]',
    cli: 'draft new $ARGUMENTS',
    trailing: g['cadence-draft'].trailing,
  },
  {
    name: 'cadence-approve',
    description: g['cadence-approve'].description,
    argumentHint: '<phase-id> <task-num>',
    cli: 'draft approve $ARGUMENTS',
    trailing: g['cadence-approve'].trailing,
  },
  {
    name: 'cadence-check',
    description: g['cadence-check'].description,
    argumentHint: '<phase-id> <task-num>',
    cli: 'draft check $ARGUMENTS',
    trailing: g['cadence-check'].trailing,
  },
  {
    name: 'cadence-build',
    description: g['cadence-build'].description,
    argumentHint: '<task-id> --status=<PASS|FAIL|BLOCKED|ESCALATED>',
    cli: 'build task $ARGUMENTS',
    trailing: g['cadence-build'].trailing,
  },
  {
    name: 'cadence-settle',
    description: g['cadence-settle'].description,
    argumentHint: '[--ac AC-1=pass ...]',
    cli: 'settle run $ARGUMENTS',
    trailing: g['cadence-settle'].trailing,
  },
  {
    name: 'cadence-done',
    description: g['cadence-done'].description,
    argumentHint: '<task-id> [--notes=<n>]',
    cli: 'done $ARGUMENTS',
    trailing: g['cadence-done'].trailing,
  },
  {
    name: 'cadence-block',
    description: g['cadence-block'].description,
    argumentHint: '<task-id> [--notes=<n>]',
    cli: 'block $ARGUMENTS',
    trailing: g['cadence-block'].trailing,
  },
  {
    name: 'cadence-needs-context',
    description: g['cadence-needs-context'].description,
    argumentHint: '<task-id> [--notes=<n>]',
    cli: 'needs-context $ARGUMENTS',
    trailing: g['cadence-needs-context'].trailing,
  },
  {
    name: 'cadence-handoff',
    description: g['cadence-handoff'].description,
    argumentHint: '[label]',
    cli: 'handoff $ARGUMENTS',
    trailing: g['cadence-handoff'].trailing,
  },
  {
    name: 'cadence-resume',
    description: g['cadence-resume'].description,
    cli: 'resume',
    trailing: g['cadence-resume'].trailing,
  },
  {
    name: 'cadence-recommend',
    description: g['cadence-recommend'].description,
    argumentHint: '[count]',
    cli: 'recommend --top 5',
    trailing: g['cadence-recommend'].trailing,
  },
  {
    name: 'cadence-scout',
    description: g['cadence-scout'].description,
    argumentHint: '[topic]',
    cli: 'recommend',
    body: SCOUT_DIALOGUE,
  },
  {
    name: 'cadence-dispatch',
    description: g['cadence-dispatch'].description,
    cli: 'dispatch plan --json',
    body: DISPATCH_DIALOGUE,
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
  if (spec.body) lines.push(spec.body, '');
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
