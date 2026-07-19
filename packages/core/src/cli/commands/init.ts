import type { Command } from 'commander';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  presets,
  emptyState,
  MOCK_VERIFIER_NOTICE,
  type Profile,
  type CadenceConfig,
} from '@manehorizons/cadence-types';
import {
  deriveName,
  detectCoverageMode,
  detectProjectLanguage,
  detectTestCommand,
  detectTestGlobs,
  planInit,
  renderInitPlan,
  resolveGateProfile,
  suggestGateProfile,
} from '../../init/plan.js';
import { atomicWriteJSON } from '../../state/atomic-write.js';
import { SimpleStateBackend } from '../../state/simple.js';
import {
  mergeManagedBlock,
  renderAgentsMd,
  type MergeMode,
} from '../../init/claude-md-template.js';
import { writeContributingMd } from '../../init/contributing-md-template.js';
import { renderDemoDraft } from '../../init/demo-draft.js';
import { autoFlipNotice } from '../../init/gate-profile-notice.js';
import { ensureGitignoreEntries } from '../../init/gitignore.js';
import { maybeWireHost, hostWireDisplay } from '../../init/host-wire.js';
import { draftNewService } from '../../services/draft-new.js';
import type { CommandIO } from '../../services/io.js';
import { planActivation } from '../../activate/plan.js';
import { setPath } from '../../config-edit/apply.js';
import { renderAgentPrompt } from '../../agent-prompt/render.js';
import {
  ScriptedPrompter,
  StdinPrompter,
  type Prompter,
} from '../../verify/prompter.js';

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

async function writeAgentsMd(
  cwd: string,
  opts: { projectName: string; gateProfile: Profile; preset: string },
): Promise<MergeMode> {
  const path = join(cwd, 'AGENTS.md');
  const existing = existsSync(path) ? await readFile(path, 'utf8') : null;
  if (existing === null || existing.trim().length === 0) {
    await writeFile(path, renderAgentsMd(opts));
    return 'created';
  }
  const merged = mergeManagedBlock(existing, {
    ...opts,
    regenerateCommand: 'cadence init --agents-md',
  });
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
      '--agents-md',
      'only (re)generate the managed AGENTS.md block at the repo root; allowed on an already-initialized project',
    )
    .option('--host <host>', 'wire a host during init: claude | codex')
    .option(
      '--wire-host',
      'when a .claude/ workspace is present, run the Claude Code host install in the same step (auto-run, no prompt)',
    )
    .option(
      '--skip-host-wire',
      'never wire the Claude Code host, even when .claude/ is present',
    )
    .option(
      '--demo',
      'seed a ready-to-approve demo phase (01-demo) so you can run a full loop in this repo',
    )
    .option(
      '--activate',
      'turn on real verification when ANTHROPIC_API_KEY is present (writes verifier.provider=anthropic; never stores the key)',
    )
    .option(
      '--dry-run',
      'preview what init would resolve and write (a fit-check) without touching the repo',
    )
    .option(
      '--full',
      'one-command full setup: wire the host, seed the demo phase, and activate real verification when their preconditions are met (each still yields to an explicitly-passed flag, e.g. --skip-host-wire)',
    )
    .action(
      async (opts: {
        name?: string;
        preset?: 'solo' | 'team' | 'production';
        profile?: 'solo' | 'team' | 'production';
        gateProfile?: string;
        claudeMd?: boolean;
        agentsMd?: boolean;
        host?: string;
        wireHost?: boolean;
        skipHostWire?: boolean;
        demo?: boolean;
        activate?: boolean;
        dryRun?: boolean;
        full?: boolean;
      }) => {
        const cwd = process.cwd();
        const cadenceDir = join(cwd, '.cadence');

        // Phase 188 — `--full` sets *defaults* for --wire-host/--demo/--activate;
        // an explicitly-passed flag (including a negative one like
        // --skip-host-wire, handled separately below) always wins over the
        // --full-implied default (AC-5).
        const effectiveWireHost = opts.wireHost ?? opts.full;
        const effectiveDemo = opts.demo ?? opts.full;
        const effectiveActivate = opts.activate ?? opts.full;

        // rec-20260602-001: --profile was a misnomer (it sets a config preset,
        // not a gate profile). --preset is the primary flag; --profile lives on
        // as a deprecated alias. New flag wins; default is `team`.
        if (opts.profile !== undefined && opts.preset === undefined) {
          console.error(
            '--profile is deprecated; use --preset (the flag selects a config preset, not a gate profile).',
          );
        }
        const preset = opts.preset ?? opts.profile ?? 'team';

        if (opts.host !== undefined && opts.host !== 'claude' && opts.host !== 'codex') {
          console.error(`Unknown host: ${opts.host} (expected claude|codex)`);
          process.exit(2);
          return;
        }

        // Phase 132 (rec-20260619-005) — --dry-run fit check. Resolve everything
        // init would resolve, print the preview, and write NOTHING. Takes
        // precedence over --claude-md, and previews (never exit-2 refuses) on an
        // already-initialized repo so it stays a safe pre-flight check.
        if (opts.dryRun) {
          try {
            const plan = planInit(
              cwd,
              opts,
              process.env,
              process.stdin.isTTY ?? false,
            );
            process.stdout.write(renderInitPlan(plan));
          } catch (err) {
            console.error(err instanceof Error ? err.message : String(err));
            process.exit(2);
          }
          return;
        }

        // Phase 26.2 — standalone agent doc regeneration: do NOT refuse on an
        // existing .cadence/ and do NOT scaffold; just regenerate the managed block.
        if (opts.claudeMd || opts.agentsMd) {
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
          const file = opts.agentsMd ? 'AGENTS.md' : 'CLAUDE.md';
          const writer = opts.agentsMd ? writeAgentsMd : writeClaudeMd;
          const mode = await writer(cwd, {
            projectName: src.name,
            gateProfile: src.gateProfile,
            preset,
          });
          if (mode === 'preserved') {
            console.error(
              `${file} preserved: no cadence:managed markers found — leaving the user file untouched.`,
            );
          } else {
            console.log(`${file} ${mode} (${src.name}, ${src.gateProfile}).`);
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

        // Phase 166 (AC-1/AC-2) — one language sniff shared by testGlobs and
        // coverageMode, so the two never disagree about the detected language.
        const projectLanguage = detectProjectLanguage(cwd);
        const testGlobs = detectTestGlobs(cwd, projectLanguage);
        const testCommand = detectTestCommand(cwd);
        const coverageMode = detectCoverageMode(cwd, projectLanguage);
        const layout =
          testGlobs[0]?.startsWith('packages/') ?? false
            ? 'monorepo (packages/)'
            : 'single-package';
        // structuredClone so setPath below never mutates the shared `presets`
        // singleton (its nested verifier objects are otherwise by-reference).
        const cfg = structuredClone({
          ...presetCfg,
          profile: gateProfile,
          verification: {
            ...presetCfg.verification,
            testGlobs,
            coverageMode,
            ...(testCommand !== null ? { testCommand } : {}),
          },
        });
        // Phase 166 (AC-1) — coverageMode fell back to 'mention' because the
        // detected language isn't js/ts: assertion mode's span-finder doesn't
        // understand that language's test files yet, so writing 'assertion'
        // would produce a test-coverage gate that can never pass. Loud
        // stderr notice, never a silent downgrade.
        if (projectLanguage !== 'js') {
          console.error(
            `coverageMode: 'assertion' requires JS/TS test syntax support; detected language ` +
              `'${projectLanguage}' isn't supported yet, defaulting to 'mention' instead. ` +
              `See docs/reference/config.md.`,
          );
        }

        // Phase 110 — fold activation into init. With --activate and a present
        // ANTHROPIC_API_KEY, wire real verification (deep-verify seam) via the
        // shared activate seam; the key is never persisted (only the provider
        // name is written). No live ping here — that stays in `cadence activate`.
        const hasAnthropicKey =
          typeof process.env.ANTHROPIC_API_KEY === 'string' &&
          process.env.ANTHROPIC_API_KEY.length > 0;
        let activatedProvider: 'anthropic' | null = null;
        let activateNoKey = false;
        if (effectiveActivate) {
          if (hasAnthropicKey) {
            const plan = planActivation({
              provider: 'anthropic',
              scope: 'deep-verify',
              currentConfig: cfg as CadenceConfig,
            });
            for (const c of plan.changes) {
              setPath(cfg as Record<string, unknown>, [c.seam, 'provider'], c.to);
            }
            activatedProvider = 'anthropic';
          } else {
            activateNoKey = true;
          }
        }

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
        // Phase 196 (issue #177) — gitignore the four CADENCE-owned ephemeral
        // paths (per-worktree loop state, local trust decisions, the intel
        // scratch cache) so tracking them can never produce a real merge
        // conflict across worktrees. Idempotent; safe to call again later
        // (e.g. `cadence doctor --fix`).
        await ensureGitignoreEntries(cwd);
        await writeClaudeMd(cwd, {
          projectName: name,
          gateProfile,
          preset,
        });
        if (opts.host === 'codex') {
          await writeAgentsMd(cwd, {
            projectName: name,
            gateProfile,
            preset,
          });
        }
        // Phase 189 (T3, AC-3) — seed the CONTRIBUTING.md onboarding pointer
        // so the next teammate who clones this repo (`.cadence/` already
        // committed) discovers `cadence onboard` instead of re-running
        // `cadence init` (which would refuse). Merge-idempotent like
        // CLAUDE.md/AGENTS.md; a marker-less user file is left untouched.
        await writeContributingMd(cwd, { projectName: name });

        // Phase 109 — `--demo`: seed a ready-to-approve demo phase into this
        // real repo (objective + AC-1 + T1) using the shared toy template, so
        // the user can run a full loop here with no hand-edit. Leaves the loop
        // in DRAFT. Best-effort: a failure leaves the scaffold intact.
        const DEMO_PHASE = '01-demo';
        const DEMO_NUM = '01';
        let demoSeeded = false;
        if (effectiveDemo) {
          const silentIO: CommandIO = {
            out: () => {},
            err: (s) => void process.stderr.write(s),
          };
          const res = await draftNewService(
            cwd,
            { phase: DEMO_PHASE, num: DEMO_NUM, title: 'Hello loop', tier: 'quick-fix' },
            silentIO,
          );
          if (res.exitCode === 0) {
            const { id, content } = renderDemoDraft(DEMO_PHASE, DEMO_NUM);
            await writeFile(
              join(cadenceDir, 'phases', DEMO_PHASE, `${id}-DRAFT.md`),
              content,
            );
            demoSeeded = true;
          } else {
            console.error('  (could not seed the --demo phase; scaffold is intact)');
          }
        }

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
        console.log(
          `  test command  ${testCommand ?? '(none derived — build-test-must-pass will not run)'}`,
        );
        console.log(`  scaffolded    config.json, state.json, PROJECT.md,`);
        console.log(`                ROADMAP.md, MILESTONES.md,`);
        console.log(`                SPECIAL-FLOWS.md, STATE.md, CLAUDE.md,`);
        console.log(`                CONTRIBUTING.md`);
        console.log(`                phases/ handoff/ research/ archive/`);
        // Phase 135: a --demo phase already leaves the loop in DRAFT, so the
        // generic "next step is draft new" instructions below would refuse
        // immediately if followed — suppress them in favor of the
        // demo-specific "Demo phase ready" block printed further down.
        if (!demoSeeded) {
          console.log('');
          console.log(`  Your first loop`);
          console.log(`  ───────────────`);
          console.log(
            `  1. cadence draft new --title "Fix login timeout" --template bugfix`,
          );
          console.log(`  2. edit the generated DRAFT — templates are scaffolds, not proof`);
          console.log(`  3. cadence draft approve 01-fix-login-timeout 01`);
          console.log(`  4. cadence done T1  (repeat for each task you complete)`);
          console.log(`  5. cadence settle run --auto`);
          console.log('');
          console.log(
            `  Stuck? Run \`cadence progress\` anytime for the next action.`,
          );
          console.log(
            `  Not sure where to go next? Run \`cadence start\` for a guided menu.`,
          );
          console.log(`  Docs: .cadence/ROADMAP.md and the project README.`);
          console.log('');
          console.log(`  Hand it to your AI agent`);
          console.log(`  ────────────────────────`);
          console.log(`  Paste this to your coding agent to scaffold your first real phase:`);
          console.log('');
          process.stdout.write(renderAgentPrompt());
          console.log('');
          console.log(`  Reprint with your goal:  cadence agent-prompt --goal "..."`);
        }
        if (demoSeeded) {
          console.log('');
          console.log(`  Demo phase ready`);
          console.log(`  ────────────────`);
          console.log(
            `  Seeded ${DEMO_PHASE} (objective + AC-1 + T1) — run the whole loop now:`,
          );
          console.log(`    cadence draft approve ${DEMO_PHASE} ${DEMO_NUM}`);
          console.log(`    cadence done T1`);
          console.log(`    cadence settle run --ac AC-1=pass`);
        }
        console.log('');
        if (activatedProvider) {
          console.log(`  Real verification on`);
          console.log(`  ────────────────────`);
          console.log(
            `  ✓ real verification on: ${activatedProvider} (deep-verify) — ANTHROPIC_API_KEY detected.`,
          );
          console.log(`  Watch it judge your work:  cadence settle run --deep`);
        } else {
          console.log(`  Turn on real verification`);
          console.log(`  ─────────────────────────`);
          console.log(`  ${MOCK_VERIFIER_NOTICE.message}`);
          if (activateNoKey) {
            console.log('');
            console.log(
              `  --activate had no ANTHROPIC_API_KEY to use — staying on mock. Set it then re-activate:`,
            );
            console.log(`      export ANTHROPIC_API_KEY=…`);
            console.log(`      cadence activate --provider anthropic`);
          }
        }
        if (gateProfile === 'standard' || gateProfile === 'strict') {
          console.log('');
          console.log(
            `  Note: under the \`${gateProfile}\` gate profile \`cadence draft approve\` is`,
          );
          console.log(
            `  interactive — pass \`--no-approve\` for non-TTY runs (CI, scripts, agents).`,
          );
        }
        const flipNotice = autoFlipNotice(opts.gateProfile, gateProfile);
        if (flipNotice !== null) {
          console.log('');
          console.log(`  ${flipNotice}`);
        }

        // Phase 108 — auto-wire the Claude Code host when .claude/ is present.
        const prompter = makePrompter();
        let hostWire: { wired: boolean; offered: boolean };
        try {
          hostWire = await maybeWireHost(
            cwd,
            { wireHost: effectiveWireHost, skipHostWire: opts.skipHostWire, host: opts.host },
            prompter,
          );
        } finally {
          await prompter?.close?.();
        }
        if (hostWire.offered && !hostWire.wired) {
          console.log('');
          console.log(
            opts.host === 'codex'
              ? '  Codex host not wired.'
              : '  Claude Code workspace detected (.claude/).',
          );
          console.log(
            `  Wire it when ready:  ${hostWireDisplay(opts.host === 'codex' ? 'codex' : 'claude')}`,
          );
        }
        if (opts.host === 'codex' && hostWire.wired) {
          console.log('');
          console.log('  Codex first run');
          console.log('  ───────────────');
          console.log('  Approve the new hooks in Codex, then start a new Codex session.');
          console.log('  If prompts are not loaded yet, ask Codex to run `cadence progress` directly.');
        }

        // Phase 188 (T2, AC-3) — `--full` composes three independently-gated
        // features whose messages are scattered across the run above. Print one
        // consolidated summary at the end, additive to (never replacing) the
        // per-feature blocks. Gated on the raw `opts.full` flag (not the
        // effective-per-subfeature values) so a bare --activate/--demo/--host
        // run keeps today's single-feature output instead of a summary that
        // talks about features the user never asked for. Reuses the same
        // skip-reason text the per-feature blocks above already print.
        if (opts.full) {
          const hostWireTarget = opts.host === 'codex' ? 'codex' : 'claude';
          const hostWireLine = hostWire.wired
            ? `done: ${hostWireDisplay(hostWireTarget)}`
            : hostWire.offered
              ? `skipped: not wired — run \`${hostWireDisplay(hostWireTarget)}\` when ready`
              : opts.skipHostWire
                ? 'skipped: --skip-host-wire passed'
                : 'skipped: no .claude/ workspace detected';
          const demoLine = demoSeeded
            ? `done: ${DEMO_PHASE}`
            : effectiveDemo
              ? 'skipped: could not seed the --demo phase; scaffold is intact'
              : 'skipped: --demo not requested';
          const activationLine = activatedProvider
            ? `done: ${activatedProvider}`
            : activateNoKey
              ? 'skipped: no ANTHROPIC_API_KEY — staying on mock'
              : 'skipped: --activate not requested';
          const summaryTitle = 'Full setup summary';
          console.log('');
          console.log(`  ${summaryTitle}`);
          console.log(`  ${'─'.repeat(summaryTitle.length)}`);
          console.log(`  host wire     ${hostWireLine}`);
          console.log(`  demo phase    ${demoLine}`);
          console.log(`  activation    ${activationLine}`);
        }
      },
    );
}
