import type { Command } from 'commander';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { presets, emptyState, type Profile } from '@cadence/types';
import { atomicWriteJSON } from '../../state/atomic-write.js';
import { renderStateMd } from '../../render/state-md.js';
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
    .action(
      async (opts: {
        name?: string;
        profile: 'solo' | 'team' | 'production';
        gateProfile?: string;
      }) => {
        const cwd = process.cwd();
        const cadenceDir = join(cwd, '.cadence');
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

        const cfg = { ...presetCfg, profile: gateProfile };

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
        console.log(`  scaffolded    config.json, state.json, PROJECT.md,`);
        console.log(`                ROADMAP.md, MILESTONES.md,`);
        console.log(`                SPECIAL-FLOWS.md, STATE.md`);
        console.log(`                phases/ handoff/ research/ archive/`);
        console.log('');
        console.log(
          `  Next: edit .cadence/ROADMAP.md, then \`cadence draft new\`.`,
        );
        console.log(`  Docs: see .cadence/ROADMAP.md and the project README.`);
      },
    );
}
