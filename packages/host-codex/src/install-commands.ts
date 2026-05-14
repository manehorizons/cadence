import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveLocalPaths } from './locate-self.js';

export interface InstallCommandsOptions {
  /** Base CLI invocation. Default `keel`. */
  keelCommand?: string;
  /** Override skills dir relative to root. Default `.agents/skills`. */
  skillsDir?: string;
  /**
   * Allow Codex to invoke these skills implicitly (without user typing
   * `$skill-name`). Defaults to false because KEEL state mutations should
   * be user-initiated.
   */
  allowImplicit?: boolean;
  /**
   * Use the absolute path to the local workspace core CLI instead of the
   * `keel` shorthand. Intended for monorepo dogfood before publishing.
   */
  local?: boolean;
}

const MANAGED_MARKER = '<!-- managed-by: keel -->';

interface SkillSpec {
  name: string;
  description: string;
  cliSuffix: string;
  guidance: string;
}

const SKILLS: SkillSpec[] = [
  {
    name: 'keel-progress',
    description:
      "Show KEEL's next suggested action for the active loop. Use when the user asks " +
      '"what next", "where am I", "what should I do", or wants the current build/settle status.',
    cliSuffix: 'progress',
    guidance: 'Read the output and act on the suggested next step.',
  },
  {
    name: 'keel-draft',
    description:
      'Scaffold a new KEEL DRAFT.md for a phase task. Use when the user wants to start a new ' +
      'unit of work in the loop. Args: <phase-id> <task-num> [--title=<title>].',
    cliSuffix: 'draft new $ARGUMENTS',
    guidance: 'Open the new DRAFT.md and fill in objective, ACs, and tasks.',
  },
  {
    name: 'keel-approve',
    description:
      'Approve a KEEL draft and enter BUILD. Use when the user is ready to start executing ' +
      'an approved draft. Args: <phase-id> <task-num>.',
    cliSuffix: 'draft approve $ARGUMENTS',
    guidance: 'Loop is now in BUILD. Use $keel-build to record task outcomes.',
  },
  {
    name: 'keel-check',
    description:
      'Run structural coherence check on a KEEL draft (lints AC/task references, missing ' +
      'fields, drift). Use before approving a draft. Args: <phase-id> <task-num>.',
    cliSuffix: 'draft check $ARGUMENTS',
    guidance: 'Address any issues reported before approving the draft.',
  },
  {
    name: 'keel-build',
    description:
      'Record outcome of a KEEL build task. Use after finishing a task in BUILD mode. ' +
      'Args: <task-id> --status=<PASS|FAIL|BLOCKED|ESCALATED|DONE>.',
    cliSuffix: 'build task $ARGUMENTS',
    guidance: 'Continue with the next task or invoke $keel-settle when done.',
  },
  {
    name: 'keel-settle',
    description:
      'Close the KEEL loop by writing SUMMARY.md from recorded task outcomes. Use when all ' +
      'tasks are done. Args: [--ac AC-1=pass …].',
    cliSuffix: 'settle run $ARGUMENTS',
    guidance: 'Review SUMMARY.md; loop is back to IDLE.',
  },
  {
    name: 'keel-done',
    description:
      'Mark a KEEL task as DONE. Use when the user says a task finished, "T1 done", ' +
      '"mark X done", or wants to record a passing outcome. Shortcut for ' +
      '`build task <id> --status=DONE`. Args: <task-id> [--notes=<n>].',
    cliSuffix: 'done $ARGUMENTS',
    guidance: 'Continue with the next task or invoke $keel-settle when all tasks are done.',
  },
  {
    name: 'keel-block',
    description:
      'Mark a KEEL task as BLOCKED. Use when the user says a task is stuck, blocked, or ' +
      'waiting on an external dependency. Shortcut for `build task <id> --status=BLOCKED`. ' +
      'Args: <task-id> [--notes=<n>].',
    cliSuffix: 'block $ARGUMENTS',
    guidance: 'Record the blocker, then unblock or escalate before settling.',
  },
  {
    name: 'keel-needs-context',
    description:
      'Mark a KEEL task as NEEDS_CONTEXT. Use when the user says they need more spec, ' +
      'design, or information before continuing a task. Shortcut for ' +
      '`build task <id> --status=NEEDS_CONTEXT`. Args: <task-id> [--notes=<n>].',
    cliSuffix: 'needs-context $ARGUMENTS',
    guidance: 'Supply the missing context, then re-run the task.',
  },
];

function renderSkill(spec: SkillSpec, keelCommand: string): string {
  return [
    '---',
    `name: ${spec.name}`,
    `description: ${spec.description}`,
    '---',
    '',
    MANAGED_MARKER,
    '',
    `Run the following command and report the result:`,
    '',
    '```',
    `${keelCommand} ${spec.cliSuffix}`.trimEnd(),
    '```',
    '',
    spec.guidance,
    '',
  ].join('\n');
}

const OPENAI_YAML_DISABLE_IMPLICIT = [
  '# managed-by: keel',
  'allow_implicit_invocation: false',
  '',
].join('\n');

export async function installCommands(
  root: string,
  opts: InstallCommandsOptions = {},
): Promise<void> {
  const local = opts.local ? resolveLocalPaths() : null;
  const keelCommand = opts.keelCommand ?? (local ? `node ${local.coreCli}` : 'keel');
  const baseDir = join(root, opts.skillsDir ?? '.agents/skills');
  const allowImplicit = opts.allowImplicit ?? false;

  for (const spec of SKILLS) {
    const skillDir = join(baseDir, spec.name);
    const skillPath = join(skillDir, 'SKILL.md');

    let existing: string | null = null;
    try {
      existing = await readFile(skillPath, 'utf8');
    } catch {
      // missing — create fresh
    }
    const userCustomized = existing !== null && !existing.includes(MANAGED_MARKER);

    await mkdir(skillDir, { recursive: true });
    if (!userCustomized) {
      await writeFile(skillPath, renderSkill(spec, keelCommand), 'utf8');
    }

    const yamlPath = join(skillDir, 'agents', 'openai.yaml');
    if (!allowImplicit) {
      await mkdir(join(skillDir, 'agents'), { recursive: true });
      await writeFile(yamlPath, OPENAI_YAML_DISABLE_IMPLICIT, 'utf8');
    }
  }
}
