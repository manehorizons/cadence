import type {
  DecisionAncestor,
  DecisionDescendant,
  DecisionGraph,
  IntelligenceDecisionLedger,
} from '@manehorizons/cadence-types';

// Internal: transitive backward walk via inverse-supersededBy lookup.
// `seen` carries every ancestor id already on the current path so we can
// truncate (rather than infinite-loop) when persisted data contains a cycle.
function walkAncestorTree(
  ledger: IntelligenceDecisionLedger,
  currentId: string,
  seen: Set<string>,
): DecisionAncestor[] {
  const direct = ledger.decisions.filter((d) => d.supersededBy === currentId);
  const out: DecisionAncestor[] = [];
  for (const d of direct) {
    if (seen.has(d.id)) {
      out.push({ decision: d, ancestors: [], cycle: true });
      continue;
    }
    const nextSeen = new Set(seen);
    nextSeen.add(d.id);
    out.push({
      decision: d,
      ancestors: walkAncestorTree(ledger, d.id, nextSeen),
    });
  }
  return out;
}

export function buildDecisionGraph(
  ledger: IntelligenceDecisionLedger,
  id: string,
): { ok: true; graph: DecisionGraph } | { ok: false; error: string } {
  const root = ledger.decisions.find((d) => d.id === id);
  if (!root) return { ok: false, error: `decision ${id} not found` };

  // Forward (descendants): linear chain via inline walk.
  // Why not the Slice-28 `walkSupersededByChain`? That helper is shaped for
  // cycle-REFUSAL (returns `ok: false` on a forbidden id) and stops silently
  // on missing-id. Here we need to EMIT both signals to the consumer; inline
  // is honest and keeps `store.ts` byte-equal to Slice 28.
  const descendants: DecisionDescendant[] = [];
  let cursor: string | undefined = root.supersededBy;
  const seen = new Set<string>([root.id]);
  while (cursor) {
    if (seen.has(cursor)) {
      // Cycle: the next node is already on the path. The entity must exist
      // (cycles imply revisiting a real ledger entry); emit it with `cycle: true`.
      const node = ledger.decisions.find((d) => d.id === cursor);
      if (node) descendants.push({ decision: node, cycle: true });
      break;
    }
    const node = ledger.decisions.find((d) => d.id === cursor);
    if (!node) {
      descendants.push({ missingId: cursor });
      break;
    }
    descendants.push({ decision: node });
    seen.add(cursor);
    cursor = node.supersededBy;
  }

  // Backward (ancestors): transitive tree.
  const ancestors = walkAncestorTree(ledger, root.id, new Set([root.id]));

  return { ok: true, graph: { decision: root, ancestors, descendants } };
}
