import { isAbsolute, relative } from 'node:path';
import type { AnomalyEvent } from '@thomas-powers-jr/cadence-types';
import { toMatcher } from '../util/glob.js';

/** The single line both emission points use for a stray file. */
export const boundaryMessage = (file: string): string =>
  `${file} touched but not declared in any task's files:`;

export interface BoundaryCheckInput {
  /** The allow-set: every file declared across all task `files:` lists. */
  declaredFiles: Iterable<string>;
  /**
   * Candidate files to test against the boundary. Iterated as-given — the
   * caller owns dedup/order: the PreToolEdit hook passes raw `ctx.raw.files`
   * (keeps order + dups); settle passes a deduped `Set` of touched files.
   */
  touchedFiles: Iterable<string>;
  /**
   * Stamps each event's `ts`. The hook precomputes one ISO string and returns
   * it for every event; settle stamps per-event from its injectable clock.
   */
  stamp: () => string;
  /**
   * Merged into each event's `context` AFTER the `file` key (e.g. the hook's
   * `{ source: 'hook.preToolEdit' }`; settle supplies none).
   */
  extraContext?: Record<string, unknown>;
  /**
   * Phase 47 — repo root for path normalization. When set, declared + touched
   * paths are relativized to this root (and `\\`→`/`) before the boundary
   * comparison, so an ABSOLUTE touched path (recorded by the PreToolUse hook)
   * matches a RELATIVE DRAFT `files:` declaration. Comparison-only: the
   * ORIGINAL touched path is still what gets emitted. Omit to keep exact-string
   * matching (back-compat — settle/hook supply it; unit callers may not).
   */
  root?: string;
  /**
   * Severity stamped on every emitted event. Defaults to `'warn'` (unchanged
   * historical behavior). Phase 155's `block`-mode caller passes `'error'` so
   * `handlePreToolEdit` can distinguish "found a violation" from "should
   * refuse the edit" without adding a second detection code path.
   */
  severity?: AnomalyEvent['severity'];
}

/**
 * Phase 43.1 — the single home for files-outside-boundary detection. One rule
 * ("a touched file not in the union of task `files:` is an outsider"), two
 * emission points: the PreToolEdit hook (`hooks/handlers.ts`) and settle's
 * `collectAnomalies` (`notify/collect.ts`). Pure — no I/O. Each outsider yields
 * one `warn` `files-outside-boundary` event; emission (gate membership, notify,
 * stderr-degrade) stays at each call site. NOT a `Gate` enum member — it is a
 * hook-time + settle-time anomaly check, so it lives in `checks/` alongside
 * skill-audit (39.6), OUTSIDE the Phase 44.1 registry.
 */
export function runBoundaryCheck(input: BoundaryCheckInput): AnomalyEvent[] {
  const { root, severity = 'warn' } = input;
  // Normalize for COMPARISON only — relativize absolute paths to `root`, unify
  // separators. The original (untransformed) path is what the event carries.
  const norm = (p: string): string => {
    const rel = root && isAbsolute(p) ? relative(root, p) : p;
    return rel.split('\\').join('/');
  };
  const declaredNorm = [...input.declaredFiles].map(norm);
  // Phase 286-01 (dec-20260821-001, D-Y) — split declared entries by shape.
  // Literal (no `*`) entries keep the ORIGINAL exact `Set.has` fast path,
  // untouched — this is what makes AC-2's byte-identical bar hold by
  // construction, not by after-the-fact proof. Only entries containing `*`
  // are compiled to a matcher and additionally tested per touched file.
  const literalDeclared = new Set(declaredNorm.filter((d) => !d.includes('*')));
  const wildcardMatchers = declaredNorm
    .filter((d) => d.includes('*'))
    .map((pattern) => toMatcher(pattern));
  const events: AnomalyEvent[] = [];
  for (const file of input.touchedFiles) {
    const normFile = norm(file);
    if (literalDeclared.has(normFile)) continue;
    if (wildcardMatchers.some((m) => m(normFile))) continue;
    events.push({
      type: 'files-outside-boundary',
      severity,
      message: boundaryMessage(file),
      context: { file, ...input.extraContext },
      ts: input.stamp(),
    });
  }
  return events;
}

/**
 * Phase 286-01 (dec-20260821-001, D-Y) — a SEPARATE, additive detection pass:
 * a declared `files:` entry containing `*` that matches ZERO touched files
 * gets a `boundary-pattern-unmatched` advisory. Deliberately NOT merged into
 * `runBoundaryCheck`'s own `AnomalyEvent[]` return (that array feeds
 * `blockRefusal` at multiple call sites) and deliberately has NO `severity`
 * parameter in its signature at all — severity is hardcoded to `'warn'`
 * below, so there is no code path by which a caller can escalate this
 * anomaly into a block-mode refusal. Per the decision, the ONLY call site
 * that should invoke this is `services/build-task.ts`, as an advisory
 * stderr notice; the other three `runBoundaryCheck` call sites
 * (`hooks/handlers.ts`, `gates/boundary-scan.ts`, `notify/collect.ts`) must
 * not call this function.
 *
 * A LITERAL declared entry matching zero touched files produces nothing
 * here — detection is scoped to wildcard-containing entries only (a task
 * declaring 3 files and touching 2 of them is the common case and must stay
 * silent).
 *
 * `message` includes the literal anomaly type name (`boundary-pattern-
 * unmatched`) as well as the offending pattern text. `services/build-task.ts`
 * prints it directly via `io.err` rather than routing through the shared
 * anomaly renderer (`notify/stderr.ts`, which prints `cadence anomaly
 * [severity] type: message`) — since `message` already embeds the type
 * name, a future caller reusing that renderer for this event should print
 * the bare `message` rather than also passing `event.type`, or the type
 * name will double up in the printed line.
 */
export function findUnmatchedBoundaryPatterns(
  input: Omit<BoundaryCheckInput, 'severity'>,
): AnomalyEvent[] {
  const { root } = input;
  const norm = (p: string): string => {
    const rel = root && isAbsolute(p) ? relative(root, p) : p;
    return rel.split('\\').join('/');
  };
  const touchedNorm = [...input.touchedFiles].map(norm);
  const declaredNorm = [...input.declaredFiles].map(norm);
  const wildcardPatterns = declaredNorm.filter((d) => d.includes('*'));
  const events: AnomalyEvent[] = [];
  for (const pattern of wildcardPatterns) {
    const matcher = toMatcher(pattern);
    if (touchedNorm.some((f) => matcher(f))) continue;
    events.push({
      type: 'boundary-pattern-unmatched',
      // HARDCODED — never accept a `severity` parameter here (dec-20260821-001
      // / D-Y): this anomaly must be structurally unable to reach block mode.
      severity: 'warn',
      message: `boundary-pattern-unmatched: declared pattern '${pattern}' matched no touched files`,
      context: { pattern, ...input.extraContext },
      ts: input.stamp(),
    });
  }
  return events;
}
