import type { Command } from 'commander';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  presets,
  emptyState,
  MOCK_VERIFIER_NOTICE,
  type Profile,
  type CadenceConfig,
} from '@thomas-powers-jr/cadence-types';
import {
  deriveName,
  detectCoverageMode,
  detectInstallCommand,
  detectProjectLanguage,
  detectTestCommand,
  detectTestGlobs,
  planInit,
  renderInitPlan,
  resolveGateProfile,
  resolveProviderSelection,
  suggestGateProfile,
  type InitPlanOptions,
  type ProviderSelectionSource,
} from '../../init/plan.js';
import { deriveProviderConsequence } from '../../init/provider-consequence.js';
import {
  renderCiWorkflowYaml,
  parseGitHubOwnerRepo,
  renderBranchProtectionRecipe,
} from '../../init/ci-workflow.js';
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
import { planActivation, type ActivationScope } from '../../activate/plan.js';
import { setPath } from '../../config-edit/apply.js';
import { renderAgentPrompt } from '../../agent-prompt/render.js';
import {
  ScriptedPrompter,
  StdinPrompter,
  type Prompter,
} from '../../verify/prompter.js';
import type { VerifierProvider } from '../../verify/verifier-factory.js';
import { addIntelligenceDecision } from '../../intelligence/store/decisions.js';

/** Phase 265 (T3) — every value `--verifier-provider` and the init prompt admit. */
const VERIFIER_PROVIDERS: readonly VerifierProvider[] = ['mock', 'anthropic', 'local', 'host-cli'];

function isVerifierProvider(v: string): v is VerifierProvider {
  return (VERIFIER_PROVIDERS as readonly string[]).includes(v);
}

/** Empty answer defaults to `mock` (unshamed, first-class option); any
 *  other unrecognized answer returns `null` so the caller can report it and
 *  fall back rather than silently guessing. */
function parseProviderAnswer(v: string): VerifierProvider | null {
  if (v.length === 0) return 'mock';
  return isVerifierProvider(v) ? v : null;
}

/** Where the provider resolution ended up coming from — used both for the
 *  "real verification on" summary line and the decision-record rationale.
 *  `prompt-invalid` (phase 265, T3 review finding) is distinct from
 *  `default`: a prompter WAS available and WAS invoked, but the operator's
 *  answer wasn't a recognized provider name, so it fell back to mock. That
 *  is a materially different story from "no prompter available" and the
 *  ledger rationale must say so honestly.
 *
 *  Whole-branch review fix (phase 265, Minor finding): `'flag' | 'activate'
 *  | 'full'` used to be re-listed here as independent string literals,
 *  duplicating T1's already-exported `ProviderSelectionSource` (plan.ts).
 *  Deriving from it instead means a future rename of one of those three
 *  values in T1's type surfaces as a compiler error here, not silent drift. */
type ProviderResolutionSource =
  | ProviderSelectionSource
  | 'prompt'
  | 'prompt-invalid'
  | 'default';

const PROVIDER_RESOLUTION_SOURCE_LABEL: Record<ProviderResolutionSource, string> = {
  flag: '--verifier-provider',
  activate: '--activate',
  full: '--full',
  prompt: 'the interactive init prompt',
  'prompt-invalid': 'an unrecognized answer to the interactive init prompt (defaulted to mock)',
  default: 'no prompter available (non-interactive default)',
};

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
    .option(
      '--ci',
      'generate a GitHub Actions workflow that runs `cadence verify phase --changed` on pull requests, plus a branch-protection recipe; allowed on an already-initialized project',
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
      '--verifier-provider <provider>',
      'mock | anthropic | local | host-cli — explicit choice, wins over --activate/--full and over prompting',
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
        ci?: boolean;
        host?: string;
        wireHost?: boolean;
        skipHostWire?: boolean;
        demo?: boolean;
        activate?: boolean;
        verifierProvider?: string;
        dryRun?: boolean;
        full?: boolean;
      }) => {
        const cwd = process.cwd();
        const cadenceDir = join(cwd, '.cadence');

        // Whole-branch review fix (phase 265, Important finding): a single
        // prompter shared across both possible interactive steps in one
        // `init` run — the provider-selection prompt below and
        // `maybeWireHost`'s host-wire prompt further down. `makePrompter()`
        // builds a brand-new `ScriptedPrompter` (cursor reset to 0 on every
        // call) or `StdinPrompter` (a new readline interface) every time
        // it's invoked; calling it twice in one run silently desyncs a
        // `CADENCE_PROMPTER_SCRIPT` script between the two prompts — the
        // host-wire question would receive whatever the FIRST scripted
        // answer was, not the one actually intended for it. Lazily created
        // (never built when neither step ends up needing one, e.g. the
        // provider resolved via a flag and .claude/ isn't present) and
        // memoized so at most one instance ever exists per run; closed
        // exactly once, at the very end of the run, after both possible
        // uses (see the host-wire step's `finally` further down).
        let sharedPrompter: Prompter | null | undefined;
        function getPrompter(): Prompter | null {
          if (sharedPrompter === undefined) {
            sharedPrompter = makePrompter();
          }
          return sharedPrompter;
        }

        // Phase 188 — `--full` sets *defaults* for --wire-host/--demo/--activate;
        // an explicitly-passed flag (including a negative one like
        // --skip-host-wire, handled separately below) always wins over the
        // --full-implied default (AC-5).
        const effectiveWireHost = opts.wireHost ?? opts.full;
        const effectiveDemo = opts.demo ?? opts.full;

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

        // Phase 265 (T3) — validate --verifier-provider the same way --host
        // is validated just above: reject unknown values with a clear
        // stderr message + exit 2, before reaching --dry-run's early return
        // (matches --host's own precedent of validating ahead of it).
        if (opts.verifierProvider !== undefined && !isVerifierProvider(opts.verifierProvider)) {
          console.error(
            `Unknown --verifier-provider: ${opts.verifierProvider} (expected mock|anthropic|local|host-cli)`,
          );
          process.exit(2);
          return;
        }
        // InitPlanOptions-typed view of `opts`, narrowing verifierProvider
        // from the raw CLI string to the validated VerifierProvider union.
        // Shared by --dry-run's planInit call and the real
        // resolveProviderSelection call below so the two can never disagree
        // about what was passed.
        const planOpts: InitPlanOptions = {
          ...opts,
          verifierProvider: opts.verifierProvider as VerifierProvider | undefined,
        };

        // Phase 132 (rec-20260619-005) — --dry-run fit check. Resolve everything
        // init would resolve, print the preview, and write NOTHING. Takes
        // precedence over --claude-md, and previews (never exit-2 refuses) on an
        // already-initialized repo so it stays a safe pre-flight check.
        if (opts.dryRun) {
          try {
            const plan = planInit(
              cwd,
              planOpts,
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

        // Phase 204 (rec-20260709-003) — standalone CI-workflow regeneration,
        // same "only this one artifact, allowed on an already-initialized
        // project" shape as --claude-md/--agents-md above.
        if (opts.ci) {
          const workflowDir = join(cwd, '.github', 'workflows');
          const workflowPath = join(workflowDir, 'cadence-verify.yml');
          if (existsSync(workflowPath)) {
            console.error(`init --ci refused: ${workflowPath} already exists`);
            process.exit(2);
            return;
          }
          const installCommand = detectInstallCommand(cwd);
          await mkdir(workflowDir, { recursive: true });
          await writeFile(workflowPath, renderCiWorkflowYaml(installCommand));
          console.log(`Wrote ${workflowPath}`);

          let ownerRepo: ReturnType<typeof parseGitHubOwnerRepo> = null;
          try {
            const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {
              cwd,
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore'],
            });
            ownerRepo = parseGitHubOwnerRepo(remote);
          } catch {
            ownerRepo = null;
          }
          let defaultBranch = 'main';
          try {
            const ref = execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD'], {
              cwd,
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore'],
            });
            defaultBranch = ref.trim().split('/').pop() ?? 'main';
          } catch {
            defaultBranch = 'main';
          }
          console.log('\n' + renderBranchProtectionRecipe(ownerRepo, defaultBranch));
          return;
        }

        if (existsSync(cadenceDir)) {
          console.error('.cadence/ already initialized in this directory');
          // rec-20260726-002: a fresh git worktree/clone carries the
          // committed .cadence/ scaffold but never state.json (gitignored
          // since phase 196) — `init` still must not silently bootstrap it
          // (only the message changes), but point at `cadence onboard`,
          // which already handles exactly this case.
          if (!existsSync(join(cadenceDir, 'state.json'))) {
            console.error(
              'state.json is missing (likely a fresh git worktree or clone) — run `cadence onboard` to bootstrap it instead.',
            );
          }
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
            // Phase 239: fresh inits opt in to phase-qualified coverage
            // tokens. This overlay — not `defaultConfig` — is the opt-in
            // point: `loadConfig` merges the user's config.json over
            // `defaultConfig`, so a strict value there would silently flip
            // every pre-existing consumer on upgrade; only init can
            // distinguish a fresh project from an upgraded one. Written
            // unconditionally (unlike the language-detected `coverageMode`
            // above) — every fresh init gets the qualified scheme.
            coverageScheme: 'phase-qualified' as const,
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

        // Phase 265 (T1/T3, AC-1/AC-2/AC-3) — resolve the verifier provider
        // explicitly: an explicit --verifier-provider flag, --activate/
        // --full (unchanged anthropic-if-keyed-else-mock rule — T1's
        // resolver applies exactly the rule this block used to apply
        // inline, phase 110), an interactive prompt when a prompter is
        // available and no flag settled it outright, or a silent
        // default-mock (D-B: never coerced onto a real provider). The key
        // is never persisted (only the provider name is written); no live
        // ping here — that stays in `cadence activate`. Replaces the old
        // hasAnthropicKey-only block.
        const selection = resolveProviderSelection(
          planOpts,
          process.env,
          Boolean(process.stdin.isTTY),
        );

        let resolvedProvider: VerifierProvider = presetCfg.verifier.provider;
        let resolvedScope: ActivationScope = 'deep-verify';
        let resolvedSource: ProviderResolutionSource = 'default';
        // Preserved for back-compat: these two drive the pre-existing
        // --activate/--full messaging (the "Real verification on" block
        // below, and the --full summary block further down) exactly as
        // before — only ever set from an --activate/--full resolution,
        // matching what the old inline block computed.
        let activatedProvider: 'anthropic' | null = null;
        let activateNoKey = false;

        if (selection.action === 'use') {
          resolvedProvider = selection.provider;
          resolvedScope = selection.scope;
          resolvedSource = selection.source;
          if (selection.source === 'activate' || selection.source === 'full') {
            if (selection.provider === 'anthropic') activatedProvider = 'anthropic';
            else activateNoKey = true;
          }
        } else if (selection.action === 'prompt') {
          // AC-1: mirrors activate.ts's readlinePrompt shape (mock listed
          // as a normal, unshamed option) but built on the shared
          // makePrompter()/Prompter seam instead of raw readline, so
          // CADENCE_PROMPTER_SCRIPT-driven tests exercise the same prompt
          // logic a real TTY does.
          //
          // Whole-branch review fix (phase 265, Important finding): this
          // prompter is shared with `maybeWireHost`'s host-wire prompt
          // further down via `getPrompter()`'s memoization, and is closed
          // exactly once, after both possible uses — deliberately NOT here.
          // Closing it here (the old behavior) left the host-wire step's own
          // `makePrompter()` call building a second, independent,
          // cursor-reset instance — see `getPrompter()`'s comment above.
          const prompter = getPrompter();
          if (prompter !== null) {
            const providerAns = (
              await prompter.ask(
                'Verifier provider for deep-verify [mock/anthropic/local/host-cli] (default: mock): ',
              )
            ).trim();
            const chosen = parseProviderAnswer(providerAns);
            if (chosen !== null) {
              resolvedProvider = chosen;
              resolvedSource = 'prompt';
              const broadenAns = (
                await prompter.ask('Enable the other verifier gates too? [y/N]: ')
              )
                .trim()
                .toLowerCase();
              resolvedScope = broadenAns === 'y' || broadenAns === 'yes' ? 'all' : 'deep-verify';
            } else {
              console.error(
                `Not a provider: ${providerAns} (expected mock|anthropic|local|host-cli) — defaulting to mock.`,
              );
              // Review finding (phase 265, T3): a prompter WAS available
              // and WAS invoked here — only the answer was unrecognized.
              // Leaving `resolvedSource` at its 'default' initial value
              // would make the decision-record rationale below falsely
              // claim "no prompter available (non-interactive default)".
              // `prompt-invalid` keeps that rationale honest without
              // being indistinguishable from a genuine valid mock
              // selection made through the prompt (`'prompt'`).
              resolvedSource = 'prompt-invalid';
            }
          }
          // else: a prompter should always be available whenever the
          // resolver says 'prompt' — they share the same availability
          // predicate (isTTY || CADENCE_PROMPTER_SCRIPT). If it's ever null
          // anyway (e.g. StdinPrompter's constructor throwing), fall
          // through to the default-mock resolution already set above
          // rather than crashing init.
        }

        {
          const plan = planActivation({
            provider: resolvedProvider,
            scope: resolvedScope,
            currentConfig: cfg as CadenceConfig,
          });
          for (const c of plan.changes) {
            setPath(cfg as Record<string, unknown>, [c.seam, 'provider'], c.to);
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

        // Phase 265 (T3, AC-3) — record the resolved provider selection as
        // a retrievable intelligence-ledger decision on every completed
        // init run: interactive, explicit-flag, --activate/--full, or
        // defaulted-mock. Deliberately WITHOUT a recommendationId —
        // rec-20260808-006 only exists in this repo's own ledger; passing
        // any id would throw "unknown recommendation" in every consumer
        // repo that runs `cadence init`. Best-effort: init's core job
        // (scaffolding the repo) must not be blocked by a ledger-write
        // failure — but per this repo's "Quiet Fallback" rule, a failure
        // here prints a loud stderr notice rather than being silently
        // swallowed.
        try {
          await addIntelligenceDecision(cwd, {
            title: `cadence init: verifier provider selection (${resolvedProvider}, scope: ${resolvedScope})`,
            rationale:
              `Resolved via ${PROVIDER_RESOLUTION_SOURCE_LABEL[resolvedSource]}. ` +
              deriveProviderConsequence(resolvedProvider, gateProfile),
          });
        } catch (err) {
          console.error(
            `cadence init: could not record the provider-selection decision (${
              err instanceof Error ? err.message : String(err)
            }) — continuing; the scaffold itself is unaffected.`,
          );
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
        if (resolvedProvider !== 'mock') {
          console.log(`  Real verification on`);
          console.log(`  ────────────────────`);
          if (activatedProvider) {
            console.log(
              `  ✓ real verification on: ${activatedProvider} (deep-verify) — ANTHROPIC_API_KEY detected.`,
            );
          } else {
            console.log(
              `  ✓ real verification on: ${resolvedProvider} (scope: ${resolvedScope}) — chosen via ${PROVIDER_RESOLUTION_SOURCE_LABEL[resolvedSource]}.`,
            );
          }
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

        // Phase 108 — auto-wire the Claude Code host when .claude/ is
        // present. Whole-branch review fix (phase 265): reuses the same
        // prompter instance the provider-selection prompt above may already
        // have created — `getPrompter()` is memoized, so this is the ONLY
        // `makePrompter()` call site actually reached on a run that never
        // needed a prompter earlier (e.g. the provider resolved via a flag).
        const prompter = getPrompter();
        let hostWire: { wired: boolean; offered: boolean };
        try {
          hostWire = await maybeWireHost(
            cwd,
            { wireHost: effectiveWireHost, skipHostWire: opts.skipHostWire, host: opts.host },
            prompter,
          );
        } catch (err) {
          // Whole-branch review fix (phase 265, second pass, blocking
          // finding): a `CADENCE_PROMPTER_SCRIPT` written for the
          // pre-existing single host-wire `[Y/n]` prompt (e.g. `'y'`) now
          // gets consumed by the NEW provider-selection prompt above
          // instead — an unrecognized provider answer falls into the
          // `prompt-invalid` branch, which asks no broaden follow-up, so
          // only one answer is used there but the script is still left
          // exhausted by the time this step's own `prompter.ask(...)`
          // runs. `ScriptedPrompter` throws rather than hanging or
          // silently returning a default (see `prompter.ts`). Host wiring
          // is a best-effort convenience step and the scaffold above is
          // already fully written by this point — per this repo's "Quiet
          // Fallback" rule (mirrors the `addIntelligenceDecision` try/catch
          // above), this degrades loudly via stderr instead of letting the
          // exception propagate and crash the whole `cadence init` run,
          // which would otherwise leave a half-initialized, non-idempotent
          // `.cadence/` behind (a retry would then hit "already
          // initialized"). `offered: false` here is deliberately not a
          // guess at `true` — this catch cannot know whether
          // `maybeWireHost` had already decided to offer before failing.
          hostWire = { wired: false, offered: false };
          console.error(
            `cadence init: could not complete host wiring (${
              err instanceof Error ? err.message : String(err)
            }) — continuing; the scaffold itself is unaffected. Wire the host manually when ready:`,
          );
          console.error(`  ${hostWireDisplay(opts.host === 'codex' ? 'codex' : 'claude')}`);
        } finally {
          // Single close point for the whole run — covers both this step
          // and the provider-selection prompt above, which deliberately
          // does not close its own prompter (see the comment there).
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
          // Review finding (phase 265, T3): `activatedProvider`/`activateNoKey`
          // are only ever set from an --activate/--full resolution
          // (source === 'activate' || 'full'), but an explicit
          // --verifier-provider flag resolves with source === 'flag' and
          // correctly wins over --full (see the "Real verification on"
          // block above, and resolveProviderSelection's own precedence).
          // Without this branch, --full --verifier-provider <x> would fall
          // through to "skipped: --activate not requested" directly under a
          // block that just said real verification WAS turned on —
          // self-contradicting, user-visible output. Checked first so any
          // flag-driven resolution always wins this line, matching the same
          // precedence already honored everywhere else.
          //
          // Whole-branch review fix (phase 265, Minor finding): this used to
          // additionally guard on `&& resolvedProvider !== 'mock'`, which
          // mischaracterized `--full --verifier-provider mock` — an explicit
          // choice — as "skipped: --activate not requested", as if it were
          // never requested at all. `done: mock (via --verifier-provider)`
          // already describes an explicit mock choice honestly, exactly as
          // it does for any other explicit provider, so the guard is simply
          // dropped rather than special-cased.
          const activationLine =
            resolvedSource === 'flag'
              ? `done: ${resolvedProvider} (via --verifier-provider)`
              : activatedProvider
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
