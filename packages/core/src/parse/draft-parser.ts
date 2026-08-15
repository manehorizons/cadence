import { DraftZ, type Draft, type Task } from '@thomas-powers-jr/cadence-types';
import { CadenceError } from '../errors.js';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;

function parseFrontmatter(raw: string): Record<string, string> {
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) throw new CadenceError('DRAFT.md missing frontmatter');
  const out: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const [k, ...rest] = line.split(':');
    if (k && rest.length > 0) out[k.trim()] = rest.join(':').trim();
  }
  return out;
}

function stripFrontmatter(raw: string): string {
  return raw.replace(FRONTMATTER_RE, '');
}

function extractSection(body: string, heading: string): string {
  const re = new RegExp(`(^|\\n)## ${heading}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`);
  const m = re.exec(body);
  return m ? m[2]!.trim() : '';
}

function parseAcceptanceCriteria(section: string): Draft['acceptanceCriteria'] {
  const out: Draft['acceptanceCriteria'] = [];
  const blocks = section.split(/\n(?=### AC-)/);
  for (const block of blocks) {
    // [ \t]* (not \s*) — a name-less heading (`### AC-2:` / `### AC-2: `)
    // must not let the separator swallow the newline into the next line's
    // Given/When/Then content (phase 151 draft-mutate round-trip fix).
    const head = /^### (AC-\d+):[ \t]*(.*)$/m.exec(block);
    if (!head) continue;
    const id = head[1]!;
    const name = head[2]?.trim() ?? '';
    // Phase 157: [\s\S]+? (not .+) so a wrapped clause spanning more than one
    // line is captured in full, stopping at the next field label (or end of
    // block) rather than at the first newline (rec-20260704-002).
    const given = /Given\s+([\s\S]+?)(?=\nWhen\s|\nThen\s|$)/.exec(block)?.[1]?.trim() ?? '';
    const when = /When\s+([\s\S]+?)(?=\nThen\s|$)/.exec(block)?.[1]?.trim() ?? '';
    const then = /Then\s+([\s\S]+)/.exec(block)?.[1]?.trim() ?? '';
    out.push({ id, name, given, when, then });
  }
  return out;
}

function parseTasks(section: string): Draft['tasks'] {
  const out: Draft['tasks'] = [];
  const blocks = section.split(/\n(?=### )/);
  for (const block of blocks) {
    // [ \t]* (not \s*) — same name-less-heading fix as parseAcceptanceCriteria.
    const head = /^### (T\d+):[ \t]*(.*)$/m.exec(block);
    if (!head) continue;
    const id = head[1]!;
    const name = head[2]!.trim();
    const filesLine = /-\s*files:\s*(.+)/.exec(block)?.[1] ?? '';
    const files = [...filesLine.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);
    const action = /-\s*action:\s*(.+)/.exec(block)?.[1]?.trim() ?? '';
    const verify = /-\s*verify:\s*(.+)/.exec(block)?.[1]?.trim() ?? '';
    const done = /-\s*done:\s*(.+)/.exec(block)?.[1]?.trim() ?? '';
    const dependsLine = /-\s*depends:\s*(.+)/.exec(block)?.[1];
    const depends = dependsLine
      ? dependsLine.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      : undefined;
    const classLine = /-\s*class:\s*(.+)/.exec(block)?.[1]?.trim();
    const stop = /-\s*stop:\s*(.+)/.exec(block)?.[1]?.trim();
    out.push({
      id,
      name,
      files,
      action,
      verify,
      done,
      ...(depends ? { depends } : {}),
      ...(classLine ? { class: classLine as Task['class'] } : {}),
      ...(stop ? { stop } : {}),
    });
  }
  return out;
}

function parseBoundaries(section: string): string[] {
  return section
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter((l) => l.length > 0);
}

/** `requiredSkills: a, b` or `["a", , b]` → ['a','b'] (bracket/quote tolerant). */
function parseSkillList(v: string): string[] {
  return v
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((s) => s.replace(/['"]/g, '').trim())
    .filter((s) => s.length > 0);
}

export function parseDraftMd(raw: string): Draft {
  const fm = parseFrontmatter(raw);
  const body = stripFrontmatter(raw);
  const titleMatch = /^#\s+\S+\s+—\s+(.+)$/m.exec(body);
  const title = titleMatch ? titleMatch[1]!.trim() : (fm.id ?? 'untitled');
  // Phase 157: the full section text, not just its first line — extractSection
  // already isolates content up to the next `## ` heading (rec-20260704-002).
  const objective = extractSection(body, 'Objective');
  const acceptanceCriteria = parseAcceptanceCriteria(extractSection(body, 'Acceptance Criteria'));
  const tasks = parseTasks(extractSection(body, 'Tasks'));
  const boundaries = parseBoundaries(extractSection(body, 'Boundaries'));

  const draft: Draft = {
    schemaVersion: 1,
    id: fm.id ?? '',
    phase: fm.phase ?? '',
    tier: (fm.tier as Draft['tier']) ?? 'standard',
    title,
    objective,
    acceptanceCriteria,
    tasks,
    boundaries,
    status: (fm.status as Draft['status']) ?? 'PENDING',
    ...(fm.profile !== undefined ? { profile: fm.profile as Draft['profile'] } : {}),
    ...(fm.boundaryEnforcement !== undefined
      ? { boundaryEnforcement: fm.boundaryEnforcement as Draft['boundaryEnforcement'] }
      : {}),
    ...(fm.redundantWorkEnforcement !== undefined
      ? { redundantWorkEnforcement: fm.redundantWorkEnforcement as Draft['redundantWorkEnforcement'] }
      : {}),
    ...(fm.requiredSkills !== undefined
      ? { requiredSkills: parseSkillList(fm.requiredSkills) }
      : {}),
  };
  return DraftZ.parse(draft);
}
