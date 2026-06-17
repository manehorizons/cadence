import type { Command } from 'commander';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { execSync, spawn } from 'node:child_process';
import { join, basename } from 'node:path';
import {
  presets,
  emptyState,
  MOCK_VERIFIER_NOTICE,
  type Profile,
} from '@manehorizons/cadence-types';
import { atomicWriteJSON } from '../../state/atomic-write.js';
import { SimpleStateBackend } from '../../state/simple.js';
import {
  mergeManagedBlock,
  type MergeMode,
} from '../../init/claude-md-template.js';
import {
  ScriptedPrompter,
  StdinPrompter,
  type Prompter,
} from '../../verify/prompter.js';

const GATE_PROFILES: readonly Profile[] = ['strict', 'standard', 'auto'];

/**
 * Build a prompter the same way `draft.ts approve` does: a scripted prompter
 * when `CADENCE_PROMPTER_SCRIPT` is set (newline-separated answers), a real
 * stdin prompter when stdin is a TTY, otherwise `null` — non-interactive,
 * caller falls back to defaults.
 */
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
 * Suggest a gate profile from git history: a repo with ≥20 commits is
 * mature enough to want the `standard` gate set; a reachable repo with
 * fewer commits gets `auto`; any git failure (no repo, bare, zero commits)
 * also falls back to `auto`. Never throws.
 */
export function suggestGateProfile(cwd: string): Profile {
  try {
    const out = execSync('git rev-list --count HEAD', {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const n = Number.parseInt(out, 10);
    if (Number.isNaN(n)) return 'auto';
    return n >= 20 ? 'standard' : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * Pick `verification.testGlobs` from the repo's layout (F2, Phase 29.1
 * shakedown). A `packages/` directory at the init root means a monorepo —
 * keep the workspace glob (correct for cadence's own dogfood). Any other
 * shape is treated as single-package: a depth-agnostic `**\/*.test.ts(x)`
 * glob so the test-coverage gate can match tests under `tests/`, `src/`,
 * `__tests__/`, etc. The scanner already prunes node_modules/dist/.git/.turbo,
 * so the broad glob is safe. Never throws.
 */
export function detectTestGlobs(cwd: string): string[] {
  let monorepo = false;
  try {
    monorepo = statSync(join(cwd, 'packages')).isDirectory();
  } catch {
    monorepo = false;
  }
  return monorepo
    ? ['packages/**/*.test.ts', 'packages/**/*.test.tsx']
    : ['**/*.test.ts', '**/*.test.tsx'];
}

/**
 * Phase 108 (rec-20260617-001) — zero-prompt name derivation. `--name` wins;
 * otherwise read `package.json#name` (scope stripped: `@scope/foo` → `foo`),
 * then fall back to the working-directory basename, then the literal
 * `unnamed` only when nothing else is available. Never prompts, never throws.
 */
export function deriveName(cwd: string, flagName: string | undefined): string {
  if (flagName !== undefined) return flagName;
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    if (typeof pkg?.name === 'string' && pkg.name.trim().length > 0) {
      const trimmed = pkg.name.trim();
      const lastSegment = trimmed.includes('/')
        ? (trimmed.split('/').pop() as string)
        : trimmed;
      if (lastSegment.length > 0) return lastSegment;
    }
  } catch {
    /* no/unreadable package.json — fall through to dir name */
  }
  const base = basename(cwd).trim();
  return base.length > 0 ? base : 'unnamed';
}

function isGateProfile(v: string): v is Profile {
  return (GATE_PROFILES as readonly string[]).includes(v);
}

/**
 * Phase 108 — zero-prompt gate-profile resolution. `--gate-profile` wins (and
 * is validated); otherwise use the git-history suggestion. No prompt.
 */
function resolveGateProfile(
  flagProfile: string | undefined,
  suggestion: Profile,
): Profile {
  if (flagProfile !== undefined) {
    if (!isGateProfile(flagProfile)) {
      throw new Error(
        `Invalid --gate-profile: ${flagProfile}. Expected one of strict|standard|auto.`,
      );
    }
    return flagProfile;
  }
  return suggestion;
}

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
 */
const HOST_WIRE_DISPLAY = 'npx @manehorizons/cadence-host-claude-code install';

async function spawnHostWire(cwd: string): Promise<number> {
  const override = process.env.CADENCE_HOST_WIRE_CMD;
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
    args = ['@manehorizons/cadence-host-claude-code', 'install'];
    // npx is npx.cmd on Windows; spawn() needs a shell to resolve it. Args are
    // static literals (no user input), so shell is safe here (as in start.ts).
    useShell = process.platform === 'win32';
  }
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: useShell });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      console.error(`Failed to wire the Claude Code host: ${err.message}`);
      resolve(1);
    });
  });
}

async function maybeWireHost(
  cwd: string,
  opts: { wireHost?: boolean | undefined; skipHostWire?: boolean | undefined },
  prompter: Prompter | null,
): Promise<{ wired: boolean; offered: boolean }> {
  if (!existsSync(join(cwd, '.claude'))) return { wired: false, offered: false };
  if (opts.skipHostWire) return { wired: false, offered: false };

  let doWire: boolean;
  if (opts.wireHost) {
    doWire = true;
  } else if (prompter) {
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

  console.log('');
  console.log(`  Wiring Claude Code host → ${HOST_WIRE_DISPLAY}`);
  const code = await spawnHostWire(cwd);
  if (code !== 0) {
    console.error(
      `  host wire exited ${code}; run it yourself:\n    ${HOST_WIRE_DISPLAY}`,
    );
  }
  return { wired: code === 0, offered: true };
}

/**
 * Merge the managed CLAUDE.md block into `<cwd>/CLAUDE.md`. Returns the
 * merge mode so the caller can report it. `preserved` means a marker-less
 * user file was left untouched.
 */
async function writeClaudeMd(
  cwd: string,
  opts: { projectName: string; gateProfile: Profile; preset: string },
): Promise<MergeMode> {
  const path = join(cwd, 'CLAUDE.md');
  const existing = existsSync(path) ? await readFile(path, 'utf8') : null;
  const merged = mergeManagedBlock(existing, opts);
  if (merged.mode !== 'preserved') {
    await writeFile(path, merged.content);
  }
  return merged.mode;
}

/** Read project name + gate profile from an existing `.cadence/`. */
async function readExistingProject(
  cadenceDir: string,
): Promise<{ name: string; gateProfile: Profile }> {
  let name = 'unnamed';
  let gateProfile: Profile = 'auto';
  try {
    const state = JSON.parse(
      await readFile(join(cadenceDir, 'state.json'), 'utf8'),
    );
    if (typeof state?.project?.name === 'string') name = state.project.name;
  } catch {
    /* fall back to default */
  }
  try {
    const cfg = JSON.parse(
      await readFile(join(cadenceDir, 'config.json'), 'utf8'),
    );
    if (cfg?.profile === 'strict' || cfg?.profile === 'standard' || cfg?.profile === 'auto') {
      gateProfile = cfg.profile;
    }
  } catch {
    /* fall back to default */
  }
  return { name, gateProfile };
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scaffold a new .cadence/ directory in the current working tree')
    .option('--name <project>', 'Project name (prompted when omitted)')
    .option('--preset <preset>', 'Config preset: solo | team | production (default: team)')
    .option(
      '--profile <preset>',
      'Deprecated alias for --preset (kept for back-compat)',
    )
    .option(
      '--gate-profile <p>',
      'Gate profile: strict | standard | auto (suggested from git history when omitted)',
    )
    .option(
      '--claude-md',
      'only (re)generate the managed CLAUDE.md block at the repo root; allowed on an already-initialized project',
    )
    .option(
      '--wire-host',
      'when a .claude/ workspace is present, run the Claude Code host install in the same step (auto-run, no prompt)',
    )
    .option(
      '--skip-host-wire',
      'never wire the Claude Code host, even when .claude/ is present',
    )
    .action(
      async (opts: {
        name?: string;
        preset?: 'solo' | 'team' | 'production';
        profile?: 'solo' | 'team' | 'production';
        gateProfile?: string;
        claudeMd?: boolean;
        wireHost?: boolean;
        skipHostWire?: boolean;
      }) => {
        const cwd = process.cwd();
        const cadenceDir = join(cwd, '.cadence');

        // rec-20260602-001: --profile was a misnomer (it sets a config preset,
        // not a gate profile). --preset is the primary flag; --profile lives on
        // as a deprecated alias. New flag wins; default is `team`.
        if (opts.profile !== undefined && opts.preset === undefined) {
          console.error(
            '--profile is deprecated; use --preset (the flag selects a config preset, not a gate profile).',
          );
        }
        const preset = opts.preset ?? opts.profile ?? 'team';

        // Phase 26.2 — standalone --claude-md: do NOT refuse on an existing
        // .cadence/ and do NOT scaffold; just regenerate the managed block.
        if (opts.claudeMd) {
          const src = existsSync(cadenceDir)
            ? await readExistingProject(cadenceDir)
            : {
                name: opts.name ?? 'unnamed',
                gateProfile: (opts.gateProfile === 'strict' ||
                opts.gateProfile === 'standard' ||
                opts.gateProfile === 'auto'
                  ? opts.gateProfile
                  : 'auto') as Profile,
              };
          const mode = await writeClaudeMd(cwd, {
            projectName: src.name,
            gateProfile: src.gateProfile,
            preset,
          });
          if (mode === 'preserved') {
            console.error(
              'CLAUDE.md preserved: no cadence:managed markers found — leaving the user file untouched.',
            );
          } else {
            console.log(`CLAUDE.md ${mode} (${src.name}, ${src.gateProfile}).`);
          }
          return;
        }

        if (existsSync(cadenceDir)) {
          console.error('.cadence/ already initialized in this directory');
          process.exit(2);
        }
        const presetCfg = presets[preset];
        if (!presetCfg) {
          console.error(`Unknown preset: ${preset}`);
          process.exit(2);
        }

        // Phase 108 — zero-prompt: derive the name and gate profile, ask nothing.
        let name: string;
        let gateProfile: Profile;
        try {
          name = deriveName(cwd, opts.name);
          gateProfile = resolveGateProfile(opts.gateProfile, suggestGateProfile(cwd));
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(2);
        }

        const testGlobs = detectTestGlobs(cwd);
        const layout =
          testGlobs[0]?.startsWith('packages/') ?? false
            ? 'monorepo (packages/)'
            : 'single-package';
        const cfg = {
          ...presetCfg,
          profile: gateProfile,
          verification: { ...presetCfg.verification, testGlobs },
        };

        await mkdir(join(cadenceDir, 'phases'), { recursive: true });
        await mkdir(join(cadenceDir, 'handoff'), { recursive: true });
        await mkdir(join(cadenceDir, 'research'), { recursive: true });
        await mkdir(join(cadenceDir, 'archive'), { recursive: true });
        await atomicWriteJSON(join(cadenceDir, 'config.json'), cfg);
        const state = emptyState(name);
        // Phase 41.1 — one write path: commit() writes state.json + STATE.md.
        await new SimpleStateBackend(cwd).commit(state);
        await writeFile(
          join(cadenceDir, 'PROJECT.md'),
          `# ${name}\n\n> CADENCE project. See .cadence/ROADMAP.md for phases.\n`,
        );
        await writeFile(join(cadenceDir, 'ROADMAP.md'), '# Roadmap\n\n_(no phases yet)_\n');
        await writeFile(join(cadenceDir, 'MILESTONES.md'), '# Milestones\n');
        await writeFile(
          join(cadenceDir, 'SPECIAL-FLOWS.md'),
          '# Special Flows\n\n_(none yet)_\n',
        );
        await writeClaudeMd(cwd, {
          projectName: name,
          gateProfile,
          preset,
        });

        // Legacy line — retained for back-compat ahead of the summary block.
        console.log(
          `Initialized CADENCE in ${cadenceDir} (profile=${preset})`,
        );
        console.log('');
        console.log(`  CADENCE initialized`);
        console.log(`  ───────────────────`);
        console.log(`  project       ${name}`);
        console.log(`  location      ${cadenceDir}`);
        console.log(
          `  preset        ${preset}  (config preset — workflow defaults: solo|team|production)`,
        );
        console.log(
          `  gate profile  ${gateProfile}  (gate strictness: strict|standard|auto)`,
        );
        console.log(`  layout        ${layout}`);
        console.log(`  test globs    ${testGlobs.join(', ')}`);
        console.log(`  scaffolded    config.json, state.json, PROJECT.md,`);
        console.log(`                ROADMAP.md, MILESTONES.md,`);
        console.log(`                SPECIAL-FLOWS.md, STATE.md, CLAUDE.md`);
        console.log(`                phases/ handoff/ research/ archive/`);
        console.log('');
        console.log(`  Your first loop`);
        console.log(`  ───────────────`);
        console.log(`  1. cadence draft new 01-first 01 --title "..."   scaffold a DRAFT`);
        console.log(`  2. edit the DRAFT — objective, ACs, tasks`);
        console.log(`  3. cadence draft approve 01-first 01             enter BUILD`);
        console.log(`  4. cadence done T1                               record outcomes`);
        console.log(`  5. cadence settle run --ac AC-1=pass             close the loop`);
        console.log('');
        console.log(
          `  Stuck? Run \`cadence progress\` anytime for the next action.`,
        );
        console.log(
          `  Not sure where to go next? Run \`cadence start\` for a guided menu.`,
        );
        console.log(`  Docs: .cadence/ROADMAP.md and the project README.`);
        console.log('');
        console.log(`  Turn on real verification`);
        console.log(`  ─────────────────────────`);
        console.log(`  ${MOCK_VERIFIER_NOTICE.message}`);
        if (gateProfile === 'standard' || gateProfile === 'strict') {
          console.log('');
          console.log(
            `  Note: under the \`${gateProfile}\` gate profile \`cadence draft approve\` is`,
          );
          console.log(
            `  interactive — pass \`--no-approve\` for non-TTY runs (CI, scripts, agents).`,
          );
        }

        // Phase 108 — auto-wire the Claude Code host when .claude/ is present.
        const prompter = makePrompter();
        let hostWire: { wired: boolean; offered: boolean };
        try {
          hostWire = await maybeWireHost(
            cwd,
            { wireHost: opts.wireHost, skipHostWire: opts.skipHostWire },
            prompter,
          );
        } finally {
          await prompter?.close?.();
        }
        if (hostWire.offered && !hostWire.wired) {
          console.log('');
          console.log(`  Claude Code workspace detected (.claude/).`);
          console.log(`  Wire it when ready:  ${HOST_WIRE_DISPLAY}`);
        }
      },
    );
}
