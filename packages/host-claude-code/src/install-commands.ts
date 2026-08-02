import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { COMMANDS, type CommandSpec } from '@thomas-powers-jr/cadence-host-toolkit';
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

// The command catalog (which commands exist, their description/cli/
// argumentHint/trailing/body) now lives in the shared toolkit package,
// `@thomas-powers-jr/cadence-host-toolkit` (phase 222), so both host adapters
// render from the identical, undrifted catalog. Rendered output is
// byte-identical — guarded by tests/install-commands-parity.test.ts.

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
