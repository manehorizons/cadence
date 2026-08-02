import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { COMMANDS, type CommandSpec } from '@thomas-powers-jr/cadence-host-toolkit';
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

// The command catalog (which commands exist, their description/cli/
// argumentHint/trailing/body) now lives in the shared toolkit package,
// `@thomas-powers-jr/cadence-host-toolkit` (phase 222), so both host adapters
// render from the identical, undrifted catalog — including cadence-dispatch's
// DISPATCH_DIALOGUE body, which this adapter's own copy had silently dropped.
// The host-specific CLI/prompt rendering shape stays here.

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
