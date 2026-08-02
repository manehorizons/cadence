import type { CadenceConfig } from '@thomas-powers-jr/cadence-types';
import type { ConfigExplanation, ProviderRow, TierGateView } from './types.js';

/**
 * One-line meanings for the three top-level posture fields. Authored here rather
 * than imported from `services/explain.ts`: that module only defines the four
 * core concepts (loop/gates/tiers/profiles) — it has nothing for
 * `loopEnforcement`/`acDiscipline`. Kept terse and aligned with the `explain`
 * profile copy.
 */
const PROFILE_MEANING: Record<string, string> = {
  strict: 'full control — every step is a checkpoint',
  standard: 'major-step gating — approve at DRAFT, verify at settle',
  auto: 'hands-off — the AI drives; anomalies surface automatically',
};
const ENFORCEMENT_MEANING: Record<string, string> = {
  strict: 'out-of-loop actions are refused',
  soft: 'out-of-loop actions are flagged but allowed',
  reminder: 'a gentle nudge only',
};
const AC_MEANING: Record<string, string> = {
  strict: 'every AC must be test-linked, always',
  'tier-scaled': 'AC rigor scales with tier (the default)',
  optional: 'ACs encouraged, never enforced',
};

/** Options controlling what {@link renderText} emits. */
export interface RenderOptions {
  /** Deep-dive a single top-level config field. */
  field?: string;
  /** Dump every config key, grouped. */
  all?: boolean;
}

/** Tiny Levenshtein distance for the did-you-mean nudge (no new dependency). */
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

/** The top-level config keys a user can target with `config explain <field>`. */
export function fieldNames(config: CadenceConfig): string[] {
  return Object.keys(config);
}

/** Whether `name` is a renderable top-level config field. */
export function isKnownField(config: CadenceConfig, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(config, name);
}

/** Nearest config field to an unknown input, if reasonably close. */
function nearestField(config: CadenceConfig, input: string): string | null {
  const key = input.trim();
  let best: string | null = null;
  let bestD = Infinity;
  for (const name of fieldNames(config)) {
    const d = distance(key, name);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best !== null && bestD <= Math.max(2, Math.ceil(best.length / 2)) ? best : null;
}

function renderTierBlock(view: TierGateView): string {
  const marker = view.current ? ' ← current' : '';
  const cap = view.softCap ? '   [soft-capped: needs --allow-auto-complex]' : '';
  return `  ${view.tier}${marker}\n    ${view.gates.join(', ')}${cap}`;
}

function renderProviderRow(row: ProviderRow): string {
  const note = row.isMock ? ' (offline — no real AI verification)' : '';
  return `  ${row.block.padEnd(16)} ${row.gate.padEnd(18)} ${row.provider}${note}`;
}

/** The curated default view — five blocks. */
function renderCurated(exp: ConfigExplanation): string {
  const lines: string[] = [];
  lines.push('CADENCE config — what it actually does\n');

  lines.push('Profile & enforcement');
  lines.push(`  profile          ${exp.profile}  —  ${PROFILE_MEANING[exp.profile] ?? ''}`);
  lines.push(
    `  loopEnforcement  ${exp.loopEnforcement}  —  ${ENFORCEMENT_MEANING[exp.loopEnforcement] ?? ''}`,
  );
  lines.push(`  acDiscipline     ${exp.acDiscipline}  —  ${AC_MEANING[exp.acDiscipline] ?? ''}`);
  lines.push('');

  lines.push(`Gates that fire, by tier (profile: ${exp.profile})`);
  for (const view of exp.tiers) lines.push(renderTierBlock(view));
  lines.push('');

  lines.push('Verifier & gate providers');
  for (const row of exp.providers) lines.push(renderProviderRow(row));
  lines.push('');

  if (exp.warnings.length > 0) {
    lines.push('Warnings');
    for (const w of exp.warnings) lines.push(`  ⚠ ${w.message}`);
    lines.push('');
  }

  lines.push(
    '`cadence config explain <field>` to drill in · `--all` for every setting · `cadence doctor` for a health check',
  );
  return lines.join('\n') + '\n';
}

/** Deep-dive a single field, or a did-you-mean nudge when unknown. */
function renderField(exp: ConfigExplanation, field: string): string {
  if (!isKnownField(exp.config, field)) {
    const guess = nearestField(exp.config, field);
    const hint = guess !== null ? `Did you mean \`${guess}\`?\n` : '';
    return `No such config field: ${field}\n${hint}`;
  }
  const value = (exp.config as Record<string, unknown>)[field];
  return `${field}\n${JSON.stringify(value, null, 2)}\n`;
}

/** Dump every config key, grouped one per block. */
function renderAll(config: CadenceConfig): string {
  const lines: string[] = ['All config fields\n'];
  for (const [key, value] of Object.entries(config)) {
    lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  return lines.join('\n') + '\n';
}

/**
 * Render a {@link ConfigExplanation} to human text. Pure over its input — the
 * CLI layer (phase 92) decides the exit code (e.g. non-zero for an unknown
 * field, via {@link isKnownField}).
 */
export function renderText(exp: ConfigExplanation, opts: RenderOptions): string {
  if (opts.field !== undefined && opts.field.trim() !== '') {
    return renderField(exp, opts.field.trim());
  }
  if (opts.all === true) return renderAll(exp.config);
  return renderCurated(exp);
}

/**
 * The structured (JSON) form of the explanation. Omits the retained source
 * `config` (that is what `cadence config get` / `--all` are for) and is
 * guaranteed JSON-safe.
 */
export function renderJson(exp: ConfigExplanation): unknown {
  return {
    profile: exp.profile,
    loopEnforcement: exp.loopEnforcement,
    acDiscipline: exp.acDiscipline,
    tiers: exp.tiers,
    providers: exp.providers,
    warnings: exp.warnings,
  };
}
