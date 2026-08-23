import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The pre-Phase-250 npm scope. A `_managedBy: "cadence"` hook entry whose
 * command still mentions it predates the `@manehorizons` → `@thomas-powers-jr`
 * rename and needs a fresh `install` run to pick up the current command
 * string (phase 250, AC-5).
 */
const STALE_NPM_SCOPE = '@manehorizons/';

/** True when a string anywhere in `value`'s subtree references {@link STALE_NPM_SCOPE}. */
function referencesStaleScope(value: unknown): boolean {
  if (typeof value === 'string') return value.includes(STALE_NPM_SCOPE);
  if (Array.isArray(value)) return value.some(referencesStaleScope);
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(referencesStaleScope);
  }
  return false;
}

/**
 * Deep-scan a parsed `.claude/settings.json` (or `.codex/hooks.json`) object
 * for any `_managedBy: "cadence"` entry — the marker the host adapter writes
 * on the lifecycle hooks it installs — with no regard for whether its command
 * is current. This is marker-presence only; most callers want
 * {@link hasManagedCadence}, which also rejects stale-scope entries.
 */
export function hasManagedCadenceMarker(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasManagedCadenceMarker);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o['_managedBy'] === 'cadence') return true;
    return Object.values(o).some(hasManagedCadenceMarker);
  }
  return false;
}

/**
 * Deep-scan for a `_managedBy: "cadence"` entry whose own subtree still
 * references the stale, pre-rename `@manehorizons` npm scope (phase 250,
 * AC-5). Gated on the marker so an unrelated, user-authored mention of the
 * old scope elsewhere in the document never trips it — only a hook CADENCE
 * itself installed, but hasn't reinstalled since the rename, counts.
 */
export function hasStaleScopeManagedHook(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasStaleScopeManagedHook);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (o['_managedBy'] === 'cadence' && referencesStaleScope(o)) return true;
    return Object.values(o).some(hasStaleScopeManagedHook);
  }
  return false;
}

/**
 * Whether `value` carries a CADENCE-managed hook entry that is both present
 * AND current — i.e. {@link hasManagedCadenceMarker} is true and
 * {@link hasStaleScopeManagedHook} is false anywhere in the document.
 *
 * Existence-only, deliberately: still shared by `checkCodexHooks` and the
 * `config explain` gather, both of which stay existence-based after phase
 * 295. `checkHostHooks` (Claude Code) no longer relies on this alone —
 * phase 295 found this repo's own `.claude/settings.json` missing 2 of 7
 * managed entries while this predicate reported `true` throughout, so
 * `checkHostHooks` now additionally runs {@link findMissingManagedHooks}
 * first. That divergence (one check now verifies completeness, two still
 * verify only existence) is intentional and recorded, not an oversight —
 * `checkCodexHooks`'s identical gap is deferred (`.codex/hooks.json`'s
 * shape and `host-codex`'s expected set differ genuinely) and filed as its
 * own recommendation rather than fixed here.
 *
 * Phase 250 (AC-5): a managed marker alone is no longer sufficient — an
 * entry installed before the npm-scope rename still carries
 * `_managedBy: "cadence"` but its `command` string invokes the old
 * `@manehorizons`-scoped package. That entry is stale, not properly managed,
 * so it no longer counts here. Composed at the whole-document level (not
 * folded into a single per-entry check) so that even one stale entry among
 * several managed entries is enough to report "not managed" — a real
 * install always rewrites every managed entry with the same command
 * (`host-claude-code/src/install.ts`), so a mixed document shouldn't occur
 * in practice, but this stays correct if it ever does. `doctor`'s existing
 * `host-install`/`codex-host-install` repair (`packages/core/src/doctor/fix.ts`)
 * already re-runs install and rewrites the command once this predicate
 * reports `false` — no change needed there.
 */
export function hasManagedCadence(value: unknown): boolean {
  return hasManagedCadenceMarker(value) && !hasStaleScopeManagedHook(value);
}

/** One managed hook entry the Claude Code installer writes: which lifecycle
 *  event, and which tool-matcher (`null` for a plain, unmatched entry). */
export interface ExpectedManagedHook {
  event: string;
  matcher: string | null;
}

/**
 * Core's own independent copy of `@thomas-powers-jr/cadence-host-toolkit`'s
 * `CLAUDE_CODE_EXPECTED_HOOKS` (phase 295). Core cannot import host-toolkit
 * or any host-adapter package — this list is deliberately duplicated, not
 * imported, and pinned against the host-toolkit original by a drift test in
 * `packages/host-claude-code` (which depends on both). If a future hook
 * event is added to the installer without updating this list (or vice
 * versa), that test fails instead of the two silently disagreeing forever.
 */
export const CLAUDE_CODE_EXPECTED_HOOKS: readonly ExpectedManagedHook[] = [
  { event: 'SessionStart', matcher: null },
  { event: 'UserPromptSubmit', matcher: null },
  { event: 'PreToolUse', matcher: 'Edit|Write|MultiEdit|NotebookEdit' },
  { event: 'PostToolUse', matcher: 'Edit|Write|MultiEdit|NotebookEdit' },
  { event: 'PostToolUse', matcher: 'Skill' },
  { event: 'Stop', matcher: null },
  { event: 'SubagentStop', matcher: null },
  { event: 'SubagentStart', matcher: null },
];

/**
 * Which of `expected`'s managed hook entries are missing from a parsed
 * `.claude/settings.json` document — every one, not just the first
 * (phase 295, AC-2). An expected entry counts as present when
 * `hooks[event]` contains a `_managedBy: 'cadence'` entry whose `matcher`
 * (or absence of one, for `matcher: null`) matches exactly. Ignores
 * non-managed entries entirely (a third-party or user-authored hook on the
 * same event never counts toward or against completeness). Best-effort: a
 * malformed `hooks` shape is treated as "nothing present" rather than
 * throwing.
 */
export function findMissingManagedHooks(
  parsed: unknown,
  expected: readonly ExpectedManagedHook[] = CLAUDE_CODE_EXPECTED_HOOKS,
): ExpectedManagedHook[] {
  const hooksByEvent =
    parsed !== null && typeof parsed === 'object'
      ? ((parsed as { hooks?: unknown }).hooks as Record<string, unknown> | undefined)
      : undefined;

  const missing: ExpectedManagedHook[] = [];
  for (const exp of expected) {
    const entries = hooksByEvent?.[exp.event];
    const found =
      Array.isArray(entries) &&
      entries.some((e) => {
        if (e === null || typeof e !== 'object') return false;
        const entry = e as { _managedBy?: unknown; matcher?: unknown };
        return entry._managedBy === 'cadence' && (entry.matcher ?? null) === exp.matcher;
      });
    if (!found) missing.push(exp);
  }
  return missing;
}

/**
 * Best-effort: whether the Claude Code adapter's CADENCE-managed hook entries
 * are present AND current (not stale-scope, per phase 250's AC-5) in
 * `<root>/.claude/settings.json`. Returns `false` on an absent, unreadable,
 * invalid-JSON, or stale-scope-only file — never throws. (Callers that need
 * to distinguish *invalid JSON* from *no marker* — like `doctor` — read the file
 * themselves and reuse {@link hasManagedCadence}.)
 */
export async function hostHooksInstalled(root: string): Promise<boolean> {
  const settings = join(root, '.claude', 'settings.json');
  if (!existsSync(settings)) return false;
  try {
    return hasManagedCadence(JSON.parse(await readFile(settings, 'utf8')));
  } catch {
    return false;
  }
}
