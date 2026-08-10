import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import {
  MOCK_VERIFIER_NOTICE,
  MOCK_VERIFIER_CAPABILITY,
  CadenceStateZ,
  RecommendationLedgerZ,
  EvidenceLedgerZ,
  AssumptionLedgerZ,
  IntelligenceDecisionLedgerZ,
  type CadenceState,
  type CadenceConfig,
  type Gate,
  type Tier,
} from '@thomas-powers-jr/cadence-types';
import { checkNodeMajor } from '../cli/node-guard.js';
import { loadConfig } from '../config/loader.js';
import {
  assessReadiness,
  isClaudeCodeSession,
  seamProvider,
  type VerifierSeam,
} from '../activate/assess.js';
import { gatesFor, effectiveProfile } from '../gates/engine.js';
import { gatherOccupancy } from '../phases/occupancy.js';
import { detectPhaseCollision, phaseNumber, type Occupancy } from '../phases/collision.js';
import {
  readRecommendationLedger,
  readEvidenceLedger,
  readAssumptionLedger,
  readIntelligenceDecisionLedger,
} from '../intelligence/store/io.js';
import { checkRemoteFreshness } from '../handoff/remote-freshness.js';
import { gitBestEffort } from '../git/worktrees.js';
import { detectProjectLanguage } from '../init/plan.js';
import { getProfileForExtension } from '../verify/coverage-profiles/registry.js';
import { CADENCE_OWNED_GITIGNORE_ENTRIES } from '../init/gitignore.js';
import { SimpleStateBackend } from '../state/simple.js';
import { assessProgressFreshness } from '../phases/liveness.js';
import {
  pass,
  fail,
  rollup,
  type DoctorCheck,
  type DoctorEnv,
  type DoctorReport,
} from './model.js';
import { hasManagedCadence, hasStaleScopeManagedHook } from './host-hooks.js';

function checkNode(env: DoctorEnv): DoctorCheck {
  const r = checkNodeMajor(env.nodeVersion);
  return r.ok
    ? pass('node', `Node ${env.nodeVersion} satisfies the >=22 floor.`)
    : fail('node', 'error', r.message, 'Upgrade Node to >=22 and retry.');
}

async function checkInitialized(root: string): Promise<DoctorCheck> {
  if (!existsSync(join(root, '.cadence'))) {
    return fail(
      'initialized',
      'error',
      'No .cadence/ directory found here.',
      'Run `cadence init` to initialize CADENCE in this project.',
    );
  }
  try {
    await loadConfig(root);
    return pass('initialized', '.cadence/ present and config.json is valid.');
  } catch (err) {
    return fail(
      'initialized',
      'error',
      `config.json is invalid: ${err instanceof Error ? err.message : String(err)}`,
      'Fix or regenerate .cadence/config.json (see docs/reference/config.md).',
    );
  }
}

async function checkState(root: string): Promise<DoctorCheck> {
  // Only meaningful once initialized; the `initialized` check owns the
  // not-initialized error, so skip cleanly here to avoid double-reporting.
  if (!existsSync(join(root, '.cadence'))) {
    return pass('state', 'Not applicable — project is not initialized.');
  }
  const stateJson = join(root, '.cadence', 'state.json');
  if (!existsSync(stateJson)) {
    return fail(
      'state',
      'error',
      'state.json is missing.',
      'Run `cadence onboard` to bootstrap a fresh state.json (safe for an existing .cadence/ dir — unlike `cadence init`, which refuses here).',
    );
  }
  const stateRaw = await readFile(stateJson, 'utf8');
  try {
    JSON.parse(stateRaw);
  } catch (err) {
    const conflictDiagnosis = diagnoseStateConflict(stateRaw);
    if (conflictDiagnosis !== null) {
      return fail(
        'state',
        'error',
        `state.json has an unresolved git merge conflict. ${conflictDiagnosis}`,
        'Run `cadence doctor --fix --resolve-state-conflict=local` (or `=incoming`) to pick a side.',
        'resolve-state-conflict',
      );
    }
    return fail(
      'state',
      'error',
      `state.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      'Restore .cadence/state.json from version control, or re-init.',
    );
  }
  if (!existsSync(join(root, '.cadence', 'STATE.md'))) {
    return fail(
      'state',
      'warning',
      'STATE.md (the derived human view) is missing.',
      'Run any cadence command to regenerate STATE.md.',
      'state-md',
    );
  }
  return pass('state', 'state.json parses and STATE.md is present.');
}

const CONFLICT_START_MARKER = '<<<<<<<';
const CONFLICT_SEP_MARKER = '=======';
const CONFLICT_END_MARKER = '>>>>>>>';

/**
 * Splits raw `state.json` content into its "local"/"incoming" halves when it
 * has git conflict-marker shape: a line starting with `<<<<<<<` (7 `<`s),
 * later a line that is exactly `=======` (7 `=`s), later a line starting
 * with `>>>>>>>` (7 `>`s) — in that order. Matches on the 7-character marker
 * prefix, not the full line, since git appends an arbitrary ref/branch name
 * after `<<<<<<<`/`>>>>>>>` (e.g. `<<<<<<< HEAD`). Returns `null` when the
 * shape isn't present. Exported (T5, phase 196, issue #177) so the
 * `--resolve-state-conflict` repair (`./fix.ts`) can re-split the raw file
 * and pick a side without duplicating the marker-detection regex/logic — the
 * character-level parsing lives here and only here.
 */
export function parseConflictMarkers(content: string): { local: string; incoming: string } | null {
  // Strip a trailing \r per line so CRLF files still match the exact-line
  // `=======` check.
  const lines = content.split('\n').map((line) => line.replace(/\r$/, ''));
  const startIdx = lines.findIndex((line) => line.startsWith(CONFLICT_START_MARKER));
  if (startIdx === -1) return null;
  const sepIdx = lines.findIndex((line, i) => i > startIdx && line === CONFLICT_SEP_MARKER);
  if (sepIdx === -1) return null;
  const endIdx = lines.findIndex((line, i) => i > sepIdx && line.startsWith(CONFLICT_END_MARKER));
  if (endIdx === -1) return null;
  return {
    local: lines.slice(startIdx + 1, sepIdx).join('\n'),
    incoming: lines.slice(sepIdx + 1, endIdx).join('\n'),
  };
}

/** Parses `text` as JSON without throwing. */
function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** State fields (besides `session`, handled separately) worth calling out by name in a conflict diff, in report order. */
const STATE_CONFLICT_DIFF_FIELDS = ['activePhase', 'loopPosition', 'activeDraft', 'revision'] as const;

/** Renders a state field value for the conflict-diff message: strings print raw, everything else as JSON. */
function formatStateConflictValue(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Builds the field-by-field local/incoming diff string once both conflict
 * sides have parsed and validated as `CadenceState`. Only fields that
 * actually differ are included. `session` is an object — compared (and, if
 * it differs, reported) wholesale via `JSON.stringify` equality rather than
 * sub-diffed field-by-field.
 */
function buildStateConflictDiff(local: CadenceState, incoming: CadenceState): string {
  const parts: string[] = [];
  for (const field of STATE_CONFLICT_DIFF_FIELDS) {
    const a = local[field];
    const b = incoming[field];
    if (a !== b) {
      parts.push(
        `${field}: local="${formatStateConflictValue(a)}" vs incoming="${formatStateConflictValue(b)}"`,
      );
    }
  }
  const localSession = JSON.stringify(local.session);
  const incomingSession = JSON.stringify(incoming.session);
  if (localSession !== incomingSession) {
    parts.push(`session: local="${localSession}" vs incoming="${incomingSession}"`);
  }
  return parts.join('; ');
}

/**
 * When `stateRaw` (content that already failed `JSON.parse`) has git
 * conflict-marker shape AND both sides cleanly parse as JSON AND both
 * validate against `CadenceStateZ`, returns the field-by-field diff detail
 * string. Returns `null` for anything less clean — no markers, a
 * non-JSON side, or a side that fails schema validation — so the caller
 * falls back to the existing generic "not valid JSON" message rather than
 * guessing at a more complex (e.g. multi-way) conflict or in-side
 * corruption.
 */
function diagnoseStateConflict(stateRaw: string): string | null {
  const split = parseConflictMarkers(stateRaw);
  if (split === null) return null;
  const localJson = tryParseJson(split.local);
  const incomingJson = tryParseJson(split.incoming);
  if (!localJson.ok || !incomingJson.ok) return null;
  const localState = CadenceStateZ.safeParse(localJson.value);
  const incomingState = CadenceStateZ.safeParse(incomingJson.value);
  if (!localState.success || !incomingState.success) return null;
  return buildStateConflictDiff(localState.data, incomingState.data);
}

const pexecFile = promisify(execFile);

/**
 * List of the CADENCE-owned ephemeral paths (`../init/gitignore.js`)
 * currently tracked by git in `root`, via `git ls-files -- <paths>` — a
 * read-only shell-out with a fixed arg array (never a shell string), mirroring
 * `handoff/git-facts.ts`. Staged-but-uncommitted paths count as tracked
 * (`git ls-files` reports the index, not just HEAD). Shared by
 * `checkStateTracked` and the `untrack-state` repair (`./fix.ts`) so the
 * git-shell-out logic lives in one place. Returns `null` — never throws —
 * when the lookup itself fails (not a git repository, git unavailable, or any
 * other error), so callers can tell "definitely none tracked" apart from
 * "could not determine" (best-effort introspection convention).
 */
export async function listTrackedCadenceOwnedPaths(root: string): Promise<string[] | null> {
  try {
    const { stdout } = await pexecFile(
      'git',
      ['ls-files', '--', ...CADENCE_OWNED_GITIGNORE_ENTRIES],
      { cwd: root, timeout: 5000, windowsHide: true },
    );
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    return null;
  }
}

/**
 * Phase 196 (issue #177): CADENCE-owned ephemeral state (`state.json`,
 * `STATE.md`, `mcp-trust.json`, `intelligence/context/`) must never be a
 * tracked file — tracking it guarantees a real git merge conflict the moment
 * two CADENCE worktrees on different phases sync. Best-effort and never
 * throws: outside a git repository (or with git unavailable) this degrades to
 * a pass, since there is nothing to determine either way.
 */
async function checkStateTracked(root: string): Promise<DoctorCheck> {
  const tracked = await listTrackedCadenceOwnedPaths(root);
  if (tracked === null) {
    return pass(
      'state-tracked',
      'Could not verify — not a git repository or git unavailable.',
    );
  }
  if (tracked.length === 0) {
    return pass('state-tracked', 'No CADENCE-owned ephemeral paths are tracked by git.');
  }
  return fail(
    'state-tracked',
    'warning',
    `Tracked CADENCE-owned ephemeral path(s): ${tracked.join(', ')}. These hold ` +
      'per-worktree loop state and WILL produce real git merge conflicts across worktrees.',
    'Run `cadence doctor --fix` to gitignore and untrack them.',
    'untrack-state',
  );
}

// A run-line is non-portable if it contains an absolute path token: a POSIX
// root (`/abs/...`) or a Windows drive (`C:\...`). The portable managed form is
// `!cadence <sub>`, which has neither.
const ABS_PATH_TOKEN = /(?:^|\s)(?:[A-Za-z]:[\\/]|\/)/;

/** The first `!`-prefixed run-line in a managed command file, minus the `!`. */
function runLineOf(content: string): string | null {
  for (const line of content.split('\n')) {
    if (line.startsWith('!')) return line.slice(1).trim();
  }
  return null;
}

async function checkHostCommands(root: string): Promise<DoctorCheck> {
  const dir = join(root, '.claude', 'commands');
  if (!existsSync(dir)) {
    return pass('host-commands', 'Not applicable — no .claude/commands/ here.');
  }
  const files = (await readdir(dir)).filter(
    (f) => f.startsWith('cadence-') && f.endsWith('.md'),
  );
  const offenders: string[] = [];
  let checked = 0;
  for (const f of files) {
    const content = await readFile(join(dir, f), 'utf8');
    if (!content.includes('<!-- managed-by: cadence -->')) continue; // user-owned
    checked++;
    const run = runLineOf(content);
    if (run !== null && ABS_PATH_TOKEN.test(run)) offenders.push(f);
  }
  if (offenders.length > 0) {
    return fail(
      'host-commands',
      'warning',
      `Machine-absolute run-line in ${offenders.join(', ')} — not portable across clones/machines.`,
      'Regenerate with `cadence-host-claude-code install` (without --local) to write the portable `cadence` form.',
      'host-install',
    );
  }
  return pass(
    'host-commands',
    `All ${checked} managed slash command(s) use portable run-lines.`,
  );
}

/** Local `core.hooksPath` value from a `.git/config` body, or null if unset. */
function gitHooksPath(configText: string): string | null {
  const m = configText.match(/^\s*hooksPath\s*=\s*(.+?)\s*$/m);
  if (!m || m[1] === undefined) return null;
  return m[1];
}

function gitConfigHooksPath(root: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: root }, (err, stdout) => {
      if (err) {
        resolve(null);
        return;
      }
      const value = stdout.trim();
      resolve(value.length > 0 ? value : null);
    });
  });
}

async function checkGitHooks(root: string): Promise<DoctorCheck> {
  if (!existsSync(join(root, '.git'))) {
    return pass('git-hooks', 'Not applicable — not a git repository.');
  }
  const cfgPath = join(root, '.git', 'config');
  const cfg = existsSync(cfgPath) ? await readFile(cfgPath, 'utf8') : '';
  const hp = (await gitConfigHooksPath(root)) ?? gitHooksPath(cfg);
  if (hp === '.githooks') {
    return pass(
      'git-hooks',
      'core.hooksPath points at .githooks (the pre-push gate is wired).',
    );
  }
  if (hp !== null) {
    // A custom hooksPath (e.g. a Husky ".husky" setup) is already someone
    // else's decision — never auto-overwrite it; surface as manual guidance.
    return fail(
      'git-hooks',
      'warning',
      `core.hooksPath is "${hp}", not ".githooks" — the pre-push gate may not run.`,
      `core.hooksPath is already set to "${hp}". If you want the .githooks pre-push ` +
        'gate, point it there yourself; CADENCE will not overwrite an existing custom hooksPath.',
    );
  }
  if (!existsSync(join(root, '.githooks'))) {
    return pass('git-hooks', 'Not applicable — no .githooks/ directory here.');
  }
  return fail(
    'git-hooks',
    'warning',
    'core.hooksPath is unset — the .githooks pre-push gate will not run.',
    'Run `git config core.hooksPath .githooks` to enable the pre-push gate.',
    'git-hooks',
  );
}

async function checkHostHooks(root: string): Promise<DoctorCheck> {
  const settings = join(root, '.claude', 'settings.json');
  if (!existsSync(settings)) {
    return pass('host-hooks', 'Not applicable — no .claude/settings.json here.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(settings, 'utf8'));
  } catch (err) {
    return fail(
      'host-hooks',
      'warning',
      `.claude/settings.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      'Fix or regenerate it with `cadence-host-claude-code install`.',
    );
  }
  if (hasManagedCadence(parsed)) {
    return pass(
      'host-hooks',
      'CADENCE-managed hook entries are present in settings.json.',
    );
  }
  if (hasStaleScopeManagedHook(parsed)) {
    return fail(
      'host-hooks',
      'warning',
      'A CADENCE-managed hook entry is present in settings.json but is stale — it references an outdated npm scope and needs reinstalling.',
      'Run `cadence doctor --fix --wire-host` to reinstall the lifecycle hooks with the current package scope.',
      'host-install',
    );
  }
  return fail(
    'host-hooks',
    'warning',
    'No CADENCE-managed (_managedBy: "cadence") hook entries found in settings.json.',
    'Run `cadence-host-claude-code install` to (re)write the lifecycle hooks.',
    'host-install',
  );
}

const CADENCE_MANAGED_BLOCK = '<!-- cadence:managed:start -->';
const CODEX_PROMPT_MARKER = '<!-- managed-by: cadence -->';

async function hasManagedAgentsMd(root: string): Promise<boolean> {
  const path = join(root, 'AGENTS.md');
  if (!existsSync(path)) return false;
  try {
    return (await readFile(path, 'utf8')).includes(CADENCE_MANAGED_BLOCK);
  } catch {
    return false;
  }
}

async function codexReadinessActive(root: string): Promise<boolean> {
  return existsSync(join(root, '.codex')) || (await hasManagedAgentsMd(root));
}

function resolveCodexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), '.codex');
}

function commandOnPath(command: string): boolean {
  const path = process.env.PATH ?? '';
  for (const dir of path.split(delimiter).filter(Boolean)) {
    if (existsSync(join(dir, command))) return true;
    if (process.platform === 'win32' && existsSync(join(dir, `${command}.cmd`))) return true;
  }
  return false;
}

async function checkCodexHooks(root: string): Promise<DoctorCheck> {
  if (!(await codexReadinessActive(root))) {
    return pass('codex-hooks', 'Not applicable — no Codex readiness artifacts here.');
  }
  const hooksPath = join(root, '.codex', 'hooks.json');
  if (!existsSync(hooksPath)) {
    return fail(
      'codex-hooks',
      'warning',
      '.codex/hooks.json is missing.',
      'Run `npx -y @thomas-powers-jr/cadence-host-codex install` to write Codex lifecycle hooks.',
      'codex-host-install',
    );
  }
  try {
    const parsed = JSON.parse(await readFile(hooksPath, 'utf8'));
    if (hasManagedCadence(parsed)) {
      return pass('codex-hooks', 'CADENCE-managed Codex hook entries are present.');
    }
    if (hasStaleScopeManagedHook(parsed)) {
      return fail(
        'codex-hooks',
        'warning',
        'A CADENCE-managed Codex hook entry is present in .codex/hooks.json but is stale — it references an outdated npm scope and needs reinstalling.',
        'Run `cadence doctor --fix --wire-host` to reinstall the Codex lifecycle hooks with the current package scope.',
        'codex-host-install',
      );
    }
    return fail(
      'codex-hooks',
      'warning',
      'No CADENCE-managed (_managedBy: "cadence") hook entries found in .codex/hooks.json.',
      'Run `npx -y @thomas-powers-jr/cadence-host-codex install` to rewrite Codex lifecycle hooks.',
      'codex-host-install',
    );
  } catch (err) {
    return fail(
      'codex-hooks',
      'warning',
      `.codex/hooks.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      'Fix or regenerate it with `npx -y @thomas-powers-jr/cadence-host-codex install`.',
      'codex-host-install',
    );
  }
}

async function checkCodexPrompts(root: string): Promise<DoctorCheck> {
  if (!(await codexReadinessActive(root))) {
    return pass('codex-prompts', 'Not applicable — no Codex readiness artifacts here.');
  }
  const promptsDir = join(resolveCodexHome(), 'prompts');
  const progress = join(promptsDir, 'cadence-progress.md');
  if (!existsSync(progress)) {
    return fail(
      'codex-prompts',
      'warning',
      `Codex prompt commands are missing from ${promptsDir}.`,
      'Run `npx -y @thomas-powers-jr/cadence-host-codex install` before opening Codex.',
      'codex-host-install',
    );
  }
  let content: string;
  try {
    content = await readFile(progress, 'utf8');
  } catch (err) {
    return fail(
      'codex-prompts',
      'warning',
      `Could not read ${progress}: ${err instanceof Error ? err.message : String(err)}`,
      'Fix or regenerate Codex prompts with `npx -y @thomas-powers-jr/cadence-host-codex install`.',
      'codex-host-install',
    );
  }
  if (!content.includes(CODEX_PROMPT_MARKER)) {
    return fail(
      'codex-prompts',
      'warning',
      'cadence-progress.md exists but is not CADENCE-managed.',
      'Move the user-owned prompt aside or reinstall Codex prompts intentionally.',
    );
  }
  return pass('codex-prompts', `CADENCE Codex prompts are present in ${promptsDir}.`);
}

async function checkCodexAgentsMd(root: string): Promise<DoctorCheck> {
  if (!(await codexReadinessActive(root))) {
    return pass('codex-agents-md', 'Not applicable — no Codex readiness artifacts here.');
  }
  const path = join(root, 'AGENTS.md');
  if (!existsSync(path)) {
    return fail(
      'codex-agents-md',
      'warning',
      'AGENTS.md is missing; Codex may not see the CADENCE loop instructions.',
      'Run `cadence init --agents-md` to write the managed AGENTS.md block.',
      'agents-md',
    );
  }
  const content = await readFile(path, 'utf8');
  if (!content.includes(CADENCE_MANAGED_BLOCK)) {
    return fail(
      'codex-agents-md',
      'warning',
      'AGENTS.md exists but has no CADENCE managed block.',
      'Add the CADENCE block manually or run `cadence init --agents-md` after adding cadence markers.',
    );
  }
  return pass('codex-agents-md', 'AGENTS.md contains the CADENCE managed block.');
}

async function checkCodexCadenceCommand(root: string): Promise<DoctorCheck> {
  if (!(await codexReadinessActive(root))) {
    return pass('codex-cadence-command', 'Not applicable — no Codex readiness artifacts here.');
  }
  if (commandOnPath('cadence')) {
    return pass('codex-cadence-command', '`cadence` is available on PATH for Codex prompt commands.');
  }
  return fail(
    'codex-cadence-command',
    'warning',
    '`cadence` is not available on PATH; Codex prompts may not be able to run it.',
    'Install @thomas-powers-jr/cadence-core globally or reinstall Codex prompts with an explicit --cadence command.',
  );
}

/** Human label for where a cross-worktree claim was observed. */
function whereClaimed(o: Occupancy): string {
  return o.source === 'upstream' ? o.location : `worktree ${o.location}`;
}

/**
 * Read-only cross-worktree phase-usage line (v1.19, phase 85). Reuses the v1.18
 * `gatherOccupancy` collector + pure `detectPhaseCollision` to surface phase
 * numbers claimed by sibling worktrees + the upstream integration ref, and warns
 * when one collides with a local phase number — the silent-dual-merge
 * precondition the v1.18 guard refuses at scaffold time. Best-effort: any
 * failure degrades to `ok` (never throws), matching the guard's contract.
 * The collector is injectable for deterministic, offline tests.
 */
export async function checkWorktreePhases(
  root: string,
  gather: (
    repoRoot: string,
    opts: { integrationRef: string },
  ) => Promise<Occupancy[]> = gatherOccupancy,
): Promise<DoctorCheck> {
  try {
    let integrationRef = 'main';
    try {
      integrationRef = (await loadConfig(root)).phaseGuard.integrationRef;
    } catch {
      /* config unreadable — fall back to the default ref */
    }

    const occupancies = await gather(root, { integrationRef });
    const localNumbers = new Set(
      occupancies.filter((o) => o.source === 'local').map((o) => o.number),
    );
    // Collisions are SIBLING-vs-local only — two live worktrees holding the same
    // number is the silent-dual-merge risk. Upstream is the merged baseline: a
    // local phase being present on origin/<ref> just means "merged", which is
    // normal, so upstream is NOT matched here (that's the guard's scaffold-time
    // concern). Upstream still feeds the suggested next free number below.
    const siblings = occupancies.filter((o) => o.source === 'sibling');

    if (siblings.length === 0) {
      return pass(
        'worktree-phases',
        'No sibling worktrees with phase claims observed.',
      );
    }

    const collisions = siblings.filter((o) => localNumbers.has(o.number));
    if (collisions.length > 0) {
      // nextFree is independent of target here (every observed number counts);
      // target 0 yields max(observed)+1 over local + sibling + upstream —
      // monotonic, lowest-gap was dropped.
      const { nextFree } = detectPhaseCollision(0, occupancies);
      const detail =
        'phase number collision across worktrees: ' +
        collisions
          .map((c) => `${c.number} also claimed by ${whereClaimed(c)}`)
          .join('; ') +
        '.';
      return fail(
        'worktree-phases',
        'warning',
        detail,
        `Renumber one side; the next free phase number is ${nextFree}.`,
      );
    }

    const inventory = siblings
      .map((o) => `${o.number} (${whereClaimed(o)})`)
      .join(', ');
    return pass(
      'worktree-phases',
      `Sibling worktree phase claims observed, none colliding with local: ${inventory}.`,
    );
  } catch {
    // Best-effort: the collector should never throw, but if anything does,
    // a diagnostic line must not break `doctor`.
    return pass(
      'worktree-phases',
      'Cross-worktree phase usage not determinable (best-effort) — skipped.',
    );
  }
}

/** Warn when this many SESSION docs accumulate with retention disabled. */
export const HANDOFF_WARN_THRESHOLD = 10;

/**
 * Make SESSION-doc accumulation visible (Phase 89, v1.20). Read-only and
 * best-effort: counts `SESSION-*.md` under `.cadence/handoff/` against
 * `config.handoff.retain`. With retention configured the docs self-heal on the
 * next handoff write, so the check only *warns* when retention is unset and the
 * archive has grown past the threshold. Never throws — a diagnostic must not
 * break `doctor` (mirrors `worktree-phases`).
 */
export async function checkHandoffRetention(root: string): Promise<DoctorCheck> {
  try {
    const dir = join(root, '.cadence', 'handoff');
    let count = 0;
    if (existsSync(dir)) {
      count = (await readdir(dir)).filter((n) => /^SESSION-.*\.md$/.test(n)).length;
    }

    let retain: number | undefined;
    try {
      retain = (await loadConfig(root)).handoff.retain;
    } catch {
      /* config unreadable — treat retention as unset */
    }

    if (retain !== undefined) {
      if (count <= retain) {
        return pass(
          'handoff-retention',
          `${count} handoff doc(s) within the retain budget of ${retain}.`,
        );
      }
      return pass(
        'handoff-retention',
        `${count} handoff doc(s) exceed retain=${retain}; the next handoff write will prune ${count - retain}.`,
      );
    }

    if (count >= HANDOFF_WARN_THRESHOLD) {
      return fail(
        'handoff-retention',
        'warning',
        `${count} handoff docs are accumulating under .cadence/handoff/ with retention disabled.`,
        'Set handoff.retain (suggested 10) to auto-prune stale SESSION docs on handoff write.',
        'handoff-retention',
      );
    }
    return pass(
      'handoff-retention',
      `${count} handoff doc(s); retention disabled (set handoff.retain to cap growth).`,
    );
  } catch {
    return pass(
      'handoff-retention',
      'Handoff retention not determinable (best-effort) — skipped.',
    );
  }
}

/**
 * Surface whether real verification is actually wired (v1.22). Reuses the pure
 * `assessReadiness` (shared with `cadence activate`). `warning` when deep-verify
 * is mock (remedy: `cadence activate`), when deep-verify's provider lacks its
 * credentials, or — phase 239 / issue #331 — when ANY other verifier seam is
 * configured to a real provider whose credentials are absent and will therefore
 * downgrade to mock. Before phase 239 only the deep-verify seam was
 * credential-checked, so this check reported `ok` while a sibling seam was
 * guaranteed to fall back to mock (a false green that `cadence config explain`
 * caught and this did not). `ok` otherwise. Read-only, best-effort, never throws
 * (doctor convention). `env` is injectable for deterministic tests.
 */
export async function checkVerificationReadiness(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DoctorCheck> {
  try {
    const config = await loadConfig(root);
    const r = assessReadiness(config, env, root);
    if (r.provider === 'mock') {
      // Phase 104: source the honesty wording from the single MOCK_VERIFIER_NOTICE.
      // Phase 264 (T4): append the neutral MOCK_VERIFIER_CAPABILITY fact alongside
      // it — the notice nudges toward activation, the capability names precisely
      // what mock does and doesn't check.
      return fail(
        'verification-readiness',
        'warning',
        `${MOCK_VERIFIER_NOTICE.message} ${MOCK_VERIFIER_CAPABILITY.message}`,
        `Run \`${MOCK_VERIFIER_NOTICE.activateHint}\` to turn on real verification.`,
      );
    }
    if (!r.keyPresent) {
      const envVar = r.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'CADENCE_LOCAL_BASE_URL';
      if (r.provider === 'anthropic' && isClaudeCodeSession(env)) {
        // Phase 211 AC-1: inside a live Claude Code session, a missing
        // ANTHROPIC_API_KEY is a common confusion — being logged into Claude
        // Code does not supply the separate `anthropic`-provider credential
        // deep-verify needs. Name the confusion and steer to host-cli, which
        // reuses that same Claude Code login instead of a standalone API key.
        // Phase 264 (T4): this is the "silently downgraded" half of AC-3 —
        // append MOCK_VERIFIER_CAPABILITY so the eventual mock fallback is
        // described the same way as the deliberately-configured case above.
        return fail(
          'verification-readiness',
          'warning',
          `deep-verify is set to 'anthropic' but its credentials are missing — it will fall back to mock. Being logged into Claude Code does not supply ${envVar}; that is a separate credential. ${MOCK_VERIFIER_CAPABILITY.message}`,
          `Set ${envVar}, or run \`cadence activate --provider host-cli\` to reuse your Claude Code login instead.`,
        );
      }
      // Phase 264 (T4): generic missing-credentials case — same AC-3
      // "silently downgraded" wiring as the Claude-Code-specific branch above.
      return fail(
        'verification-readiness',
        'warning',
        `deep-verify is set to '${r.provider}' but its credentials are missing — it will fall back to mock. ${MOCK_VERIFIER_CAPABILITY.message}`,
        `Set ${envVar} (or run \`cadence activate\`).`,
      );
    }
    // Issue #331: deep-verify being healthy is NOT sufficient. Every other seam
    // gates a real review too, and one configured to a real provider without
    // credentials will silently downgrade to mock — the case that made this
    // check report `ok` while `cadence config explain` warned. Reported after
    // the deep-verify branches above so their (more specific) wording wins when
    // deep-verify is itself the problem.
    if (r.seamsDowngraded.length > 0) {
      const named = r.seamsDowngraded
        .map((seam) => `${seam} ('${seamProvider(config, seam)}')`)
        .join(', ');
      const plural = r.seamsDowngraded.length === 1 ? 'seam' : 'seams';
      const claudeCodeHint =
        r.seamsDowngraded.some((seam) => seamProvider(config, seam) === 'anthropic') &&
        isClaudeCodeSession(env)
          ? ' Being logged into Claude Code does not supply ANTHROPIC_API_KEY; that is a separate credential.'
          : '';
      // Phase 264 (T4): the seamsDowngraded case is also "silently downgraded"
      // per AC-3 — append MOCK_VERIFIER_CAPABILITY here too.
      return fail(
        'verification-readiness',
        'warning',
        `${r.reason} But ${r.seamsDowngraded.length} other ${plural} will silently fall back to mock for want of credentials: ${named}.${claudeCodeHint} ${MOCK_VERIFIER_CAPABILITY.message}`,
        `Supply the missing credentials, or run \`cadence activate --provider host-cli --all\` to reuse your host CLI login for every seam. \`cadence config explain\` lists each seam's effective provider.`,
      );
    }
    return pass('verification-readiness', r.reason);
  } catch {
    return pass(
      'verification-readiness',
      'Verification readiness not determinable (best-effort) — skipped.',
    );
  }
}

/**
 * Surface recommendations stuck in `settle-pending` (Phase 145) — their linked
 * phase settled locally but nobody has confirmed the work actually shipped
 * (merged/deployed) via `recommendation promote --status=shipped`. Read-only,
 * best-effort, never throws (doctor convention, mirrors `handoff-retention` /
 * `verification-readiness`).
 */
export async function checkRecommendationShippedDrift(root: string): Promise<DoctorCheck> {
  try {
    const ledger = await readRecommendationLedger(root);
    const pending = ledger.recommendations.filter((r) => r.status === 'settle-pending');
    if (pending.length === 0) {
      return pass(
        'recommendation-shipped-drift',
        'No recommendations awaiting ship confirmation.',
      );
    }
    const detail = pending
      .map(
        (r) =>
          `${r.id} "${r.title}" — phase ${r.convertedToPhaseId ?? '?'} settled, not yet confirmed shipped`,
      )
      .join('; ');
    return fail(
      'recommendation-shipped-drift',
      'warning',
      detail,
      'Run `cadence recommendation promote <id> --status=shipped --ref "<PR/tag>"` once merged.',
    );
  } catch {
    return pass(
      'recommendation-shipped-drift',
      'Recommendation ship-drift not determinable (best-effort) — skipped.',
    );
  }
}

/**
 * Surface `evidence.json` rows whose `recommendationId` matches neither the
 * active `recommendations` array nor `archived` — a dangling FK that, left
 * unnoticed, can silently collide with a freshly minted recommendation id
 * (phase 219, T3). Read-only, best-effort, never throws (doctor convention,
 * mirrors `recommendation-shipped-drift`): any read/parse error on either
 * ledger degrades to "no finding" rather than blocking the rest of `doctor`.
 */
export async function checkOrphanedEvidence(root: string): Promise<DoctorCheck> {
  try {
    const recLedger = await readRecommendationLedger(root);
    const evidenceLedger = await readEvidenceLedger(root);
    const knownIds = new Set([
      ...recLedger.recommendations.map((r) => r.id),
      ...recLedger.archived.map((r) => r.id),
    ]);
    const orphaned = evidenceLedger.evidence.filter((e) => !knownIds.has(e.recommendationId));
    if (orphaned.length === 0) {
      return pass(
        'orphaned-evidence',
        'No evidence rows reference a missing recommendation.',
      );
    }
    const detail = orphaned
      .map((e) => `${e.id} references missing recommendation ${e.recommendationId}`)
      .join('; ');
    return fail(
      'orphaned-evidence',
      'warning',
      `Orphaned evidence row(s): ${detail}.`,
      'Investigate whether the referenced recommendation was deleted by hand or the evidence row was mis-linked; ' +
        'restore the recommendation from version control or remove the stale evidence row from .cadence/intelligence/evidence.json.',
    );
  } catch {
    return pass(
      'orphaned-evidence',
      'Orphaned-evidence check not determinable (best-effort) — skipped.',
    );
  }
}

/**
 * The four ledger-id subjects this check compares, as parallel id arrays.
 * `recommendations` includes both live and archived ids (Phase 224) since
 * either could collide with a freshly minted id.
 */
export interface LedgerIdSnapshot {
  recommendations: string[];
  evidence: string[];
  decisions: string[];
  assumptions: string[];
}

/** Relative (git-show form) path per `LedgerIdSnapshot` subject — mirrors the
 *  constants in `../intelligence/store/paths.js`, which only exposes absolute
 *  fs paths. */
const LEDGER_GIT_PATHS: Record<keyof LedgerIdSnapshot, string> = {
  recommendations: '.cadence/intelligence/recommendations.json',
  evidence: '.cadence/intelligence/evidence.json',
  decisions: '.cadence/intelligence/decisions.json',
  assumptions: '.cadence/intelligence/assumptions.json',
};

/** Human label per `LedgerIdSnapshot` subject, for the doctor detail string. */
const LEDGER_SUBJECT_LABEL: Record<keyof LedgerIdSnapshot, string> = {
  recommendations: 'recommendations.json',
  evidence: 'evidence.json',
  decisions: 'decisions.json',
  assumptions: 'assumptions.json',
};

const LEDGER_SUBJECTS: Array<keyof LedgerIdSnapshot> = [
  'recommendations',
  'evidence',
  'decisions',
  'assumptions',
];

/**
 * Pure id-collision diff (Phase 224, T1). For each subject, ids present in
 * `local` but not in `mergeBase` are "local-new"; ids present in `origin` but
 * not in `mergeBase` are "origin-new". A collision is any id that is
 * local-new AND origin-new — both sides independently minted the same id
 * after diverging from their common ancestor, which `mintId`'s purely-local
 * view cannot see coming. Deliberately id-overlap-only, no content-diffing
 * (see this phase's DRAFT boundaries) — id overlap after divergence is
 * already a sufficient, unambiguous signal.
 */
export function findLedgerRemoteCollisions(
  local: LedgerIdSnapshot,
  mergeBase: LedgerIdSnapshot,
  origin: LedgerIdSnapshot,
): Array<{ subject: keyof LedgerIdSnapshot; id: string }> {
  const collisions: Array<{ subject: keyof LedgerIdSnapshot; id: string }> = [];
  for (const subject of LEDGER_SUBJECTS) {
    const base = new Set(mergeBase[subject]);
    const localNew = local[subject].filter((id) => !base.has(id));
    const originNew = new Set(origin[subject].filter((id) => !base.has(id)));
    for (const id of localNew) {
      if (originNew.has(id)) collisions.push({ subject, id });
    }
  }
  return collisions;
}

/**
 * Reads a `LedgerIdSnapshot` from the live filesystem at HEAD (includes
 * uncommitted changes — deliberate, since this check evaluates what is about
 * to be pushed). Best-effort per subject: a reader failure (missing/corrupt
 * ledger file) degrades that one subject to an empty id array rather than
 * throwing — "no ids on this side", not an error.
 */
async function readLocalLedgerIdSnapshot(root: string): Promise<LedgerIdSnapshot> {
  const recommendations = await (async (): Promise<string[]> => {
    try {
      const ledger = await readRecommendationLedger(root);
      return [...ledger.recommendations.map((r) => r.id), ...ledger.archived.map((r) => r.id)];
    } catch {
      return [];
    }
  })();
  const evidence = await (async (): Promise<string[]> => {
    try {
      return (await readEvidenceLedger(root)).evidence.map((e) => e.id);
    } catch {
      return [];
    }
  })();
  const decisions = await (async (): Promise<string[]> => {
    try {
      return (await readIntelligenceDecisionLedger(root)).decisions.map((d) => d.id);
    } catch {
      return [];
    }
  })();
  const assumptions = await (async (): Promise<string[]> => {
    try {
      return (await readAssumptionLedger(root)).assumptions.map((a) => a.id);
    } catch {
      return [];
    }
  })();
  return { recommendations, evidence, decisions, assumptions };
}

/**
 * Reads a `LedgerIdSnapshot` at an arbitrary git ref via `git show
 * <ref>:<path>` (through `gitBestEffort`, which already resolves to `''` for
 * a path missing at that ref, or any other git failure — never throws). An
 * empty read or a schema-parse failure degrades that one subject to an empty
 * id array.
 */
async function readLedgerIdSnapshotAtRef(root: string, ref: string): Promise<LedgerIdSnapshot> {
  async function idsAt<T>(
    subject: keyof LedgerIdSnapshot,
    schema: { parse: (data: unknown) => T },
    idsOf: (parsed: T) => string[],
  ): Promise<string[]> {
    const raw = await gitBestEffort(root, ['show', `${ref}:${LEDGER_GIT_PATHS[subject]}`]);
    if (raw.trim().length === 0) return [];
    try {
      return idsOf(schema.parse(JSON.parse(raw)));
    } catch {
      return [];
    }
  }

  const [recommendations, evidence, decisions, assumptions] = await Promise.all([
    idsAt('recommendations', RecommendationLedgerZ, (l) => [
      ...l.recommendations.map((r) => r.id),
      ...l.archived.map((r) => r.id),
    ]),
    idsAt('evidence', EvidenceLedgerZ, (l) => l.evidence.map((e) => e.id)),
    idsAt('decisions', IntelligenceDecisionLedgerZ, (l) => l.decisions.map((d) => d.id)),
    idsAt('assumptions', AssumptionLedgerZ, (l) => l.assumptions.map((a) => a.id)),
  ]);
  return { recommendations, evidence, decisions, assumptions };
}

/** Outcome of {@link gatherLedgerRemoteCollisionSnapshot}. `checked: false`
 *  mirrors `RemoteFreshness`'s soft-degrade shape: no repo, detached HEAD, a
 *  failed fetch, no upstream, or (new for this check) no discoverable
 *  merge-base with the upstream ref. */
export interface LedgerRemoteCollisionResult {
  checked: boolean;
  reason?: string;
  branch?: string;
  local?: LedgerIdSnapshot;
  mergeBase?: LedgerIdSnapshot;
  origin?: LedgerIdSnapshot;
}

/**
 * Impure gatherer for {@link checkLedgerRemoteCollision} (Phase 224, T1).
 * Reuses `checkRemoteFreshness` for the fetch + branch + upstream-existence
 * probe; only when that reports `checked: true` does this resolve `git
 * merge-base HEAD @{u}` and read the three ledger-id snapshots (local
 * filesystem at HEAD, and `@{u}`/the merge-base sha via `git show`).
 */
export async function gatherLedgerRemoteCollisionSnapshot(
  root: string,
): Promise<LedgerRemoteCollisionResult> {
  const freshness = await checkRemoteFreshness(root);
  const branchField = freshness.branch !== undefined ? { branch: freshness.branch } : {};
  if (!freshness.checked) {
    return {
      checked: false,
      ...(freshness.reason !== undefined ? { reason: freshness.reason } : {}),
      ...branchField,
    };
  }
  const mergeBaseSha = (await gitBestEffort(root, ['merge-base', 'HEAD', '@{u}'])).trim();
  if (mergeBaseSha.length === 0) {
    return { checked: false, reason: 'no-merge-base', ...branchField };
  }
  const [local, mergeBase, origin] = await Promise.all([
    readLocalLedgerIdSnapshot(root),
    readLedgerIdSnapshotAtRef(root, mergeBaseSha),
    readLedgerIdSnapshotAtRef(root, '@{u}'),
  ]);
  return { checked: true, ...branchField, local, mergeBase, origin };
}

/**
 * Detects cross-session ledger id collisions before push (Phase 224,
 * rec-20260726-003 — see this phase's DRAFT): `mintId` computes the next
 * ledger id purely from the local ledger on disk, so two unpushed
 * branches/worktrees/sessions can independently mint the same id for
 * different content. This check fetches the tracked upstream (via the
 * injectable `gather`, defaulting to {@link gatherLedgerRemoteCollisionSnapshot})
 * and warns on any id both sides minted new-since-merge-base. Never
 * auto-fixable (`fixId` stays `null`) — a human must pick which side
 * re-mints, matching `worktree-phases`. Best-effort and never throws
 * (doctor convention): any degrade-safely path from `gather`, or an
 * unexpected error, reports `ok` with a `detail` naming why the comparison
 * could not be made.
 */
export async function checkLedgerRemoteCollision(
  root: string,
  gather: (root: string) => Promise<LedgerRemoteCollisionResult> = gatherLedgerRemoteCollisionSnapshot,
): Promise<DoctorCheck> {
  try {
    const snapshot = await gather(root);
    if (
      !snapshot.checked ||
      snapshot.local === undefined ||
      snapshot.mergeBase === undefined ||
      snapshot.origin === undefined
    ) {
      const reason = snapshot.reason ?? 'not determinable';
      return pass('ledger-remote-collision', `Not determinable (${reason}) — skipped.`);
    }

    const branchLabel = snapshot.branch !== undefined ? `origin/${snapshot.branch}` : 'the tracked upstream';
    const collisions = findLedgerRemoteCollisions(snapshot.local, snapshot.mergeBase, snapshot.origin);
    if (collisions.length === 0) {
      return pass(
        'ledger-remote-collision',
        `No cross-session ledger id collisions vs ${branchLabel}.`,
      );
    }

    const detail = collisions
      .map((c) => `${c.id} (${LEDGER_SUBJECT_LABEL[c.subject]}) also newly minted on ${branchLabel}`)
      .join('; ');
    return fail(
      'ledger-remote-collision',
      'warning',
      `Ledger id collision(s) vs ${branchLabel}: ${detail}.`,
      'Re-mint the local-only entry under the next free id before pushing: diff the new-id sets, ' +
        "keep the fuller side as-is, and re-add the other side's entry via the matching `cadence recommendation`/" +
        'evidence/assumption/decision CLI command under a fresh id.',
    );
  } catch {
    return pass(
      'ledger-remote-collision',
      'Ledger remote-collision check not determinable (best-effort) — skipped.',
    );
  }
}

/** A representative extension per `ProjectLanguage` (`../init/plan.js`), used
 * only to probe the live coverage-profile registry — not a duplicate source
 * of truth for which languages exist, since `getProfileForExtension` is the
 * actual check. */
const LANGUAGE_PROBE_EXTENSION: Partial<Record<string, string>> = {
  js: '.ts',
  python: '.py',
  go: '.go',
  rust: '.rs',
  php: '.php',
};

/**
 * Flags `verification.coverageMode: 'assertion'` paired with a detected
 * project language that has no assertion-mode span-parsing support.
 * `mention` mode is always fine regardless of language, so this only fires
 * on the one unsafe pairing. Support is checked against the LIVE
 * coverage-profile registry (`../verify/coverage-profiles/registry.js`),
 * not a hardcoded language list — phase 166 (AC-4) shipped only a js/ts
 * profile, so this check originally hardcoded `lang === 'js'`; phase 167
 * built real profiles for python/go/rust/php too, and a doc-content review
 * during that phase caught that this check still hardcoded the pre-167
 * language list, which would have kept producing a false "no support yet"
 * warning for exactly the four languages the phase was built to support —
 * checking the registry directly means this check never goes stale again
 * when a future language profile ships. Read-only, best-effort, never
 * throws (doctor convention): a config-load failure just skips the check,
 * since `checkInitialized`/`checkState` already own reporting a broken
 * config.
 */
export async function checkCoverageModeLanguageSupport(root: string): Promise<DoctorCheck> {
  try {
    const config = await loadConfig(root);
    if (config.verification.coverageMode !== 'assertion') {
      return pass(
        'coverage-mode-language-support',
        "Not applicable — coverageMode is not 'assertion'.",
      );
    }
    const lang = detectProjectLanguage(root);
    const probeExt = LANGUAGE_PROBE_EXTENSION[lang];
    if (probeExt !== undefined && getProfileForExtension(probeExt) !== undefined) {
      return pass(
        'coverage-mode-language-support',
        `Detected language ('${lang}') has assertion-mode span-parsing support.`,
      );
    }
    return fail(
      'coverage-mode-language-support',
      'warning',
      `coverageMode is 'assertion' but the detected project language ('${lang}') has no assertion-mode span-parsing support yet.`,
      "Run `cadence config edit coverageMode` to switch it to 'mention'.",
    );
  } catch {
    return pass(
      'coverage-mode-language-support',
      'Coverage-mode language support not determinable (best-effort) — skipped.',
    );
  }
}

/**
 * Warn threshold for {@link checkPhaseFreshness} (Phase 208, rec-20260722-001):
 * a task `updatedAt` within this many ms of `now` is treated as possible
 * live concurrent-session activity. 10 minutes. Hardcoded and documented,
 * not config — matches `HANDOFF_WARN_THRESHOLD`'s pattern; a config knob was
 * explicitly rejected for this phase (see the phase's DRAFT boundaries).
 */
export const PHASE_FRESHNESS_WARN_THRESHOLD_MS = 600_000;

/** Shape this check needs from a `<activeDraft>-PROGRESS.json` file — see the full `ProgressJson` interface in `../build/record.ts`. */
interface ProgressJsonShape {
  tasks?: Record<string, { updatedAt?: unknown }>;
}

/**
 * Warns when the active phase/draft's `PROGRESS.json` shows a task touched
 * very recently — a possible live concurrent session working the same phase
 * (Phase 208, rec-20260722-001). Read-only and best-effort: no active
 * phase/draft, or no `PROGRESS.json` written yet, both degrade to `ok`
 * rather than treating "nothing to check" as a problem. Delegates the actual
 * freshness math to the pure `assessProgressFreshness` (`../phases/liveness.js`)
 * so this function only does I/O + wiring. `now` is injectable for
 * deterministic tests; never throws (doctor convention, mirrors
 * `worktree-phases` / `handoff-retention`).
 */
export async function checkPhaseFreshness(
  root: string,
  now: Date = new Date(),
): Promise<DoctorCheck> {
  try {
    const backend = new SimpleStateBackend(root);
    let activePhase: string | null = null;
    let activeDraft: string | null = null;
    try {
      const state = await backend.readState();
      activePhase = state.activePhase;
      activeDraft = state.activeDraft;
    } catch {
      /* not initialized / unreadable state.json — treated as no active phase/draft */
    }
    if (!activePhase || !activeDraft) {
      return pass('phase-freshness', 'no active phase/draft.');
    }

    const progPath = join(
      root,
      '.cadence',
      'phases',
      activePhase,
      `${activeDraft}-PROGRESS.json`,
    );
    if (!existsSync(progPath)) {
      return pass('phase-freshness', 'no PROGRESS.json yet.');
    }

    const raw = JSON.parse(await readFile(progPath, 'utf8')) as ProgressJsonShape;
    const tasks: Record<string, string> = {};
    for (const [taskId, task] of Object.entries(raw.tasks ?? {})) {
      if (typeof task?.updatedAt === 'string') tasks[taskId] = task.updatedAt;
    }

    const result = assessProgressFreshness(tasks, now, PHASE_FRESHNESS_WARN_THRESHOLD_MS);
    if (result.isFresh && result.freshest) {
      const minutes = Math.max(0, Math.round(result.freshest.ageMs / 60_000));
      const unit = minutes === 1 ? 'minute' : 'minutes';
      return fail(
        'phase-freshness',
        'warning',
        `Task ${result.freshest.taskId} in ${activePhase}/${activeDraft} was updated ${minutes} ${unit} ago — a concurrent session may still be active on this phase/draft.`,
        'Confirm no other session is actively working on this phase/draft before continuing. ' +
          'If you are resuming after a stuck or crashed session, verify the old process is actually dead first.',
      );
    }
    return pass(
      'phase-freshness',
      `No task activity in ${activePhase}/${activeDraft} within the last ${PHASE_FRESHNESS_WARN_THRESHOLD_MS / 60_000} minutes.`,
    );
  } catch {
    return pass('phase-freshness', 'Phase freshness not determinable (best-effort) — skipped.');
  }
}

/**
 * Warn threshold for {@link checkRoadmapCurrency} (Phase 259,
 * rec-20260727-012): how far the highest on-disk phase number under
 * `.cadence/phases/` may drift ahead of the highest phase number referenced
 * in ROADMAP.md/MILESTONES.md before the check warns.
 * Hardcoded and documented, not config — matches
 * `PHASE_FRESHNESS_WARN_THRESHOLD_MS`'s pattern; closes the gap that caused
 * a 113-phase/6-week ROADMAP drift (PR #321).
 */
export const ROADMAP_DRIFT_WARN_THRESHOLD = 10;

/**
 * Scans `text` for `regex` (a global, multiline pattern with one capture
 * group of digits) and returns the highest captured number, or `null` if
 * there were zero matches. Per AC-1, a zero-match file must be excluded
 * from `checkRoadmapCurrency`'s `min(...)` entirely, never folded in as
 * `0` — returning `null` here (rather than `0`) is what makes that
 * exclusion possible at the call site.
 */
function highestPhaseMatch(text: string, regex: RegExp): number | null {
  const numbers = [...text.matchAll(regex)].map((m) => Number(m[1]));
  return numbers.length > 0 ? Math.max(...numbers) : null;
}

/**
 * Warns when `.cadence/phases/`'s highest on-disk phase number has drifted
 * more than {@link ROADMAP_DRIFT_WARN_THRESHOLD} ahead of the highest phase
 * number referenced across ROADMAP.md/MILESTONES.md (Phase 259,
 * closing the gap that caused a 113-phase/6-week ROADMAP drift, PR #321).
 * `severity` is never `'error'` and `fixId` is always `null` — generating
 * roadmap prose must never be automated; this is a human-only fix.
 *
 * Per AC-1, `drift = onDiskMax - min(includedFiles)`, where `includedFiles`
 * is the set of {ROADMAP.md, MILESTONES.md} that produced at least one
 * `Phase N` heading match — a file with **zero** matches is excluded from
 * the `min` entirely, never treated as `0` (MILESTONES.md is hand-maintained
 * prose that `cadence init` never populates beyond a one-line stub, so
 * counting an all-zero MILESTONES.md as `0` would warn permanently on every
 * consumer repo past phase 11, even with a perfectly current ROADMAP.md).
 *
 * AC-3's silent-pass Given is an *unconditional* disjunction — no phase
 * directories, **or** ROADMAP.md alone has zero matches — so a zero-match
 * ROADMAP.md short-circuits to silent `ok` before MILESTONES.md is even
 * read, regardless of what MILESTONES.md contains. (This is narrower than
 * "both files are zero": a hand-maintained MILESTONES.md that already has
 * entries must not turn a fresh-stub ROADMAP.md into a spurious warning.)
 *
 * Best-effort per doctor convention (mirrors `checkPhaseFreshness`): a read
 * failure on `.cadence/phases/`, ROADMAP.md, or MILESTONES.md for any
 * reason other than the AC-3 states above (missing file, permissions,
 * malformed) degrades to `ok` with a "not determinable" detail rather than
 * throwing.
 */
export async function checkRoadmapCurrency(root: string): Promise<DoctorCheck> {
  try {
    let phaseDirNames: string[] = [];
    try {
      const entries = await readdir(join(root, '.cadence', 'phases'), { withFileTypes: true });
      phaseDirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      // No `.cadence/phases/` at all is indistinguishable from "no phase
      // directories yet" for this check's purposes — AC-3's silent-pass path.
      phaseDirNames = [];
    }

    const onDiskNumbers = phaseDirNames
      .map((name) => phaseNumber(name))
      .filter((n): n is number => n !== null);

    if (onDiskNumbers.length === 0) {
      return pass('roadmap-currency', 'No phase directories under .cadence/phases/ yet.');
    }
    const onDiskMax = Math.max(...onDiskNumbers);

    const roadmapText = await readFile(join(root, '.cadence', 'ROADMAP.md'), 'utf8');
    const roadmapMax = highestPhaseMatch(roadmapText, /^### Phase (\d+)/gm);

    // AC-3's Given is an unconditional OR: "no phase dirs, OR ROADMAP.md has
    // zero `### Phase N` matches" → silent ok — regardless of what
    // MILESTONES.md contains. This must short-circuit before MILESTONES.md
    // is even consulted, otherwise a fresh-stub ROADMAP.md paired with a
    // hand-maintained MILESTONES.md that already has entries would compute a
    // (spurious) drift and warn, which AC-3 forbids outright.
    if (roadmapMax === null) {
      return pass(
        'roadmap-currency',
        'ROADMAP.md references no phases yet (fresh-init stub) — nothing to compare.',
      );
    }

    const milestonesText = await readFile(join(root, '.cadence', 'MILESTONES.md'), 'utf8');
    const milestonesMax = highestPhaseMatch(milestonesText, /^\s*-\s+\*\*Phase (\d+)/gm);

    // Per AC-1, MILESTONES.md is excluded from the min (not folded in as
    // `0`) whenever it has zero matches — ROADMAP.md is always included here
    // since the null-check above already guarantees `roadmapMax !== null`.
    const included = milestonesMax === null ? [roadmapMax] : [roadmapMax, milestonesMax];
    const includedMin = Math.min(...included);
    const drift = onDiskMax - includedMin;

    if (drift <= ROADMAP_DRIFT_WARN_THRESHOLD) {
      return pass(
        'roadmap-currency',
        `Roadmap currency drift is ${drift} (on-disk highest phase ${onDiskMax} vs. referenced lowest-of-included ${includedMin}) — within the ${ROADMAP_DRIFT_WARN_THRESHOLD}-phase threshold.`,
      );
    }

    return fail(
      'roadmap-currency',
      'warning',
      `Roadmap currency drift is ${drift} (on-disk highest phase is ${onDiskMax}, but the lowest of the referenced-highest phase numbers across ROADMAP.md/MILESTONES.md is ${includedMin}) — exceeds the ${ROADMAP_DRIFT_WARN_THRESHOLD}-phase threshold.`,
      'Update ROADMAP.md and/or MILESTONES.md to reflect recently landed phases — this is a manual fix; roadmap prose is never auto-generated.',
      null,
    );
  } catch {
    return pass(
      'roadmap-currency',
      'Roadmap currency not determinable (best-effort) — skipped.',
    );
  }
}

/** All three `Tier` values — the profile axis quantifies over all of them
 *  ("reachable at any tier"), never a single tier. */
const ALL_TIERS: Tier[] = ['quick-fix', 'standard', 'complex'];

/** The gate ↔ seam pairing this check evaluates. `Gate` (kebab-case, the
 *  profile-axis string space, `gates/engine.js`/`profile.ts`) and
 *  `VerifierSeam` (camelCase, the provider-axis string space,
 *  `activate/assess.js`) are different namespaces for the same two
 *  reachability subjects — this table is the single place they're paired so
 *  the rest of the check never has to conflate them. */
const CONDUCTION_GATES: ReadonlyArray<{ gate: Gate; seam: VerifierSeam }> = [
  { gate: 'code-review', seam: 'codeReview' },
  { gate: 'security-audit', seam: 'securityAudit' },
];

/** The three axes a gate's real-provider conduction can be blocked on. */
type ConductionAxis = 'profile' | 'provider' | 'session';

interface GateReachability {
  gate: Gate;
  seam: VerifierSeam;
  blockedAxes: ConductionAxis[];
}

/**
 * Per-gate axis evaluation (phase 251, AC-2). `profile` is blocked when the
 * gate is absent from `gatesFor(tier, profile).gates` at every `Tier` — the
 * profile axis quantifies over all three tiers, not a single tier×profile
 * cell. `provider` is blocked when the gate's own seam is configured to
 * `'mock'`. `session` is blocked only when the gate's own provider is
 * `'host-cli'` **and** `isClaudeCodeSession(env)` — the self-invocation
 * guard this axis mirrors only sits inside `host-cli-client.ts`'s spawn
 * path, which an `anthropic`/`local`/`mock`-configured gate never reaches.
 */
function assessGateReachability(
  gate: Gate,
  seam: VerifierSeam,
  config: CadenceConfig,
  env: NodeJS.ProcessEnv,
  profile: ReturnType<typeof effectiveProfile>,
): GateReachability {
  const blockedAxes: ConductionAxis[] = [];
  const reachableAtSomeTier = ALL_TIERS.some((tier) => gatesFor(tier, profile).gates.includes(gate));
  if (!reachableAtSomeTier) blockedAxes.push('profile');
  const provider = seamProvider(config, seam);
  if (provider === 'mock') blockedAxes.push('provider');
  if (provider === 'host-cli' && isClaudeCodeSession(env)) blockedAxes.push('session');
  return { gate, seam, blockedAxes };
}

/** `code-review`'s reachable profile×tier cells (`{strict×standard,
 *  strict×complex, standard×complex}`) differ from `security-audit`'s
 *  (`{strict×complex}` only) — the profile-axis remediation must name each
 *  gate's own cells, never a shared generic hint. */
function profileRemediationHint(gate: Gate): string {
  return gate === 'code-review'
    ? "override profile: in a DRAFT's frontmatter to 'standard' (tier: complex) or 'strict' (tier: standard or complex) to include code-review in the gate set"
    : "override profile: to 'strict' at tier: complex — security-audit's only reachable profile×tier cell";
}

/** Remediation clause for one blocked axis on one gate. */
function axisRemediation(gate: Gate, seam: VerifierSeam, axis: ConductionAxis): string {
  if (axis === 'profile') return profileRemediationHint(gate);
  if (axis === 'provider') {
    return `reconfigure ${seam}.provider off 'mock' (e.g. \`cadence activate\`)`;
  }
  return (
    'run from a real interactive terminal outside a headless Claude Code session ' +
    "(CLAUDECODE unset) so the self-invocation guard doesn't force a mock fallback"
  );
}

/**
 * `cadence doctor` check (phase 251, rec-20260801-012): reports, per gate
 * (`code-review`, `security-audit`) and per axis (profile / provider /
 * session), whether this repo's current configuration can produce a real
 * (non-`mock`) finding at all — never collapsed into one verdict, since the
 * two gates' reachable profile×tier cells are asymmetric (SPEC Context,
 * Blocker 1). Pure and injectable (`config`, `env`) so it is testable
 * without a real terminal, provider, or mutated `process.env` (AC-3); the
 * only two live inputs are `.cadence/config.json` and `NodeJS.ProcessEnv`
 * — no tier, no active-DRAFT input (the check evaluates
 * `effectiveProfile(config, null)`, the project default, not any specific
 * in-flight DRAFT's override — see SPEC Context). `severity: 'warning'`
 * and `fixId: null` always: none of the three axes has a safe auto-repair,
 * each remediation is an operator decision (a profile override, a
 * different execution context, or a provider reconfiguration).
 *
 * Phase 267 (267-01, T3): investigated, deliberately left unchanged. This
 * check answers "CAN this repo's config produce a real finding at all,"
 * purely from `config`/`env` — it takes no `Summary`, `GateProvenance`, or
 * `AssuranceRecord` input and never reads a settle's gate-provenance
 * `status` (confirmed: no reference to `Summary`/`assurance`/
 * `GateProvenance` anywhere under `src/doctor/`). Mock-abstention (T2)
 * relabels a *recorded* clean pass on a *past* settle; it does not change
 * what the current config is capable of producing on the *next* one, so a
 * settle with only abstained mock review gates still reports exactly what
 * it reported before this phase: `code-review`/`security-audit` blocked by
 * `provider` under a mock-configured seam.
 */
export function checkConductionReachability(
  config: CadenceConfig,
  env: NodeJS.ProcessEnv = process.env,
): DoctorCheck {
  const profile = effectiveProfile(config, null);
  const results = CONDUCTION_GATES.map(({ gate, seam }) =>
    assessGateReachability(gate, seam, config, env, profile),
  );

  const detail =
    'Real-provider conduction reachability — ' +
    results
      .map(({ gate, blockedAxes }) =>
        blockedAxes.length === 0
          ? `${gate}: reachable`
          : `${gate}: blocked by ${blockedAxes.join(', ')}`,
      )
      .join('; ') +
    '.';

  const blocked = results.filter((r) => r.blockedAxes.length > 0);
  if (blocked.length === 0) {
    return pass('conduction-reachability', detail);
  }

  const remediation = blocked
    .map(
      ({ gate, seam, blockedAxes }) =>
        `${gate}: ${blockedAxes.map((axis) => axisRemediation(gate, seam, axis)).join('; ')}`,
    )
    .join(' | ');

  return fail('conduction-reachability', 'warning', detail, remediation);
}

/**
 * One pending `.changeset/*.md` entry (excluding `README.md`), as gathered by
 * {@link gatherLocalReleaseFacts}. `bumpTypes` is parsed from the changeset's
 * leading `---\n...\n---` frontmatter; a no-bump (empty-frontmatter)
 * changeset yields `[]`, not an error.
 */
export interface PendingChangeset {
  filename: string;
  bumpTypes: string[];
}

/**
 * Local `packages/core/package.json` facts, as gathered by
 * {@link gatherLocalReleaseFacts}. `engines` is defaulted to `{}` when the
 * `engines` key is absent from `package.json` — an absent key is not a read
 * failure; normalizing it keeps the AC-1 comparison symmetric with the
 * published side's own empty-object case, so "both absent" is correctly
 * never a divergence.
 */
export interface LocalReleaseFacts {
  name: string;
  version: string;
  engines: Record<string, string>;
  pendingChangesets: PendingChangeset[];
}

/**
 * Published npm-registry facts for the package named by
 * {@link LocalReleaseFacts.name}, as gathered by
 * {@link gatherPublishedReleaseFacts}. `fetchFailed: false` with
 * `engines: {}` specifically means "fetched successfully, the published
 * package declares no `engines` field at all" — verified live that `npm view
 * <pkg> engines --json` exits `0` with empty stdout in that case, which is a
 * successful fetch of an empty/absent value, not a parse failure. That is
 * distinct from `fetchFailed: true` (genuine failure: `npm` missing,
 * non-zero exit, timeout, or a JSON-parse failure on non-empty stdout), which
 * always carries `version: null, engines: null`.
 */
export interface PublishedReleaseFacts {
  fetchFailed: boolean;
  version: string | null;
  engines: Record<string, string> | null;
}

/**
 * Combined input to the pure {@link evaluateReleaseCurrency}. `local` is
 * nullable so the AC-5(a) "not determinable" branch can be expressed
 * entirely inside the pure function per the DRAFT's T1 step 2 — the
 * orchestrator ({@link checkReleaseCurrency}) still short-circuits before
 * ever calling {@link gatherPublishedReleaseFacts} when local facts are
 * unavailable, which is the mechanism (not this type) that keeps the
 * network call off the ~65 existing test-suite `runDoctor` call sites.
 */
export interface ReleaseCurrencyFacts {
  local: LocalReleaseFacts | null;
  published: PublishedReleaseFacts;
}

/** Per-key value comparison of two `engines` maps — never raw
 *  `JSON.stringify` equality, since key order is not guaranteed. */
function enginesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

/** Stable, human-readable rendering of an `engines` map for detail strings. */
function formatEngines(engines: Record<string, string>): string {
  return JSON.stringify(engines);
}

/** `true` iff any pending changeset declares a `major` or `minor` bump for
 *  any package — the trigger for AC-2's escalated wording. The complement
 *  (this being `false`) covers all-`patch` AND any mix of `patch`/no-bump
 *  changesets, not "every changeset is literally `patch`". */
function hasMajorOrMinorBump(pending: PendingChangeset[]): boolean {
  return pending.some((c) => c.bumpTypes.includes('major') || c.bumpTypes.includes('minor'));
}

/** Renders each pending changeset as `filename (bump, bump)`, or bare
 *  `filename` when it declares no bump type (a no-bump changeset). */
function formatPendingChangesetList(pending: PendingChangeset[]): string {
  return pending
    .map((c) => (c.bumpTypes.length > 0 ? `${c.filename} (${c.bumpTypes.join(', ')})` : c.filename))
    .join(', ');
}

/** AC-4's compose clause, appended to the AC-1 engines-divergence detail
 *  when pending changesets are also present — names the changeset
 *  filename(s) without suppressing the engines-divergence information that
 *  precedes it. */
function pendingChangesetsClause(pending: PendingChangeset[]): string {
  return `Pending changeset(s) are also unreleased: ${formatPendingChangesetList(pending)}.`;
}

/** AC-2's standalone detail: routine wording when no pending changeset
 *  declares a `major`/`minor` bump, visibly escalated wording (explicitly
 *  naming "major"/"minor") when at least one does. */
function pendingChangesetsStandaloneDetail(pending: PendingChangeset[]): string {
  const list = formatPendingChangesetList(pending);
  return hasMajorOrMinorBump(pending)
    ? `Pending changeset(s) declare a major or minor version bump not yet released: ${list}.`
    : `Pending changeset(s) are awaiting release (patch-level or unspecified bumps only): ${list}.`;
}

/**
 * Pure verdict function (phase 262, T1/AC-1 through AC-5) — no I/O. Implements
 * the precedence: local-unreadable/private (`facts.local === null`) → AC-5(a)
 * pass; else `engines` divergence (only evaluable when the published fetch
 * succeeded) → AC-1/AC-4 warning, folding in a pending-changesets clause when
 * also present; else pending changesets alone → AC-2 warning; else → AC-3
 * pass, worded differently depending on whether the published fetch
 * succeeded. `severity` is never `'error'` and `fixId` is always `null` —
 * this is always a manual, judgment-call fix (cut a release, or confirm the
 * divergence is intentional), matching every other advisory doctor check.
 */
export function evaluateReleaseCurrency(facts: ReleaseCurrencyFacts): DoctorCheck {
  const { local, published } = facts;

  if (local === null) {
    return pass(
      'release-currency',
      'Release currency not determinable (best-effort) — skipped.',
    );
  }

  const pending = local.pendingChangesets;
  // Distinct from `!published.fetchFailed` alone: a caller (or a
  // hand-fabricated test facts object) can legally construct
  // `{ fetchFailed: false, engines: null }`, which is not a state the real
  // gatherer ever produces but IS a state `evaluateReleaseCurrency` — being
  // pure — must still handle correctly. Both the divergence test AND AC-3's
  // wording gate on this, so neither can claim a comparison happened when it
  // didn't.
  const enginesComparable = !published.fetchFailed && published.engines !== null;
  const enginesDiverge = enginesComparable && !enginesEqual(local.engines, published.engines!);

  if (enginesDiverge) {
    const publishedEngines = published.engines as Record<string, string>;
    const publishedVersion = published.version ?? 'unknown';
    let detail =
      `Published engines diverge from local under the current version string: ` +
      `local version ${local.version} declares engines ${formatEngines(local.engines)}, ` +
      `but npm's published version ${publishedVersion} declares engines ${formatEngines(publishedEngines)}.`;
    if (pending.length > 0) {
      detail += ` ${pendingChangesetsClause(pending)}`;
    }
    return fail(
      'release-currency',
      'warning',
      detail,
      'cut a release to publish the current engines/content, or confirm the divergence is intentional — this is a manual decision, never auto-fixed.',
      null,
    );
  }

  if (pending.length > 0) {
    // Per AC-5(b): when the published baseline couldn't be compared
    // (network failure, or the type-legal-but-inconsistent
    // `{fetchFailed:false, engines:null}` shape I1 covers), this branch's
    // detail must say so — otherwise "engines verified and in sync" and
    // "engines never checked" are indistinguishable to an operator reading
    // the same pending-changesets wording either way.
    const detail = enginesComparable
      ? pendingChangesetsStandaloneDetail(pending)
      : `${pendingChangesetsStandaloneDetail(pending)} (published engines could not be verified)`;
    return fail(
      'release-currency',
      'warning',
      detail,
      'cut a release to consume the pending changeset(s) — manual fix.',
      null,
    );
  }

  if (enginesComparable) {
    return pass(
      'release-currency',
      'local/published engines are in sync and no changesets are pending.',
    );
  }
  return pass(
    'release-currency',
    'no pending changesets; published engines could not be verified.',
  );
}

/**
 * Parses the bump-type entries declared in a changeset's leading
 * `---\n...\n---` frontmatter block — a small line scan, not a
 * `changesets`-library dependency (CLAUDE.md's zero-runtime-dependency
 * bias). Each frontmatter line has the shape `"<pkg>": <bump>` (quotes
 * optional on the key), e.g. `"@thomas-powers-jr/cadence-core": minor`. Only
 * recognizes a frontmatter block that opens on the file's first non-blank
 * line — a `---` horizontal rule appearing later in the body (with no
 * frontmatter at all) is not mistaken for one. An empty-frontmatter (no-bump)
 * changeset yields `[]`, not an error.
 */
function parseChangesetBumpTypes(content: string): string[] {
  const lines = content.split('\n').map((line) => line.replace(/\r$/, ''));
  const firstNonBlankIdx = lines.findIndex((line) => line.trim().length > 0);
  if (firstNonBlankIdx === -1 || lines[firstNonBlankIdx]?.trim() !== '---') return [];
  const endIdx = lines.findIndex(
    (line, i) => i > firstNonBlankIdx && line.trim() === '---',
  );
  if (endIdx === -1) return [];
  const bumpTypes: string[] = [];
  const bumpLineRe = /^\s*["']?[^"':]+["']?\s*:\s*(major|minor|patch)\s*$/;
  for (const line of lines.slice(firstNonBlankIdx + 1, endIdx)) {
    const m = line.match(bumpLineRe);
    if (m && m[1] !== undefined) bumpTypes.push(m[1]);
  }
  return bumpTypes;
}

/**
 * npm's legal package-name shape: lowercase, optional `@scope/`, no shell
 * metacharacters. Used by {@link gatherPublishedReleaseFacts} to refuse
 * shelling out to `npm view` for a name that could not possibly be real.
 * Deliberately still permits a leading `-` at the regex level (matching
 * npm's own `validate-npm-package-name` shape) — {@link isSafeNpmPackageName}
 * layers the actual argument-injection refusal on top, since a name npm
 * CLI would interpret as a flag (e.g. `-f`, `--force`) is not a package name
 * this check may ever pass to `npm view`, regardless of what npm's own
 * naming rules permit.
 */
const NPM_PACKAGE_NAME_RE = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * True only for a `pkgName` that is both a legal npm package name AND cannot
 * be interpreted as an `npm` CLI flag. `pkgName` originates from an
 * arbitrary local `package.json`'s `name` field (not necessarily belonging
 * to this repo), so a name starting with `-` must be refused outright — npm
 * parses `-f`/`--force`-shaped arguments as flags rather than a package
 * name, silently resolving an unrelated real package and returning
 * `fetchFailed: false` with fabricated facts instead of failing loudly.
 */
export function isSafeNpmPackageName(pkgName: string): boolean {
  return !pkgName.startsWith('-') && NPM_PACKAGE_NAME_RE.test(pkgName);
}

/**
 * Pure-filesystem gatherer (phase 262, T1) for the local half of
 * {@link ReleaseCurrencyFacts}: reads `packages/core/package.json` and
 * separately scans `.changeset/*.md` (excluding `README.md`). Returns `null`
 * — never throws — on any read/parse failure or when the package declares
 * `private: true` (AC-5 case (a): the whole check is not determinable). No
 * network access.
 */
export async function gatherLocalReleaseFacts(root: string): Promise<LocalReleaseFacts | null> {
  let parsed: unknown;
  try {
    const raw = await readFile(join(root, 'packages', 'core', 'package.json'), 'utf8');
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.private === true) return null;
  const { name, version } = obj;
  if (typeof name !== 'string' || typeof version !== 'string') return null;

  let engines: Record<string, string> = {};
  if (typeof obj.engines === 'object' && obj.engines !== null) {
    engines = Object.fromEntries(
      Object.entries(obj.engines as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  }

  const pendingChangesets: PendingChangeset[] = [];
  try {
    const changesetDir = join(root, '.changeset');
    const files = (await readdir(changesetDir))
      .filter((f) => f.endsWith('.md') && f !== 'README.md')
      .sort();
    for (const filename of files) {
      try {
        const content = await readFile(join(changesetDir, filename), 'utf8');
        pendingChangesets.push({ filename, bumpTypes: parseChangesetBumpTypes(content) });
      } catch {
        // One unreadable changeset file shouldn't blank out the rest.
      }
    }
  } catch {
    // No .changeset/ directory at all — zero pending changesets, not an error.
  }

  return { name, version, engines, pendingChangesets };
}

/**
 * Network gatherer (phase 262, T1) for the published half of
 * {@link ReleaseCurrencyFacts}. Makes TWO separate `pexecFile` calls — `npm
 * view <pkgName> version` (plain text) and `npm view <pkgName> engines
 * --json` — deliberately never combined into one `npm view <pkg> version
 * engines --json` call: verified live that when only one of the two fields
 * exists on the published package, npm's `--json` output silently collapses
 * to that field's bare value instead of a `{version, engines}` object, which
 * a combined call cannot distinguish from the other field being absent.
 *
 * Validates `pkgName` against npm's legal package-name shape before shelling
 * out at all (it is `local.name`, read from an arbitrary local
 * `package.json` that may not belong to this repo — not safe to interpolate
 * into a shell string). `shell` is platform-guarded to `win32` only (where
 * `npm` resolves to `npm.cmd`), matching this repo's existing `npx`-needs-
 * `shell:true`-on-win32 precedent. Both calls carry a bounded 5000ms timeout
 * (matching the existing precedent at {@link listTrackedCadenceOwnedPaths}) so
 * a hung network call can never hang `cadence doctor` itself.
 *
 * On any genuine failure — invalid package name, `npm` missing (`ENOENT`),
 * exit 127 under the `shell: true` path, any other non-zero exit, or a
 * JSON-parse failure on non-empty `engines` stdout — returns
 * `{ fetchFailed: true, version: null, engines: null }`. Empty/whitespace-only
 * `engines` stdout on a successful (exit 0) call is `engines: {}`, not a
 * parse failure — see {@link PublishedReleaseFacts}.
 */
export async function gatherPublishedReleaseFacts(pkgName: string): Promise<PublishedReleaseFacts> {
  if (!isSafeNpmPackageName(pkgName)) {
    return { fetchFailed: true, version: null, engines: null };
  }
  const execOpts = {
    timeout: 5000,
    windowsHide: true,
    shell: process.platform === 'win32',
  };
  try {
    const [versionResult, enginesResult] = await Promise.all([
      pexecFile('npm', ['view', pkgName, 'version'], execOpts),
      pexecFile('npm', ['view', pkgName, 'engines', '--json'], execOpts),
    ]);
    const version = versionResult.stdout.trim();
    const enginesStdout = enginesResult.stdout.trim();
    let engines: Record<string, string> = {};
    if (enginesStdout.length > 0) {
      const parsedEngines: unknown = JSON.parse(enginesStdout);
      if (typeof parsedEngines !== 'object' || parsedEngines === null || Array.isArray(parsedEngines)) {
        return { fetchFailed: true, version: null, engines: null };
      }
      engines = Object.fromEntries(
        Object.entries(parsedEngines as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    }
    return { fetchFailed: false, version: version.length > 0 ? version : null, engines };
  } catch {
    return { fetchFailed: true, version: null, engines: null };
  }
}

/**
 * `cadence doctor` check (phase 262, `rec-20260731-001`) that detects when the
 * local repo's published-package content has drifted from what npm actually
 * serves — closing the specific `engines`-drift instance behind the
 * 2026-07-27 incident (phase 238/PR #324 bumped the local `engines` floor to
 * `>=22`, but npm's published tarball under that *same* version string still
 * declared `>=20`, undetected for 4 days). Orchestrates
 * {@link gatherLocalReleaseFacts} (always first) and the injectable
 * `gatherPublished` (defaulting to {@link gatherPublishedReleaseFacts}, real
 * network) into the pure {@link evaluateReleaseCurrency} — mirrors
 * {@link checkLedgerRemoteCollision}'s injectable-`gather` idiom, not a
 * `node:child_process` mock (see this phase's DRAFT).
 *
 * When local facts are unavailable (`null`), `gatherPublished` is NEVER
 * called — this is load-bearing, not just an optimization: it is what keeps
 * the ~65 existing test-suite `runDoctor(...)` call sites (which use
 * `@thomas-powers-jr/cadence-testkit`'s `tempRepo` fixtures with no
 * `packages/core/package.json` present) from ever making a real network
 * call. `local` is gathered outside the try/catch that guards
 * `gatherPublished`, and deliberately re-used in the catch branch below —
 * per AC-5(b), a `gatherPublished` failure (thrown, not just a returned
 * `fetchFailed: true`) must still let `evaluateReleaseCurrency` see the
 * already-gathered local facts (name/engines/pending changesets), so the
 * pending-changesets signal (AC-2) is still evaluated rather than being
 * discarded along with the failed network call. An earlier version of this
 * function scoped `local` inside the try, so a throwing `gatherPublished`
 * fell all the way through to a generic best-effort pass and silently
 * suppressed AC-2 — exactly the bug this DRAFT's Boundaries name as its own
 * first-draft mistake, reintroduced through the error path and caught by
 * independent review of the implementation.
 */
export async function checkReleaseCurrency(
  root: string,
  gatherPublished: (pkgName: string) => Promise<PublishedReleaseFacts> = gatherPublishedReleaseFacts,
): Promise<DoctorCheck> {
  let local: LocalReleaseFacts | null = null;
  try {
    local = await gatherLocalReleaseFacts(root);
    if (local === null) {
      return evaluateReleaseCurrency({
        local: null,
        published: { fetchFailed: true, version: null, engines: null },
      });
    }
    const published = await gatherPublished(local.name);
    return evaluateReleaseCurrency({ local, published });
  } catch {
    // `local` may already be populated here (a thrown/rejected
    // `gatherPublished` lands in this catch too) — evaluate with whatever we
    // have rather than discarding it; `evaluateReleaseCurrency` handles a
    // `null` local the same way this function's own AC-5(a) branch above
    // does, and a non-null local with a failed-fetch `published` correctly
    // takes the AC-5(b) path (pending changesets still checked).
    return evaluateReleaseCurrency({
      local,
      published: { fetchFailed: true, version: null, engines: null },
    });
  }
}

export async function runDoctor(
  root: string,
  env: DoctorEnv,
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [
    checkNode(env),
    await checkInitialized(root),
    await checkState(root),
    await checkStateTracked(root),
    await checkGitHooks(root),
    await checkHostHooks(root),
    await checkHostCommands(root),
    await checkCodexHooks(root),
    await checkCodexPrompts(root),
    await checkCodexAgentsMd(root),
    await checkCodexCadenceCommand(root),
    await checkWorktreePhases(root),
    await checkPhaseFreshness(root),
    await checkHandoffRetention(root),
    await checkVerificationReadiness(root),
    await checkRecommendationShippedDrift(root),
    await checkOrphanedEvidence(root),
    await checkLedgerRemoteCollision(root),
    await checkCoverageModeLanguageSupport(root),
    await checkRoadmapCurrency(root),
    await checkReleaseCurrency(root),
  ];
  try {
    const config = await loadConfig(root);
    checks.push(checkConductionReachability(config));
  } catch {
    // Best-effort, mirrors checkVerificationReadiness/checkCoverageModeLanguageSupport:
    // a config-load failure here means .cadence/config.json is missing or invalid,
    // which `checkInitialized` above already reports as `error` — this degrades to
    // `pass` (not a fabricated `warning`/`ok` reachability verdict) purely to avoid
    // double-reporting the same underlying problem, never to claim conduction is
    // reachable when it couldn't be determined.
    checks.push(
      pass(
        'conduction-reachability',
        'Conduction reachability not determinable (best-effort) — skipped.',
      ),
    );
  }
  return rollup(checks);
}
