import { SpecZ, type Spec } from '@manehorizons/cadence-types';
import { CadenceError } from '../errors.js';

// Helpers reproduced verbatim from draft-parser.ts (those are module-private
// there — not exported; copying is the only path, no shared refactor).

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;

function parseFrontmatter(raw: string): Record<string, string> {
  const m = FRONTMATTER_RE.exec(raw);
  if (!m) throw new CadenceError('SPEC.md missing frontmatter');
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

function parseAcceptanceCriteria(section: string): Spec['acceptanceCriteria'] {
  const out: Spec['acceptanceCriteria'] = [];
  const blocks = section.split(/\n(?=### AC-)/);
  for (const block of blocks) {
    const head = /^### (AC-\d+):\s*(.*)$/m.exec(block);
    if (!head) continue;
    const id = head[1]!;
    const name = head[2]?.trim() ?? '';
    const given = /Given\s+(.+)/.exec(block)?.[1]?.trim() ?? '';
    const when = /When\s+(.+)/.exec(block)?.[1]?.trim() ?? '';
    const then = /Then\s+(.+)/.exec(block)?.[1]?.trim() ?? '';
    out.push({ id, name, given, when, then });
  }
  return out;
}

/** Generic `- ` bullet list (identical to draft-parser's parseBoundaries). */
function parseBulletList(section: string): string[] {
  return section
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter((l) => l.length > 0);
}

export function parseSpecMd(raw: string): Spec {
  const fm = parseFrontmatter(raw);
  const body = stripFrontmatter(raw);
  const objective = extractSection(body, 'Objective').split('\n')[0] ?? '';
  const acceptanceCriteria = parseAcceptanceCriteria(extractSection(body, 'Acceptance Criteria'));
  const constraints = parseBulletList(extractSection(body, 'Constraints'));
  const openQuestions = parseBulletList(extractSection(body, 'Open Questions'));
  const spec: Spec = {
    schemaVersion: 1,
    id: fm.id ?? '',
    phase: fm.phase ?? '',
    objective,
    acceptanceCriteria,
    constraints,
    openQuestions,
    status: (fm.status as Spec['status']) ?? 'PENDING',
  };
  return SpecZ.parse(spec);
}
