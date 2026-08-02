// packages/core/src/config-edit/apply.ts
import { CadenceConfigZ, type CadenceConfig } from '@thomas-powers-jr/cadence-types';
import type { EditableField } from './fields.js';

/** Set a nested value by path, creating intermediate objects. Lifted from config.ts. */
export function setPath(obj: Record<string, unknown>, path: string[], value: unknown): void {
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[path[path.length - 1]!] = value;
}

/** Read a nested value by path, or undefined. Lifted from config.ts. */
export function getPath(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Coerce a raw string to bool/number/JSON/string. Lifted from config.ts (unchanged). */
export function coerce(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (raw.trim() !== '' && !Number.isNaN(n) && Number.isFinite(n)) return n;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Apply a dottedKey→value answer map onto a clone of `config`. Pure. */
export function assembleConfig(config: CadenceConfig, answers: Map<string, string>): unknown {
  const draft = structuredClone(config) as Record<string, unknown>;
  for (const [dotted, value] of answers) {
    setPath(draft, dotted.split('.'), value);
  }
  return draft;
}

/** A single old→new change for the confirm summary. */
export interface ConfigChange {
  key: string;
  from: string;
  to: string;
}

/** List only the curated keys whose value changed between `oldCfg` and `candidate`. */
export function diffConfig(
  oldCfg: CadenceConfig,
  candidate: unknown,
  fields: EditableField[],
): ConfigChange[] {
  const cand = candidate as Record<string, unknown>;
  const changes: ConfigChange[] = [];
  for (const f of fields) {
    const path = f.dottedKey.split('.');
    const before = String(getPath(oldCfg as unknown as Record<string, unknown>, path));
    const after = String(getPath(cand, path));
    if (before !== after) changes.push({ key: f.dottedKey, from: before, to: after });
  }
  return changes;
}

/** Validation outcome — either the parsed config or the offending field + message. */
export type ValidationResult =
  | { ok: true; config: CadenceConfig }
  | { ok: false; field: string; message: string };

/** Validate a candidate against the schema, naming the offending field on failure. */
export function validateCandidate(candidate: unknown): ValidationResult {
  const result = CadenceConfigZ.safeParse(candidate);
  if (result.success) return { ok: true, config: result.data };
  const issue = result.error.issues[0];
  const field = issue ? issue.path.join('.') : '(unknown)';
  const message = issue ? issue.message : result.error.message;
  return { ok: false, field, message };
}
