/**
 * Hook install for the Codex adapter.
 *
 * STUB — implemented in phase 67. The real `installHooks` will write the cadence
 * shim into project-level `{root}/.codex/hooks.json` (or `[hooks]` tables in
 * `{root}/.codex/config.toml`) per the phase-65 spike (FINDINGS §3), pointing at
 * the shim binary built in phase 68. Kept as a typed throwing stub so the
 * adapter's contract surface is complete and `codexAdapter satisfies HostAdapter`
 * compiles now, without shipping a half-built install path.
 */
export interface InstallOptions {
  /** Emit the published-npx invocation form instead of a local node path. */
  npx?: boolean;
  /** Embed machine-absolute paths (do not commit). */
  local?: boolean;
}

export function installHooks(_root: string, _options?: InstallOptions): never {
  throw new Error('cadence-host-codex installHooks: not yet implemented (phase 67)');
}
