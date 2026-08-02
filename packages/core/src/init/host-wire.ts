import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { Prompter } from '../verify/prompter.js';

/**
 * Phase 108 — host auto-wire. When a Claude Code workspace (`.claude/`) is
 * present, run `cadence-host-claude-code install` in the same step so init is
 * a one-command front door. Core never imports host code: the install runs via
 * a subprocess spawn (mirrors `start.ts`'s launcher discipline).
 *
 * Decision table (after `.claude/` is confirmed present):
 *   --skip-host-wire        → skip
 *   --wire-host             → wire
 *   prompter available      → offer [Y/n] (TTY, or scripted via CADENCE_PROMPTER_SCRIPT)
 *   else (non-TTY, no flag) → skip + print a pointer (never hangs — AC-4)
 *
 * The spawn target is overridable for tests via `CADENCE_HOST_WIRE_CMD`
 * (a JSON array `["cmd","arg",…]`, or a bare shell string).
 *
 * Phase 189 (T1) — extracted out of `cli/commands/init.ts` into this shared
 * module so both `cadence init --full` and the new `cadence onboard` command
 * can call the same host-wire logic instead of duplicating the spawn seam.
 */
export type InitHostTarget = 'claude' | 'codex';

export function hostWireDisplay(target: InitHostTarget): string {
  return target === 'codex'
    ? 'npx -y @thomas-powers-jr/cadence-host-codex install'
    : 'npx @thomas-powers-jr/cadence-host-claude-code install';
}

// deja:new relocating spawnHostWire verbatim out of cli/commands/init.ts into
// this shared module (phase 189 T1) so cadence onboard (T2) can reuse it
// instead of duplicating the spawn seam — the old definition in init.ts is
// deleted in this same change and re-imports from here.
export async function spawnHostWire(cwd: string, target: InitHostTarget): Promise<number> {
  const override =
    target === 'codex'
      ? process.env.CADENCE_HOST_CODEX_WIRE_CMD ?? process.env.CADENCE_HOST_WIRE_CMD
      : process.env.CADENCE_HOST_WIRE_CMD;
  let cmd: string;
  let args: string[];
  let useShell = false;
  if (override !== undefined && override.length > 0) {
    if (override.trimStart().startsWith('[')) {
      const parsed = JSON.parse(override) as string[];
      cmd = parsed[0] as string;
      args = parsed.slice(1);
    } else {
      cmd = override;
      args = [];
      useShell = true;
    }
  } else {
    cmd = 'npx';
    args =
      target === 'codex'
        ? ['-y', '@thomas-powers-jr/cadence-host-codex', 'install']
        : ['@thomas-powers-jr/cadence-host-claude-code', 'install'];
    // npx is npx.cmd on Windows; spawn() needs a shell to resolve it. Args are
    // static literals (no user input), so shell is safe here (as in start.ts).
    useShell = process.platform === 'win32';
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: useShell });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      console.error(
        `Failed to wire the ${target === 'codex' ? 'Codex' : 'Claude Code'} host: ${err.message}`,
      );
      resolve(1);
    });
  });
}

// deja:new relocating maybeWireHost verbatim out of cli/commands/init.ts into
// this shared module (phase 189 T1) so cadence onboard (T2) can reuse it
// instead of duplicating the spawn seam — the old definition in init.ts is
// deleted in this same change and re-imports from here.
export async function maybeWireHost(
  cwd: string,
  opts: {
    wireHost?: boolean | undefined;
    skipHostWire?: boolean | undefined;
    host?: string | undefined;
  },
  prompter: Prompter | null,
): Promise<{ wired: boolean; offered: boolean }> {
  const explicitHost =
    opts.host === 'claude' || opts.host === 'codex' ? opts.host : undefined;
  const target: InitHostTarget | undefined =
    explicitHost ?? (existsSync(join(cwd, '.claude')) ? 'claude' : undefined);
  if (target === undefined) return { wired: false, offered: false };
  if (opts.skipHostWire) return { wired: false, offered: false };

  let doWire: boolean;
  if (opts.wireHost || explicitHost !== undefined) {
    doWire = true;
  } else if (target === 'claude' && prompter) {
    const reply = (
      await prompter.ask('Detected .claude/ — wire the Claude Code host now? [Y/n]: ')
    )
      .trim()
      .toLowerCase();
    doWire = reply === '' || reply === 'y' || reply === 'yes';
  } else {
    doWire = false; // non-TTY, no flag — skip without hanging (AC-4).
  }

  if (!doWire) return { wired: false, offered: true };

  const display = hostWireDisplay(target);
  console.log('');
  console.log(`  Wiring ${target === 'codex' ? 'Codex' : 'Claude Code'} host → ${display}`);
  const code = await spawnHostWire(cwd, target);
  if (code !== 0) {
    console.error(
      `  host wire exited ${code}; run it yourself:\n    ${display}`,
    );
  }
  return { wired: code === 0, offered: true };
}
