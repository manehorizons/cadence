// packages/core/src/config-edit/fields.ts
import type { CadenceConfig } from '@manehorizons/cadence-types';

/** One selectable value for an enum field, with a one-line description. */
export interface FieldChoice {
  value: string;
  blurb: string;
}

/**
 * A single wizard-editable config key. Curated to the behavior-shaping subset
 * that `config explain` surfaces; advanced keys stay `config set` territory.
 * Help one-liners are authored here (not imported from `cli/`) to keep the
 * pure-core → cli dependency from inverting — same call slice 91 made.
 */
export interface EditableField {
  /** Canonical short target name (matches `config edit <name>`). */
  name: string;
  /** Dotted path into the config object (for setPath / getPath). */
  dottedKey: string;
  /** Prompt label. */
  label: string;
  /** One-line context shown above the choices. */
  help: string;
  /** Legal enum choices, in display order. */
  choices: FieldChoice[];
  /** Pull the currently-active value out of a config. */
  current(config: CadenceConfig): string;
}

export const EDITABLE_FIELDS: EditableField[] = [
  {
    name: 'profile',
    dottedKey: 'profile',
    label: 'Profile (user-involvement)',
    help: 'How much you stay in the loop — combines with tier to pick the gate set.',
    choices: [
      { value: 'strict', blurb: 'every step is a checkpoint' },
      { value: 'standard', blurb: 'major-step gating (approve + verify)' },
      { value: 'auto', blurb: 'hands-off; anomalies surface automatically' },
    ],
    current: (c) => c.profile,
  },
  {
    name: 'loopEnforcement',
    dottedKey: 'loopEnforcement',
    label: 'Loop enforcement',
    help: 'How hard CADENCE enforces the DRAFT→BUILD→SETTLE order.',
    choices: [
      { value: 'strict', blurb: 'block out-of-order actions' },
      { value: 'soft', blurb: 'warn but allow' },
      { value: 'reminder', blurb: 'nudge only' },
    ],
    current: (c) => c.loopEnforcement,
  },
  {
    name: 'acDiscipline',
    dottedKey: 'acDiscipline',
    label: 'Acceptance-criteria discipline',
    help: 'How strictly each AC must be referenced by a test.',
    choices: [
      { value: 'strict', blurb: 'every AC needs a test reference' },
      { value: 'tier-scaled', blurb: 'scales with phase tier' },
      { value: 'optional', blurb: 'no enforcement' },
    ],
    current: (c) => c.acDiscipline,
  },
  {
    name: 'commitCadence',
    dottedKey: 'commitCadence',
    label: 'Commit cadence',
    help: 'How often the loop expects commits.',
    choices: [
      { value: 'task', blurb: 'commit per task' },
      { value: 'draft', blurb: 'commit per draft' },
      { value: 'manual', blurb: 'you own commits' },
    ],
    current: (c) => c.commitCadence,
  },
  {
    name: 'verifier',
    dottedKey: 'verifier.provider',
    label: 'Deep-verify provider',
    help: 'Which AI verifier the deep-verify gate uses. `mock` is offline. (Edit verifier.model with `config set`.)',
    choices: [
      { value: 'mock', blurb: 'deterministic, offline, no real verification' },
      { value: 'anthropic', blurb: 'real verification (needs ANTHROPIC_API_KEY)' },
      { value: 'local', blurb: 'OpenAI-compatible proxy (needs CADENCE_LOCAL_API_KEY)' },
    ],
    current: (c) => c.verifier.provider,
  },
  {
    name: 'autoArchive',
    dottedKey: 'recommendations.autoArchive',
    label: 'Recommendation auto-archive',
    help: 'Auto soft-archive a rec when it goes terminal (shipped/rejected on promote; converted on settle). Recoverable via `recommendation unarchive`.',
    choices: [
      { value: 'true', blurb: 'archive terminal recs automatically (default)' },
      { value: 'false', blurb: 'keep terminal recs in the active ledger' },
    ],
    current: (c) => String(c.recommendations.autoArchive),
  },
  {
    name: 'autoRoute',
    dottedKey: 'recommendations.autoRoute',
    label: 'Findings-to-ledger auto-routing',
    help: 'Auto-route identified code-review findings into the recommendation ledger at settle time (source: review). Best-effort; never blocks settle.',
    choices: [
      { value: 'true', blurb: 'route identified findings automatically (default)' },
      { value: 'false', blurb: 'never auto-route findings into the ledger' },
    ],
    current: (c) => String(c.recommendations.autoRoute),
  },
  {
    name: 'coverageMode',
    dottedKey: 'verification.coverageMode',
    label: 'Coverage mode',
    help: 'How the test-coverage gate counts an AC-N token. `assertion` requires the token to sit inside a recognized asserting test block (js/ts, python, go, rust, php built in; extend via verification.coverageProfiles).',
    choices: [
      { value: 'mention', blurb: 'any AC-N mention in a test file counts (default)' },
      { value: 'assertion', blurb: 'AC-N must be inside a recognized asserting test block' },
    ],
    current: (c) => c.verification.coverageMode,
  },
];

/** Short aliases → canonical field name (case-insensitive lookup). */
export const FIELD_ALIASES: Record<string, string> = {
  enforcement: 'loopEnforcement',
};

/** Resolve a user-supplied target (alias + case-insensitive) to a field, or null. */
export function resolveField(input: string): EditableField | null {
  const key = input.trim().toLowerCase();
  const canonical =
    EDITABLE_FIELDS.find((f) => f.name.toLowerCase() === key)?.name ?? FIELD_ALIASES[key];
  if (canonical === undefined) return null;
  return EDITABLE_FIELDS.find((f) => f.name === canonical) ?? null;
}

/** Tiny Levenshtein distance (no new dependency; mirrors explain.ts). */
function distance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const row: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, row[j]!, row[j - 1]!) + 1;
      prev = tmp;
    }
  }
  return row[n]!;
}

/** Nearest field name to an unknown input, if reasonably close. */
export function nearestField(input: string): string | null {
  const key = input.trim().toLowerCase();
  let best: string | null = null;
  let bestD = Infinity;
  for (const f of EDITABLE_FIELDS) {
    const d = distance(key, f.name.toLowerCase());
    if (d < bestD) {
      bestD = d;
      best = f.name;
    }
  }
  return best !== null && bestD <= Math.max(2, Math.ceil(best.length / 2)) ? best : null;
}
