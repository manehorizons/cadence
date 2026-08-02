import type {
  DecisionAncestor,
  DecisionDescendant,
  DecisionGraph,
} from '@thomas-powers-jr/cadence-types';

function renderAncestorBullets(nodes: DecisionAncestor[], depth: number): string[] {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);
  for (const n of nodes) {
    if (n.cycle) {
      lines.push(`${indent}- ${n.decision.id} (cycle)`);
      continue;
    }
    lines.push(`${indent}- ${n.decision.id} — ${n.decision.title} (${n.decision.status})`);
    lines.push(...renderAncestorBullets(n.ancestors, depth + 1));
  }
  return lines;
}

function renderDescendantsChain(rootId: string, descendants: DecisionDescendant[]): string {
  if (descendants.length === 0) return '(none)';
  const parts: string[] = [rootId];
  for (const d of descendants) {
    if ('missingId' in d) {
      parts.push(`${d.missingId} (not found)`);
      break;
    }
    if (d.cycle) {
      parts.push(`${d.decision.id} (cycle)`);
      break;
    }
    parts.push(d.decision.id);
  }
  return parts.join(' → ');
}

export function renderDecisionGraph(graph: DecisionGraph): string {
  const { decision, ancestors, descendants } = graph;
  const lines: string[] = [];
  lines.push(`# ${decision.id} — ${decision.title} (${decision.status})`);
  lines.push('');
  lines.push('## Supersedes');
  if (ancestors.length === 0) {
    lines.push('(none)');
  } else {
    lines.push(...renderAncestorBullets(ancestors, 0));
  }
  lines.push('');
  lines.push('## Superseded by');
  lines.push(renderDescendantsChain(decision.id, descendants));
  lines.push('');
  return lines.join('\n');
}
