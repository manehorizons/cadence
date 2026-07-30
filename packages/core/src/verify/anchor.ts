import type { AcceptanceCriterion, Task, GateProvenance, Anchor } from '@manehorizons/cadence-types';
import { parseAcRefs } from '../parse/ac-refs.js';

/**
 * Phase 235 (T2, §7.1) — what a finding claims it is about, before the
 * ladder decides how strongly that claim actually holds. The caller (a
 * future code-review/criteria-gap consumer, not this task) identifies which
 * AC or boundary string a finding is being checked against; `resolveAnchor`
 * never guesses that mapping itself — it only grades the ref it is handed
 * against the measured facts in `acceptanceCriteria` / `boundaries` /
 * `tasks` / `gateProvenance`. `'none'` is the caller's own admission that
 * nothing citable was found, which always resolves to `{ kind: 'none', tier:
 * 'undeclared' }` below.
 */
export type AnchorCandidate =
  | { kind: 'ac'; ref: string }
  | { kind: 'boundary'; ref: string }
  | { kind: 'none' };

const UNDECLARED: Anchor = { kind: 'none', tier: 'undeclared' };

/**
 * Phase 235 (T2) — the pure §7.1 anchor ladder. Dependency-injected: every
 * external fact (the DRAFT's acceptance criteria, its boundaries, its
 * tasks, and this settle's gate provenance) arrives as an argument. No I/O,
 * no fs, no clock — the house pure-core/impure-shell split
 * (`resolveInteractivity`, `detectPhaseCollision`, `planInit`).
 *
 * Ladder, strongest to weakest (checked in this order — the first condition
 * that holds wins; nothing is ever inflated past what these checks find):
 *
 *  1. `executable` — TWO conditions, both required (`dec-20260729-004`):
 *     (a) the AC is referenced by a task whose `done:` field cites it —
 *         matched with `parseAcRefs` (`parse/ac-refs.ts`), NOT string
 *         equality, because `done:` is a comma-separated list (`AC-2, AC-3`)
 *         that also tolerates trailing annotation (`AC-4 (core logic)`); an
 *         exact-equality check silently makes `executable` unreachable for
 *         every multi-AC task, which is most of them in practice — whose
 *         `verify` is non-empty after trim, treated as "a runnable command"
 *         purely by that non-emptiness check — deliberately no prose-
 *         detection or command-likeness heuristic, matching the existing
 *         repo precedent in `gates/task-verify-required.ts`
 *         (`t.verify.trim().length`); AND
 *     (b) `gateProvenance` carries a `'build-test-must-pass'` entry with
 *         `status === 'ran'` — `'skipped'`, `'refused'`, and a missing entry
 *         all fail this condition (a refused test gate corroborates
 *         nothing). This is the substantive corroboration condition (a):
 *         alone can't inflate a tier; the DRAFT is never trusted by itself.
 *     Known residual gap, called out deliberately rather than papered over:
 *     a prose-only-looking `verify` string on a phase whose suite actually
 *     ran elsewhere in the same settle can still reach `executable`, because
 *     condition (a) is a non-emptiness check, not a semantic one. Fixing
 *     that would require the prose-detection heuristic §7.1 and
 *     `dec-20260729-004` explicitly decline to add.
 *  2. `structured` — the AC exists and `given`/`when`/`then` are ALL
 *     non-empty after trim.
 *  3. `declared` — the AC exists but is not `structured` (prose-only or
 *     partially/fully empty G/W/T), OR the candidate cites a `boundaries[]`
 *     string that is actually present in `boundaries`.
 *  4. `undeclared` — the candidate's `ref` cites nothing real: an `'ac'`
 *     candidate whose id isn't in `acceptanceCriteria`, a `'boundary'`
 *     candidate whose text isn't in `boundaries`, or an explicit `'none'`
 *     candidate. Resolves to `{ kind: 'none', tier: 'undeclared' }` — never
 *     fabricates a `kind`/`ref` for a criterion that doesn't exist.
 *
 * Anchor-shopping resistance: tier is derived ONLY from the structural
 * facts above, never from how plausible or alarming an AC's prose reads.
 * A vague AC ("the API should be secure") with full G/W/T text earns
 * exactly `structured` — the same as any other structured AC — and can
 * only reach `executable` by satisfying the real two-condition check like
 * any other AC. Vagueness cannot buy a stronger anchor, and precision
 * cannot be inferred to buy a weaker one; the ladder does not read prose.
 */
export function resolveAnchor(
  candidate: AnchorCandidate,
  acceptanceCriteria: readonly AcceptanceCriterion[],
  boundaries: readonly string[],
  tasks: readonly Task[],
  gateProvenance: readonly GateProvenance[],
): Anchor {
  if (candidate.kind === 'ac') {
    const ac = acceptanceCriteria.find((a) => a.id === candidate.ref);
    if (ac === undefined) {
      return UNDECLARED;
    }

    const referencedByRunnableTask = tasks.some(
      (t) => parseAcRefs(t.done).includes(ac.id) && t.verify.trim().length > 0,
    );
    const buildTestRan = gateProvenance.some(
      (g) => g.gate === 'build-test-must-pass' && g.status === 'ran',
    );
    if (referencedByRunnableTask && buildTestRan) {
      return { kind: 'ac', ref: ac.id, tier: 'executable' };
    }

    const isStructured =
      ac.given.trim().length > 0 && ac.when.trim().length > 0 && ac.then.trim().length > 0;
    if (isStructured) {
      return { kind: 'ac', ref: ac.id, tier: 'structured' };
    }

    return { kind: 'ac', ref: ac.id, tier: 'declared' };
  }

  if (candidate.kind === 'boundary') {
    const found = boundaries.find((b) => b === candidate.ref);
    if (found === undefined) {
      return UNDECLARED;
    }
    return { kind: 'boundary', ref: found, tier: 'declared' };
  }

  return UNDECLARED;
}
