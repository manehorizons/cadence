import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { emptyState, type Profile } from '@manehorizons/cadence-types';
import { loadConfig } from '../../config/loader.js';
import { assessReadiness, type VerifierReadiness } from '../../activate/assess.js';
import { maybeWireHost } from '../../init/host-wire.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { ScriptedPrompter, StdinPrompter, type Prompter } from '../../verify/prompter.js';

/**
 * Build a prompter the same way `init.ts`'s (private) `makePrompter()` does:
 * a scripted prompter when `CADENCE_PROMPTER_SCRIPT` is set (tests/scripted
 * automation), a real stdin prompter when stdin is a TTY, otherwise `null` —
 * non-interactive, `maybeWireHost` falls back to skip-without-hanging.
 */
// deja:new `init.ts`'s makePrompter() is a private, unexported helper (T2's
// boundary forbids touching init.ts, which T3 is editing concurrently) — this
// is the same minimal TTY/scripted-prompter selection logic reimplemented
// locally, not a duplication of the host-wire spawn seam itself, which IS
// shared via `init/host-wire.ts` (T1) and imported below, not reimplemented.
function makePrompter(): Prompter | null {
  const scripted = process.env.CADENCE_PROMPTER_SCRIPT;
  if (scripted !== undefined) {
    return new ScriptedPrompter(scripted.split('\n'));
  }
  if (process.stdin.isTTY) {
    try {
      return new StdinPrompter();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Read project name from an existing `.cadence/state.json`. Best-effort: a
 * missing/unparsable file degrades to the default name rather than throwing
 * (mirrors `init.ts`'s private `readExistingProject`'s name-reading half; gate
 * profile comes from `loadConfig` here instead of a second hand-rolled JSON
 * read, per the DRAFT's guidance).
 */
async function readOnboardProject(cadenceDir: string): Promise<{ name: string }> {
  let name = 'unnamed';
  try {
    const state = JSON.parse(await readFile(join(cadenceDir, 'state.json'), 'utf8'));
    if (typeof state?.project?.name === 'string') name = state.project.name;
  } catch {
    /* fall back to default */
  }
  return { name };
}

/**
 * Best-effort project-name derivation from `.cadence/PROJECT.md`'s first-line
 * `# <name>` header. Missing/unreadable/mismatched shape all degrade to the
 * default name rather than throwing (same "never throw" contract as
 * `readOnboardProject`).
 */
async function deriveNameFromProjectMd(cadenceDir: string): Promise<string> {
  try {
    const content = await readFile(join(cadenceDir, 'PROJECT.md'), 'utf8');
    const firstLine = content.split('\n', 1)[0] ?? '';
    const match = /^#\s+(.+?)\s*$/.exec(firstLine);
    if (match?.[1]) return match[1];
  } catch {
    /* fall back to default */
  }
  return 'unnamed';
}

/**
 * Issue #177 fallout (phase 196): `.cadence/state.json` is gitignored and
 * per-worktree now, so a fresh clone/worktree of a repo with `.cadence/`
 * already committed has a `.cadence/` dir but no `state.json`. `onboard` is
 * built for exactly that "already committed" scenario, so silently reading
 * `readOnboardProject`'s fallback default and never writing the file left
 * every downstream command (`cadence progress`, etc.) throwing
 * `NotInitializedError` right after onboard reported success. Bootstrap a
 * fresh IDLE state.json in that case — a genuine bootstrap action, loudly
 * announced on stderr, never a silent mutation of an existing file.
 */
async function bootstrapMissingState(
  cwd: string,
  cadenceDir: string,
): Promise<{ name: string }> {
  const name = await deriveNameFromProjectMd(cadenceDir);
  const state = emptyState(name);
  await new SimpleStateBackend(cwd).commit(state);
  process.stderr.write(
    `state.json was missing (fresh worktree/clone) — bootstrapped a new one for project "${name}" (loop position: IDLE).\n`,
  );
  return { name };
}

interface OnboardSummary {
  project: string;
  gateProfile: Profile;
  hostWire: { wired: boolean; offered: boolean };
  verifier: {
    provider: VerifierReadiness['provider'];
    keyPresent: boolean;
    ready: boolean;
    reason: string;
  };
}

function renderHuman(summary: OnboardSummary): string {
  const lines: string[] = ['cadence onboard', ''];
  lines.push(`  project       ${summary.project}`);
  lines.push(`  gate profile  ${summary.gateProfile}`);
  lines.push(
    `  host hooks    ${
      summary.hostWire.wired
        ? 'wired'
        : summary.hostWire.offered
          ? 'not wired (declined/skipped)'
          : 'not applicable (no .claude/ workspace detected)'
    }`,
  );
  lines.push(`  verifier      ${summary.verifier.reason}`);
  lines.push('');
  lines.push('Run `cadence progress` for the next suggested action.');
  return lines.join('\n') + '\n';
}

export function registerOnboardCommand(program: Command): void {
  program
    .command('onboard')
    .description(
      'Per-machine setup for a repo that already has .cadence/ committed (install host hooks, report verifier readiness)',
    )
    .option('--json', 'emit machine-readable JSON instead of rendered text')
    .option('--host <host>', 'wire a host during onboarding: claude | codex')
    .option(
      '--wire-host',
      'when a .claude/ workspace is present, run the Claude Code host install in the same step (auto-run, no prompt)',
    )
    .option(
      '--skip-host-wire',
      'never wire the Claude Code host, even when .claude/ is present',
    )
    .action(
      async (opts: { json?: boolean; host?: string; wireHost?: boolean; skipHostWire?: boolean }) => {
        const cwd = process.cwd();
        const cadenceDir = join(cwd, '.cadence');

        if (!existsSync(cadenceDir)) {
          const message =
            'No .cadence/ found in this directory — nothing to onboard onto. Run `cadence init` to scaffold a new project instead.';
          if (opts.json) {
            process.stdout.write(JSON.stringify({ ok: false, error: message }) + '\n');
          } else {
            console.error(message);
          }
          process.exit(2);
          return;
        }

        try {
          const statePath = join(cadenceDir, 'state.json');
          const [{ name }, config] = await Promise.all([
            existsSync(statePath)
              ? readOnboardProject(cadenceDir)
              : bootstrapMissingState(cwd, cadenceDir),
            loadConfig(cwd),
          ]);
          const verifier = assessReadiness(config, process.env, cwd);

          const prompter = makePrompter();
          let hostWire: { wired: boolean; offered: boolean };
          try {
            hostWire = await maybeWireHost(
              cwd,
              { wireHost: opts.wireHost, skipHostWire: opts.skipHostWire, host: opts.host },
              prompter,
            );
          } finally {
            await prompter?.close?.();
          }

          const summary: OnboardSummary = {
            project: name,
            gateProfile: config.profile,
            hostWire,
            verifier: {
              provider: verifier.provider,
              keyPresent: verifier.keyPresent,
              ready: verifier.ready,
              reason: verifier.reason,
            },
          };

          if (opts.json) {
            process.stdout.write(JSON.stringify({ ok: true, ...summary }) + '\n');
          } else {
            process.stdout.write(renderHuman(summary));
          }
          process.exitCode = 0;
        } catch (err) {
          process.stderr.write(
            `onboard failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      },
    );
}
