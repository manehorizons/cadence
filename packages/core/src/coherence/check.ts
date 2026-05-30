import type { Draft, CadenceState } from '@manehorizons/cadence-types';

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
  return { issues };
}
