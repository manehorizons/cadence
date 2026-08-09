import { execSync } from 'node:child_process';
import { existsSync, statSync, readFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { presets, type Profile } from '@thomas-powers-jr/cadence-types';
import { derivePhaseTaskId } from '../phases/id.js';
import type { VerifierProvider } from '../verify/verifier-factory.js';
import type { ActivationScope } from '../activate/plan.js';

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

/** Languages `detectProjectLanguage` can identify from root marker files. */
export type ProjectLanguage = 'js' | 'python' | 'go' | 'rust' | 'php' | 'unknown';

/**
 * Best-effort project-language sniff from root marker files (Phase 166,
 * AC-1). Checked in this exact priority order — `package.json` first, so a
 * mixed-language monorepo (e.g. a root `package.json` alongside a nested
 * `pyproject.toml`) deterministically resolves to `'js'` rather than
 * guessing at monorepo structure (an explicitly open question, out of scope
 * here). Never throws — any fs failure (missing dir, permission error) falls
 * back to `'unknown'`.
 */
export function detectProjectLanguage(cwd: string): ProjectLanguage {
  if (exists(cwd, 'package.json')) return 'js';
  if (
    exists(cwd, 'pyproject.toml') ||
    exists(cwd, 'setup.py') ||
    exists(cwd, 'requirements.txt')
  ) {
    return 'python';
  }
  if (exists(cwd, 'go.mod')) return 'go';
  if (exists(cwd, 'Cargo.toml')) return 'rust';
  if (exists(cwd, 'composer.json')) return 'php';
  return 'unknown';
}

/** `existsSync` wrapped so a permission/read error degrades to `false`, never throws. */
function exists(cwd: string, file: string): boolean {
  try {
    return existsSync(join(cwd, file));
  } catch {
    return false;
  }
}

/**
 * Language-aware default test-file globs for non-js/ts languages (Phase 166,
 * AC-2). Rust's `src/**\/*.rs` entry was added in Phase 167 (AC-10): idiomatic
 * Rust unit tests commonly live inline, in a `#[cfg(test)] mod tests { ... }`
 * block within the same file as the code under test, rather than only under
 * `tests/` or in a `*_test.rs`-suffixed file — the attribute-aware rust
 * coverage profile (`../verify/coverage-profiles/rust.ts`) only ever yields
 * spans for genuine `#[test]` functions, so widening the glob to include all
 * of `src/` cannot itself manufacture false-positive coverage evidence out of
 * non-test source. This map is consulted only at fresh-`cadence init` time
 * (`detectTestGlobs`, below) — an existing `.cadence/config.json` is never
 * rewritten by init (init.ts refuses outright when `.cadence/` already
 * exists, before any glob detection runs).
 */
const LANGUAGE_TEST_GLOBS: Partial<Record<ProjectLanguage, string[]>> = {
  python: ['**/test_*.py', '**/*_test.py'],
  go: ['**/*_test.go'],
  rust: ['tests/**/*.rs', '**/*_test.rs', 'src/**/*.rs'],
  php: ['**/*Test.php', 'tests/**/*.php'],
};

/**
 * Pick `verification.testGlobs` from the repo's layout and detected language
 * (F2, Phase 29.1 shakedown; language-aware defaults added Phase 166, AC-2).
 * For `'js'`/`'unknown'` the original behavior is unchanged: a `packages/`
 * directory at the init root means a monorepo — keep the workspace glob
 * (correct for cadence's own dogfood); any other shape is treated as
 * single-package, a depth-agnostic `**\/*.test.ts(x)` glob so the
 * test-coverage gate can match tests under `tests/`, `src/`, `__tests__/`,
 * etc. Other detected languages get sensible defaults for that language's
 * conventional test-file naming instead. `lang` defaults to
 * `detectProjectLanguage(cwd)` but can be passed explicitly by callers that
 * already detected it, to avoid a second fs sniff. Never throws.
 */
export function detectTestGlobs(
  cwd: string,
  lang: ProjectLanguage = detectProjectLanguage(cwd),
): string[] {
  const languageDefault = LANGUAGE_TEST_GLOBS[lang];
  if (languageDefault !== undefined) return languageDefault;

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

/** `verification.coverageMode` values the config schema admits. */
export type CoverageMode = 'mention' | 'assertion';

/**
 * Language-aware `verification.coverageMode` default (Phase 166, AC-1). The
 * config schema's static default (`packages/types/src/config.ts`'s
 * `DEFAULT_CONFIG`) writes `'assertion'` unconditionally. When this default
 * was written (Phase 166), `assertion` mode's span-finder understood JS/TS
 * test files only, so defaulting a non-JS/TS project to `assertion` would
 * have produced a `test-coverage` gate that could never pass no matter how
 * well-tested the code was — `'js'` kept that default unchanged, every other
 * detected (or undetected) language got the honest `'mention'` default
 * instead. As of Phase 167 the span-finder is a shared multi-language engine
 * with real built-in support for python/go/rust/php too (per-file dispatch,
 * `../verify/coverage-profiles/registry.ts`), so `'assertion'` is no longer
 * permanently unsatisfiable for those languages — but this function's
 * *behavior* is deliberately unchanged: Phase 167 shipped the span-parsing,
 * not a revisit of what a fresh `init` auto-writes, so non-js languages
 * still default to `'mention'` here, and switching to `'assertion'` is left
 * as a manual, informed `cadence config edit coverageMode` choice that now
 * genuinely works (see `docs/reference/config.md`'s "Supported-language
 * matrix" section). `lang` defaults to `detectProjectLanguage(cwd)` but can
 * be passed explicitly by callers (e.g. `init.ts`) that already detected it,
 * to share one fs sniff with `detectTestGlobs`. Never throws.
 */
export function detectCoverageMode(
  cwd: string,
  lang: ProjectLanguage = detectProjectLanguage(cwd),
): CoverageMode {
  return lang === 'js' ? 'assertion' : 'mention';
}

export type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

/** Lockfile → detected package manager, checked in this order. */
const PM_LOCKFILES: readonly { file: string; pm: PackageManager }[] = [
  { file: 'pnpm-lock.yaml', pm: 'pnpm' },
  { file: 'yarn.lock', pm: 'yarn' },
  { file: 'bun.lockb', pm: 'bun' },
  { file: 'package-lock.json', pm: 'npm' },
];

const PM_TEST_COMMAND: Record<PackageManager, string> = {
  pnpm: 'pnpm test',
  yarn: 'yarn test',
  bun: 'bun test',
  npm: 'npm test',
};

const PM_INSTALL_COMMAND: Record<PackageManager, string> = {
  pnpm: 'pnpm install --frozen-lockfile',
  yarn: 'yarn install --frozen-lockfile',
  bun: 'bun install --frozen-lockfile',
  npm: 'npm ci',
};

/**
 * Lockfile presence → package manager, defaulting to `npm` when none match
 * (mirrors `detectTestCommand`'s existing no-lockfile fallback). Never
 * throws. Split out of `detectTestCommand` so `cadence init --ci` (a
 * separate task in this same phase) can derive an install command from the
 * same single detection instead of a second, parallel one.
 */
export function detectPackageManager(cwd: string): PackageManager {
  for (const { file, pm } of PM_LOCKFILES) {
    if (existsSync(join(cwd, file))) return pm;
  }
  return 'npm';
}

/**
 * Install command for the detected package manager. Unlike
 * `detectTestCommand`, this always returns a value — installing
 * dependencies doesn't depend on a `scripts.test` entry existing.
 */
export function detectInstallCommand(cwd: string): string {
  return PM_INSTALL_COMMAND[detectPackageManager(cwd)];
}

/**
 * Derive `verification.testCommand` from the target repo's
 * `package.json#scripts.test`, prefixed with the package manager detected by
 * `detectPackageManager` (`pnpm-lock.yaml` → `pnpm test`, `yarn.lock` →
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
  return PM_TEST_COMMAND[detectPackageManager(cwd)];
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
  /** One-command full setup (`--full`); composes like `--activate` for
   *  provider selection when neither an explicit flag nor `--activate` is
   *  given (phase 265, T1). */
  full?: boolean | undefined;
  /** Explicit `--verifier-provider <mock|anthropic|local|host-cli>` (phase
   *  265, T1) — always wins over `--activate`/`--full` and over prompting. */
  verifierProvider?: VerifierProvider | undefined;
  demo?: boolean | undefined;
  wireHost?: boolean | undefined;
  skipHostWire?: boolean | undefined;
}

/** Where a resolved verifier-provider selection came from (phase 265, T1). */
export type ProviderSelectionSource = 'flag' | 'activate' | 'full';

/**
 * Phase 265 (T1) — pure description of what `cadence init` would do to
 * resolve the verifier provider before writing `config.json`:
 *
 * - `'prompt'` — a prompter would be available (real TTY stdin, or
 *   `CADENCE_PROMPTER_SCRIPT` set for scripted testing of the same prompt
 *   logic a real TTY would use) and no flag settled it outright, so a real
 *   `cadence init` would ask the operator to choose explicitly.
 * - `'use'` — an explicit `--verifier-provider` flag, or `--activate`/
 *   `--full`, settled the provider outright; `source` says which.
 * - `'default-mock'` — no flag and no prompter available (e.g. CI, a script,
 *   an agent session) → silently resolves to `mock` (D-B: never coerced onto
 *   a real provider).
 */
export type ProviderSelectionResult =
  | { action: 'prompt' }
  | { action: 'use'; provider: VerifierProvider; scope: ActivationScope; source: ProviderSelectionSource }
  | { action: 'default-mock' };

/**
 * Phase 265 (T1, AC-1/AC-2) — pure provider-selection resolver. Mirrors how
 * `init.ts`'s existing `effectiveActivate` composes `--activate`/`--full`
 * today, extended with the new `--verifier-provider` flag. Precedence:
 *
 * 1. An explicit `--verifier-provider` flag always wins outright.
 * 2. Else `--activate` or `--full` derive anthropic-if-keyed-else-mock, the
 *    same rule `effectiveActivate` already applies (`source` records
 *    whichever of the two actually triggered it — `activate` wins when both
 *    are set, matching `opts.activate ?? opts.full` precedence elsewhere).
 * 3. Else, when a prompter would be available (`isTTY ||
 *    env.CADENCE_PROMPTER_SCRIPT !== undefined` — the same predicate
 *    `planHost`/`makePrompter()` use), report that a real init would prompt.
 * 4. Else default to mock.
 *
 * No I/O, no readline, never throws, never calls `addIntelligenceDecision` —
 * this only *describes* what a real init would do (T3 wires the actual
 * prompt + decision recording).
 */
export function resolveProviderSelection(
  opts: InitPlanOptions,
  env: NodeJS.ProcessEnv,
  isTTY: boolean,
): ProviderSelectionResult {
  if (opts.verifierProvider !== undefined) {
    return { action: 'use', provider: opts.verifierProvider, scope: 'deep-verify', source: 'flag' };
  }
  if (opts.activate || opts.full) {
    const hasKey =
      typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.length > 0;
    const provider: VerifierProvider = hasKey ? 'anthropic' : 'mock';
    const source: ProviderSelectionSource = opts.activate ? 'activate' : 'full';
    return { action: 'use', provider, scope: 'deep-verify', source };
  }
  const prompterAvailable = isTTY || env.CADENCE_PROMPTER_SCRIPT !== undefined;
  if (prompterAvailable) {
    return { action: 'prompt' };
  }
  return { action: 'default-mock' };
}

export interface InitPlanVerification {
  /** Verifier provider the deep-verify seam would carry after init. When
   *  `selection.action` is `'prompt'` or `'default-mock'`, a real init hasn't
   *  asked the operator yet (dry-run never prompts) — this mirrors the preset
   *  default in that case; `selection` is the honest report of what would
   *  actually happen. */
  provider: VerifierProvider;
  /** True once a non-mock provider is wired (real verification on). */
  realVerificationOn: boolean;
  /** `--activate` was requested. */
  activateRequested: boolean;
  /** `--activate` requested but no `ANTHROPIC_API_KEY` present → stays mock. */
  activateNoKey: boolean;
  /** Phase 265 (T1) — what a real (non-dry-run) init would do to resolve the
   *  verifier provider: prompt, use an explicit/derived provider, or default
   *  to mock. Dry-run reports this without ever prompting or writing a
   *  decision. */
  selection: ProviderSelectionResult;
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

  const verification = planVerification(cwd, preset, opts, env, isTTY);
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
  opts: InitPlanOptions,
  env: NodeJS.ProcessEnv,
  isTTY: boolean,
): InitPlanVerification {
  // Presets only ever carry 'mock' today; `cadence init` doesn't offer
  // 'host-cli' as a preset default (Phase 165 widened the config schema's
  // `provider` enum to admit it, not what a fresh preset writes).
  const base = presets[preset].verifier.provider;
  const activate = opts.activate ?? false;
  const hasKey =
    typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.length > 0;
  let provider: VerifierProvider = base;
  let activateNoKey = false;
  if (activate) {
    if (hasKey) provider = 'anthropic';
    else activateNoKey = true;
  }

  // Phase 265 (T1) — the pure resolver additionally covers `--full` (the
  // block above only ever looked at `--activate`, a pre-existing gap: dry-run
  // silently ignored `--full`'s own activation effect) and the new
  // `--verifier-provider` flag. When it resolves outright, that IS what a
  // real init would write — it wins over the `--activate`-only view above
  // (for the `--activate` case itself the two agree, since both apply the
  // same anthropic-if-keyed-else-mock rule).
  const selection = resolveProviderSelection(opts, env, isTTY);
  if (selection.action === 'use') {
    provider = selection.provider;
  }

  return {
    testCommand: detectTestCommand(cwd),
    provider,
    realVerificationOn: provider !== 'mock',
    activateRequested: activate,
    activateNoKey,
    selection,
  };
}

/**
 * Mirror `maybeWireHost`'s decision table (init/host-wire.ts) as a pure report. A
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

const PROVIDER_SELECTION_SOURCE_FLAG: Record<ProviderSelectionSource, string> = {
  flag: '--verifier-provider',
  activate: '--activate',
  full: '--full',
};

/**
 * Phase 265 (T1, AC-2) — render the resolver's `ProviderSelectionResult` as
 * the honest "what would a real (non-dry-run) init do here" line, distinct
 * from `verificationLine` above (which reports the base/preset-derived
 * provider `--dry-run` would preview since it never actually prompts).
 */
function providerSelectionLine(s: ProviderSelectionResult): string {
  switch (s.action) {
    case 'prompt':
      return 'would prompt to choose explicitly (mock, anthropic, local, host-cli)';
    case 'use':
      return `${s.provider}  (scope: ${s.scope} — via ${PROVIDER_SELECTION_SOURCE_FLAG[s.source]})`;
    case 'default-mock':
      return 'defaults to mock  (no prompter available — non-TTY and CADENCE_PROMPTER_SCRIPT unset)';
  }
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
  lines.push(`  provider      ${providerSelectionLine(plan.verification.selection)}`);
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
