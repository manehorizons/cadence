import { runHandoff, type HandoffOptions } from '../handoff/run-handoff.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence handoff` as a service seam (phase 76) — thin MCP adapter over the
 * shared `runHandoff` core. Returns the `HandoffResult` as structured `data`;
 * a same-day collision (no `force`) maps to exit code 2.
 */
export interface HandoffServiceArgs {
  label?: string;
  force?: boolean;
  noStamp?: boolean;
  noGit?: boolean;
}

export async function handoffService(
  repoRoot: string,
  args: HandoffServiceArgs,
  io: CommandIO,
): Promise<CommandResult> {
  const opts: HandoffOptions = {
    force: args.force ?? false,
    noStamp: args.noStamp ?? false,
    noGit: args.noGit ?? false,
  };
  if (args.label !== undefined) opts.label = args.label;
  try {
    const res = await runHandoff(repoRoot, opts);
    io.out(`handoff: wrote ${res.path}\n`);
    return { exitCode: 0, data: res };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.err(`${msg}\n`);
    return { exitCode: /already exists/.test(msg) ? 2 : 1 };
  }
}
