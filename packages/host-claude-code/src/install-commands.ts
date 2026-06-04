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
  {
    name: 'cadence-scout',
    description:
      'Divergent→convergent ideation dialogue that lands survivors as Praxis recommendations',
    argumentHint: '[topic]',
    cli: 'recommend',
    body: [
      'You are running **CADENCE scout** — a divergent→convergent ideation',
      'dialogue that turns a fuzzy problem into ranked Praxis recommendations.',
      'Scout never drives the loop: it generates candidate directions and lands',
      'them in the recommendation ledger. It allocates no loop id, runs no gate,',
      'and never changes loop state.',
      '',
      '**Topic:** $ARGUMENTS — if empty, ask the user what space to scout.',
      '',
      'The ranked recommendations above (`!cadence recommend`) are your',
      "orientation: don't re-propose work already captured or in flight.",
      '',
      '1. **Diverge.** Generate many candidate directions for the topic —',
      '   breadth first, no commitment, no filtering yet. Aim wide.',
      '2. **Converge.** Triage *with the user* down to the few worth keeping;',
      '   drop duplicates of existing recs and merge near-duplicates.',
      '3. **Land.** For each survivor run:',
      '   `cadence recommendation add --title "<title>" --readiness raw-idea',
      '   --evidence "Generated in /cadence-scout session on <topic>, <date>;',
      '   siblings: <other rec ids>"` — use `--readiness needs-evidence` when the',
      '   candidate is already well-formed.',
      '4. **Hand back.** Point the user at `cadence recommend` to re-rank, then',
      '   the existing rec → milestone → SPEC export path. Scout stops here.',
    ].join('\n'),
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
