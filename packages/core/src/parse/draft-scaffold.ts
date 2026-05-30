import type { Spec } from '@manehorizons/cadence-types';

/**
 * Phase 38.1 (#1b) — pure DRAFT.md body renderer. The `spec`-absent branch is
 * a VERBATIM lift of the pre-#1b inline scaffold (was `draft.ts`'s
 * `const body = \`…\``) and MUST stay byte-identical (existing `draft new` /
 * `draft check` / draft-parser round-trips depend on the exact bytes — the
 * unit test locks this). With a `spec`, only `## Objective` and the
 * `## Acceptance Criteria` block are seeded; Tasks/Boundaries stay placeholder
 * and the title is always the caller's arg (never the SPEC title).
 */
export function renderDraftBody(
  phase: string,
  id: string,
  tier: string,
  title: string,
  spec?: Spec,
): string {
  const objective = spec ? spec.objective : '_(one sentence)_';
  const acBlock = spec
    ? spec.acceptanceCriteria
        .map(
          (ac) =>
            `### ${ac.id}: ${ac.name}\nGiven ${ac.given}\nWhen ${ac.when}\nThen ${ac.then}`,
        )
        .join('\n\n')
    : '### AC-1: _(name)_\nGiven _(precondition)_\nWhen _(action)_\nThen _(outcome)_';
  return (
    `---\nphase: ${phase}\nid: ${id}\ntier: ${tier}\nstatus: PENDING\n---\n\n` +
    `# ${id} — ${title}\n\n` +
    `## Objective\n\n${objective}\n\n` +
    `## Acceptance Criteria\n\n${acBlock}\n\n` +
    `## Tasks\n\n### T1: _(task name)_\n- files: \`path/to/file.ts\`\n- action: _(what to do)_\n- verify: _(how to verify)_\n- done: AC-1\n\n` +
    `## Boundaries\n\n- _(DO NOT change …)_\n`
  );
}

/** First-frontmatter-block `status:` value, trimmed; undefined if absent. */
export function frontmatterStatus(raw: string): string | undefined {
  const fm = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (!fm) return undefined;
  return /(^|\n)status:\s*(.+)/.exec(fm[1]!)?.[2]?.trim();
}
