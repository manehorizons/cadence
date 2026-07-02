import { execSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { presets, type Profile } from '@manehorizons/cadence-types';
import { derivePhaseTaskId } from '../phases/id.js';

const GATE_PROFILES: readonly Profile[] = ['strict', 'standard', 'auto'];

/**
 * Suggest a gate profile from git history: a repo with ≥20 commits is
 * mature enough to want the `standard` gate set; a reachable repo with
 * fewer commits gets `auto`; any git failure (no repo, bare, zero commits)
 * also falls back to `auto`. Never throws.
 *
 * (Relocated from init.ts in phase 132 so `planInit` and the init write path
 * share one source of truth.)
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

/** Lockfile → package-manager run prefix, checked in this order. */
const PM_LOCKFILES: readonly { file: string; run: string }[] = [
  { file: 'pnpm-lock.yaml', run: 'pnpm test' },
  { file: 'yarn.lock', run: 'yarn test' },
  { file: 'bun.lockb', run: 'bun test' },
  { file: 'package-lock.json', run: 'npm test' },
];

/**
 * Derive `verification.testCommand` from the target repo's
 * `package.json#scripts.test`, prefixed with the package manager detected by
 * lockfile presence (`pnpm-lock.yaml` → `pnpm test`, `yarn.lock` →
 * `yarn test`, `bun.lockb` → `bun test`, `package-lock.json` or no lockfile
 * found → `npm test`). Returns `null` when there's no `package.json` or no
 * `scripts.test` entry — never guesses a command, never throws (Phase 139,
 * rec-20260701-001).
 */
export function detectTestCommand(cwd: string): string | null {
  let hasTestScript = false;
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    hasTestScript = typeof pkg?.scripts?.test === 'string' && pkg.scripts.test.trim().length > 0;
  } catch {
    hasTestScript = false;
  }
  if (!hasTestScript) return null;

  for (const { file, run } of PM_LOCKFILES) {
    if (existsSync(join(cwd, file))) return run;
  }
  return 'npm test';
}

/**
 * Phase 108 (rec-20260617-001) — zero-prompt name derivation. `--name` wins;
 * otherwise read `package.json#name` (scope stripped: `@scope/foo` → `foo`),
 * then fall back to the working-directory basename, then the literal
 * `unnamed` only when nothing else is available. Never prompts, never throws.
 */
export function deriveName(cwd: string, flagName: string | undefined): string {
  if (flagName !== undefined) return flagName;
  const fromPkg = packageJsonName(cwd);
  if (fromPkg !== null) return fromPkg;
  const base = basename(cwd).trim();
  return base.length > 0 ? base : 'unnamed';
}

/** Scope-stripped `package.json#name`, or null if absent/unreadable/empty. */
function packageJsonName(cwd: string): string | null {
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
    /* no/unreadable package.json */
  }
  return null;
}

export function isGateProfile(v: string): v is Profile {
  return (GATE_PROFILES as readonly string[]).includes(v);
}

/**
 * Phase 108 — zero-prompt gate-profile resolution. `--gate-profile` wins (and
 * is validated); otherwise use the git-history suggestion. No prompt.
 */
export function resolveGateProfile(
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

/** Where the resolved project name came from (phase 132 fit-check provenance). */
export type NameSource = 'flag' | 'package.json' | 'dirname';

/** What the host-wire step would do, reported by the fit-check. */
export type HostWireDecision =
  | 'no-claude' // no .claude/ workspace present
  | 'wire' // --wire-host (auto-run, no prompt)
  | 'skip' // --skip-host-wire
  | 'prompt' // .claude/ present + a prompter is available (TTY/scripted) → would ask
  | 'skip-non-tty'; // .claude/ present, no flag, non-TTY → skip with a pointer

/** Options that influence what `cadence init` would resolve and write. */
export interface InitPlanOptions {
  name?: string | undefined;
  preset?: 'solo' | 'team' | 'production' | undefined;
  profile?: 'solo' | 'team' | 'production' | undefined;
  gateProfile?: string | undefined;
  activate?: boolean | undefined;
  demo?: boolean | undefined;
  wireHost?: boolean | undefined;
  skipHostWire?: boolean | undefined;
}

export interface InitPlanVerification {
  /** Verifier provider the deep-verify seam would carry after init. */
  provider: 'mock' | 'anthropic' | 'local';
  /** True once a non-mock provider is wired (real verification on). */
  realVerificationOn: boolean;
  /** `--activate` was requested. */
  activateRequested: boolean;
  /** `--activate` requested but no `ANTHROPIC_API_KEY` present → stays mock. */
  activateNoKey: boolean;
  /** Phase 139: derived `verification.testCommand`, or `null` when nothing
   *  could be derived (no `package.json` / no `scripts.test`). */
  testCommand: string | null;
}

export interface InitPlanHost {
  /** A `.claude/` workspace is present in the cwd. */
  claudePresent: boolean;
  decision: HostWireDecision;
  /** Convenience: the host install would actually run unattended. */
  wouldWire: boolean;
}

/**
 * Phase 132 (rec-20260619-005) — a pure, inspectable description of what
 * `cadence init` would resolve and write, with **no filesystem writes and no
 * `process.exit`**. Powers `cadence init --dry-run` (the fit-check) without
 * touching the tree; the real write path is left unchanged.
 */
export interface InitPlan {
  cwd: string;
  /** `.cadence/` already exists ⇒ a real init would refuse (exit 2). */
  alreadyInitialized: boolean;
  name: string;
  nameSource: NameSource;
  preset: 'solo' | 'team' | 'production';
  gateProfile: Profile;
  gateProfileSource: 'flag' | 'git-suggested';
  layout: 'monorepo' | 'single-package';
  testGlobs: string[];
  verification: InitPlanVerification;
  host: InitPlanHost;
  demo: boolean;
  /**
   * Ordered relative paths init would create (dirs end with `/`). Empty when
   * `alreadyInitialized` — a real init would refuse before writing anything.
   */
  files: string[];
}

/** Files/dirs a fresh `cadence init` creates, in write order (relative to cwd). */
const BASE_SCAFFOLD: readonly string[] = [
  '.cadence/',
  '.cadence/phases/',
  '.cadence/handoff/',
  '.cadence/research/',
  '.cadence/archive/',
  '.cadence/config.json',
  '.cadence/state.json',
  '.cadence/STATE.md',
  '.cadence/PROJECT.md',
  '.cadence/ROADMAP.md',
  '.cadence/MILESTONES.md',
  '.cadence/SPECIAL-FLOWS.md',
  'CLAUDE.md',
];

const DEMO_PHASE = '01-demo';
const DEMO_NUM = '01';

/**
 * Resolve everything `cadence init` would resolve, as a pure plan. Inspects the
 * cwd read-only (package.json, `packages/`, `.claude/`, git history) exactly as
 * the init write path's helpers already do; writes nothing. May throw only for
 * an invalid `--gate-profile` (same validation as the write path) — never exits.
 */
export function planInit(
  cwd: string,
  opts: InitPlanOptions,
  env: NodeJS.ProcessEnv = {},
  isTTY = false,
): InitPlan {
  const preset = opts.preset ?? opts.profile ?? 'team';
  const alreadyInitialized = existsSync(join(cwd, '.cadence'));

  const name = deriveName(cwd, opts.name);
  const nameSource: NameSource =
    opts.name !== undefined
      ? 'flag'
      : packageJsonName(cwd) !== null
        ? 'package.json'
        : 'dirname';

  const gateProfile = resolveGateProfile(opts.gateProfile, suggestGateProfile(cwd));
  const gateProfileSource = opts.gateProfile !== undefined ? 'flag' : 'git-suggested';

  const testGlobs = detectTestGlobs(cwd);
  const layout = testGlobs[0]?.startsWith('packages/') ? 'monorepo' : 'single-package';

  const verification = planVerification(cwd, preset, opts.activate ?? false, env);
  const host = planHost(cwd, opts, env, isTTY);
  const demo = opts.demo ?? false;

  const files = alreadyInitialized ? [] : buildFileList(demo);

  return {
    cwd,
    alreadyInitialized,
    name,
    nameSource,
    preset,
    gateProfile,
    gateProfileSource,
    layout,
    testGlobs,
    verification,
    host,
    demo,
    files,
  };
}

function planVerification(
  cwd: string,
  preset: 'solo' | 'team' | 'production',
  activate: boolean,
  env: NodeJS.ProcessEnv,
): InitPlanVerification {
  const base = presets[preset].verifier.provider;
  const hasKey =
    typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.length > 0;
  let provider: 'mock' | 'anthropic' | 'local' = base;
  let activateNoKey = false;
  if (activate) {
    if (hasKey) provider = 'anthropic';
    else activateNoKey = true;
  }
  return {
    testCommand: detectTestCommand(cwd),
    provider,
    realVerificationOn: provider !== 'mock',
    activateRequested: activate,
    activateNoKey,
  };
}

/**
 * Mirror `maybeWireHost`'s decision table (init.ts) as a pure report. A
 * prompter is "available" when `CADENCE_PROMPTER_SCRIPT` is set or stdin is a
 * TTY — the same test `makePrompter()` applies.
 */
function planHost(
  cwd: string,
  opts: InitPlanOptions,
  env: NodeJS.ProcessEnv,
  isTTY: boolean,
): InitPlanHost {
  const claudePresent = existsSync(join(cwd, '.claude'));
  if (!claudePresent) {
    return { claudePresent: false, decision: 'no-claude', wouldWire: false };
  }
  if (opts.skipHostWire) {
    return { claudePresent: true, decision: 'skip', wouldWire: false };
  }
  if (opts.wireHost) {
    return { claudePresent: true, decision: 'wire', wouldWire: true };
  }
  const prompterAvailable = env.CADENCE_PROMPTER_SCRIPT !== undefined || isTTY;
  if (prompterAvailable) {
    return { claudePresent: true, decision: 'prompt', wouldWire: false };
  }
  return { claudePresent: true, decision: 'skip-non-tty', wouldWire: false };
}

function buildFileList(demo: boolean): string[] {
  const files = [...BASE_SCAFFOLD];
  if (demo) {
    const id = derivePhaseTaskId(DEMO_PHASE, DEMO_NUM);
    files.push(`.cadence/phases/${DEMO_PHASE}/`, `.cadence/phases/${DEMO_PHASE}/${id}-DRAFT.md`);
  }
  return files;
}

const NAME_SOURCE_LABEL: Record<NameSource, string> = {
  flag: 'from --name',
  'package.json': 'from package.json',
  dirname: 'from directory name',
};

function verificationLine(v: InitPlanVerification): string {
  if (v.provider === 'mock') {
    if (v.activateNoKey) {
      return 'mock  (--activate had no ANTHROPIC_API_KEY — staying on mock)';
    }
    return 'mock  (placeholder — not real verification; run `cadence activate` to enable)';
  }
  return `${v.provider}  (real verification on — deep-verify)`;
}

function hostLine(h: InitPlanHost): string {
  switch (h.decision) {
    case 'no-claude':
      return 'no .claude/ workspace — host wiring skipped';
    case 'wire':
      return '.claude/ present — would wire the Claude Code host';
    case 'skip':
      return '.claude/ present — wiring skipped (--skip-host-wire)';
    case 'prompt':
      return '.claude/ present — would prompt to wire the Claude Code host';
    case 'skip-non-tty':
      return '.claude/ present — would skip wiring (non-TTY); wire later with the host install';
  }
}

/**
 * Phase 132 — render an `InitPlan` as a terminal-sized fit-check preview. Pure:
 * `(plan) → string`. Always states that nothing was written.
 */
export function renderInitPlan(plan: InitPlan): string {
  const lines: string[] = [];
  lines.push('  CADENCE init — dry run (no changes written)');
  lines.push('  ───────────────────────────────────────────');
  lines.push(`  project       ${plan.name}  (${NAME_SOURCE_LABEL[plan.nameSource]})`);
  lines.push(`  preset        ${plan.preset}  (config preset)`);
  lines.push(
    `  gate profile  ${plan.gateProfile}  (${
      plan.gateProfileSource === 'flag' ? 'from --gate-profile' : 'suggested from git history'
    })`,
  );
  lines.push(`  layout        ${plan.layout}`);
  lines.push(`  test globs    ${plan.testGlobs.join(', ')}`);
  lines.push(
    `  test command  ${plan.verification.testCommand ?? '(none derived — build-test-must-pass will not run)'}`,
  );
  lines.push(`  verification  ${verificationLine(plan.verification)}`);
  lines.push(`  host          ${hostLine(plan.host)}`);
  lines.push(`  demo phase    ${plan.demo ? 'yes (01-demo)' : 'no'}`);
  lines.push('');
  if (plan.alreadyInitialized) {
    lines.push('  Would create  (nothing — .cadence/ already initialized)');
    lines.push('');
    lines.push(
      '  Note: a real `cadence init` would refuse here — .cadence/ already exists.',
    );
  } else {
    lines.push(`  Would create  (${plan.files.length})`);
    for (const f of plan.files) lines.push(`    ${f}`);
  }
  lines.push('');
  lines.push('  Dry run — nothing was written. Run `cadence init` to apply.');
  lines.push('');
  return lines.join('\n');
}
