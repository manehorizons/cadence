import { UiSpecZ, type UiSpec, type UiComponent } from '@thomas-powers-jr/cadence-types';
import { CadenceError } from '../errors.js';

// Helpers reproduced verbatim from spec-parser.ts (those are module-private
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

/** Generic `- ` bullet list (identical to draft-parser's parseBoundaries). */
function parseBulletList(section: string): string[] {
  return section
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter((l) => l.length > 0);
}

/** `####`-scoped sibling of extractSection, for Layout & Tokens / Precedent
 * References nested inside one `### <Component>` block. */
function extractSubsection(block: string, heading: string): string {
  const re = new RegExp(`(^|\\n)#### ${heading}\\s*\\n([\\s\\S]*?)(?=\\n#### |\\n### |$)`);
  const m = re.exec(block);
  return m ? m[2]!.trim() : '';
}

/** Splits `## Components` into per-`### <Name>` blocks and extracts each
 * component's detail bullets plus its nested `#### Layout & Tokens` /
 * `#### Precedent References` sub-lists. */
function parseComponents(section: string): UiComponent[] {
  const out: UiComponent[] = [];
  if (section.trim().length === 0) return out;
  const blocks = section.split(/\n(?=### )/);
  for (const block of blocks) {
    const head = /^### (.+)$/m.exec(block);
    if (!head) continue;
    const name = head[1]!.trim();
    const afterHeading = block.slice(head.index! + head[0].length);
    const detailSection = (afterHeading.split(/\n#### /)[0] ?? '').trim();
    out.push({
      name,
      detail: parseBulletList(detailSection),
      layoutTokens: parseBulletList(extractSubsection(block, 'Layout & Tokens')),
      precedent: parseBulletList(extractSubsection(block, 'Precedent References')),
    });
  }
  return out;
}

export function parseUiSpecMd(raw: string): UiSpec {
  const fm = parseFrontmatter(raw);
  const body = stripFrontmatter(raw);
  return UiSpecZ.parse({
    schemaVersion: 1,
    id: fm.id ?? '',
    phase: fm.phase ?? '',
    components: parseComponents(extractSection(body, 'Components')),
    responsiveInteraction: parseBulletList(extractSection(body, 'Responsive & Interaction')),
    status: (fm.status as UiSpec['status']) ?? 'PENDING',
  });
}

/** `<id>-UI-SPEC.md` PENDING scaffold body (empty-but-valid, one placeholder
 * component — mirrors SPEC.md's own placeholder-AC scaffold convention). */
export function renderUiSpecScaffold(phase: string, id: string): string {
  return (
    `---\nphase: ${phase}\nid: ${id}\nstatus: PENDING\n---\n\n` +
    `# ${id} — UI Contract\n\n` +
    `## Components\n\n` +
    `### _(ComponentName)_\n- new or modified\n- _(freeform detail)_\n\n` +
    `#### Layout & Tokens\n- _(spacing/grouping/token-usage bullet)_\n\n` +
    `#### Precedent References\n- _(existing component/pattern to reuse, if any)_\n\n` +
    `## Responsive & Interaction\n\n- _(breakpoints, hover/focus/error/loading states)_\n`
  );
}
