import type { Command } from 'commander';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { presets, emptyState, type Profile } from '@cadence/types';
import { atomicWriteJSON } from '../../state/atomic-write.js';
import { renderStateMd } from '../../render/state-md.js';
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

async function resolveName(
  flagName: string | undefined,
  prompter: Prompter | null,
): Promise<string> {
  if (flagName !== undefined) return flagName;
  if (!prompter) return 'unnamed';
  const reply = (await prompter.ask('Project name [unnamed]: ')).trim();
  return reply.length > 0 ? reply : 'unnamed';
}

function isGateProfile(v: string): v is Profile {
  return (GATE_PROFILES as readonly string[]).includes(v);
}

async function resolveGateProfile(
  flagProfile: string | undefined,
  suggestion: Profile,
  prompter: Prompter | null,
): Promise<Profile> {
  if (flagProfile !== undefined) {
    if (!isGateProfile(flagProfile)) {
      throw new Error(
        `Invalid --gate-profile: ${flagProfile}. Expected one of strict|standard|auto.`,
      );
    }
    return flagProfile;
  }
  if (!prompter) return suggestion;
  for (let attempt = 0; attempt < 3; attempt++) {
    const reply = (
      await prompter.ask(
        `Profile [${suggestion}] (strict|standard|auto): `,
      )
    )
      .trim()
      .toLowerCase();
    if (reply.length === 0) return suggestion;
    if (isGateProfile(reply)) return reply;
  }
  return suggestion;
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
    .option('--profile <preset>', 'Config preset: solo | team | production', 'team')
    .option(
      '--gate-profile <p>',
      'Gate profile: strict | standard | auto (suggested from git history when omitted)',
    )
    .option(
      '--claude-md',
      'only (re)generate the managed CLAUDE.md block at the repo root; allowed on an already-initialized project',
    )
    .action(
      async (opts: {
        name?: string;
        profile: 'solo' | 'team' | 'production';
        gateProfile?: string;
        claudeMd?: boolean;
      }) => {
        const cwd = process.cwd();
        const cadenceDir = join(cwd, '.cadence');

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
            preset: opts.profile,
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
        const presetCfg = presets[opts.profile];
        if (!presetCfg) {
          console.error(`Unknown profile: ${opts.profile}`);
          process.exit(2);
        }

        const prompter = makePrompter();
        let name: string;
        let gateProfile: Profile;
        try {
          name = await resolveName(opts.name, prompter);
          const suggestion = suggestGateProfile(cwd);
          gateProfile = await resolveGateProfile(
            opts.gateProfile,
            suggestion,
            prompter,
          );
        } catch (err) {
          console.error(err instanceof Error ? err.message : String(err));
          process.exit(2);
        } finally {
          await prompter?.close?.();
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
        await atomicWriteJSON(join(cadenceDir, 'state.json'), state);
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
        await writeFile(join(cadenceDir, 'STATE.md'), renderStateMd(state));
        await writeClaudeMd(cwd, {
          projectName: name,
          gateProfile,
          preset: opts.profile,
        });

        // Legacy line — retained for back-compat ahead of the summary block.
        console.log(
          `Initialized CADENCE in ${cadenceDir} (profile=${opts.profile})`,
        );
        console.log('');
        console.log(`  CADENCE initialized`);
        console.log(`  ───────────────────`);
        console.log(`  project       ${name}`);
        console.log(`  location      ${cadenceDir}`);
        console.log(`  preset        ${opts.profile}`);
        console.log(`  gate profile  ${gateProfile}`);
        console.log(`  layout        ${layout}`);
        console.log(`  test globs    ${testGlobs.join(', ')}`);
        console.log(`  scaffolded    config.json, state.json, PROJECT.md,`);
        console.log(`                ROADMAP.md, MILESTONES.md,`);
        console.log(`                SPECIAL-FLOWS.md, STATE.md, CLAUDE.md`);
        console.log(`                phases/ handoff/ research/ archive/`);
        console.log('');
        console.log(
          `  Next: edit .cadence/ROADMAP.md, then \`cadence draft new\`.`,
        );
        console.log(`  Docs: see .cadence/ROADMAP.md and the project README.`);
      },
    );
}
