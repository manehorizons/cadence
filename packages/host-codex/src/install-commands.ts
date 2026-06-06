/**
 * Slash-command install for the Codex adapter.
 *
 * STUB — implemented in phase 67. The real `installCommands` will write the
 * cadence slash commands as Codex custom prompts into **global**
 * `$CODEX_HOME/prompts/*.md` (default `~/.codex/prompts/`) per the phase-65 spike
 * (FINDINGS §1) — Codex has no project-level prompt dir yet (openai/codex#4734),
 * so unlike the Claude adapter's per-repo `.claude/commands/`, this is a global
 * op and must warn the user as such. Kept as a typed throwing stub so the
 * adapter's contract surface is complete now.
 */
export interface InstallCommandsOptions {
  /** Emit the published-npx invocation form instead of a local node path. */
  npx?: boolean;
  /** Override the Codex home dir (defaults to `$CODEX_HOME` or `~/.codex`). */
  codexHome?: string;
}

export function installCommands(_root: string, _options?: InstallCommandsOptions): never {
  throw new Error('cadence-host-codex installCommands: not yet implemented (phase 67)');
}
