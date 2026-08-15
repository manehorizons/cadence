import type { Draft, CadenceState } from '@thomas-powers-jr/cadence-types';
import { heuristicTaskClass } from '../dispatch/policy.js';

export interface CoherenceIssue {
  severity: 'warn' | 'block';
  code: string;
  message: string;
}

export interface CoherenceResult {
  issues: CoherenceIssue[];
}

const DO_NOT_RE = /DO NOT\s+(?:edit|change|modify|touch)\s+`?([^\s`\n]+?)(?:`|\.(?:\s|$)|$)/gi;

export function coherenceCheck(draft: Draft, state: CadenceState, projectMd: string): CoherenceResult {
  const issues: CoherenceIssue[] = [];
  const touched = new Set(draft.tasks.flatMap((t) => t.files));

  for (const d of state.decisions) {
    for (const f of touched) {
      if (d.title.includes(f)) {
        issues.push({
          severity: 'warn',
          code: 'DECISION_TOUCH',
          message: `Draft touches ${f} which is the subject of decision ${d.id}: "${d.title}". Review before approving.`,
        });
      }
    }
  }

  const forbidden = new Set<string>();
  let m: RegExpExecArray | null;
  DO_NOT_RE.lastIndex = 0;
  while ((m = DO_NOT_RE.exec(projectMd)) !== null) {
    if (m[1]) forbidden.add(m[1]);
  }
  for (const f of touched) {
    if (forbidden.has(f)) {
      issues.push({
        severity: 'block',
        code: 'PROJECT_FORBIDDEN',
        message: `Draft touches ${f} which PROJECT.md marks DO NOT edit.`,
      });
    }
  }

  // First real wiring of the declared-vs-heuristic warn pattern into
  // coherence/check.ts (D-DQ1, dec-20260815-001). This is NOT a
  // continuation of classify/tier.ts's classifyTier — that module
  // implements a similarly-shaped idea but was never wired into this
  // check, and remains explicitly out of scope for this phase.
  for (const t of draft.tasks) {
    if (t.class === undefined) continue;
    const heuristic = heuristicTaskClass(t);
    if (heuristic !== t.class) {
      issues.push({
        severity: 'warn',
        code: 'CLASS_MISMATCH',
        message: `Task ${t.id} declares class: ${t.class} but the heuristic classifies it as ${heuristic} (files=${t.files.length}, depends=${t.depends?.length ?? 0}); declared value wins.`,
      });
    }
  }

  return { issues };
}
