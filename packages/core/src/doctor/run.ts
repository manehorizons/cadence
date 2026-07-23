import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';
import { MOCK_VERIFIER_NOTICE, CadenceStateZ, type CadenceState } from '@manehorizons/cadence-types';
import { checkNodeMajor } from '../cli/node-guard.js';
import { loadConfig } from '../config/loader.js';
import { assessReadiness, isClaudeCodeSession } from '../activate/assess.js';
import { gatherOccupancy } from '../phases/occupancy.js';
import { detectPhaseCollision, type Occupancy } from '../phases/collision.js';
import { readRecommendationLedger } from '../intelligence/store/io.js';
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
import { hasManagedCadence } from './host-hooks.js';

function checkNode(env: DoctorEnv): DoctorCheck {
  const r = checkNodeMajor(env.nodeVersion);
  return r.ok
    ? pass('node', `Node ${env.nodeVersion} satisfies the >=20 floor.`)
    : fail('node', 'error', r.message, 'Upgrade Node to >=20 and retry.');
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
      'Run `npx -y @manehorizons/cadence-host-codex install` to write Codex lifecycle hooks.',
      'codex-host-install',
    );
  }
  try {
    const parsed = JSON.parse(await readFile(hooksPath, 'utf8'));
    if (hasManagedCadence(parsed)) {
      return pass('codex-hooks', 'CADENCE-managed Codex hook entries are present.');
    }
    return fail(
      'codex-hooks',
      'warning',
      'No CADENCE-managed (_managedBy: "cadence") hook entries found in .codex/hooks.json.',
      'Run `npx -y @manehorizons/cadence-host-codex install` to rewrite Codex lifecycle hooks.',
      'codex-host-install',
    );
  } catch (err) {
    return fail(
      'codex-hooks',
      'warning',
      `.codex/hooks.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      'Fix or regenerate it with `npx -y @manehorizons/cadence-host-codex install`.',
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
      'Run `npx -y @manehorizons/cadence-host-codex install` before opening Codex.',
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
      'Fix or regenerate Codex prompts with `npx -y @manehorizons/cadence-host-codex install`.',
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
    'Install @manehorizons/cadence-core globally or reinstall Codex prompts with an explicit --cadence command.',
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
 * is mock (remedy: `cadence activate`) or a real provider lacks its credentials;
 * `ok` otherwise. Read-only, best-effort, never throws (doctor convention). `env`
 * is injectable for deterministic tests.
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
      return fail(
        'verification-readiness',
        'warning',
        MOCK_VERIFIER_NOTICE.message,
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
        return fail(
          'verification-readiness',
          'warning',
          `deep-verify is set to 'anthropic' but its credentials are missing — it will fall back to mock. Being logged into Claude Code does not supply ${envVar}; that is a separate credential.`,
          `Set ${envVar}, or run \`cadence activate --provider host-cli\` to reuse your Claude Code login instead.`,
        );
      }
      return fail(
        'verification-readiness',
        'warning',
        `deep-verify is set to '${r.provider}' but its credentials are missing — it will fall back to mock.`,
        `Set ${envVar} (or run \`cadence activate\`).`,
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
    await checkCoverageModeLanguageSupport(root),
  ];
  return rollup(checks);
}
