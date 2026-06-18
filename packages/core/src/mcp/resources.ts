import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { bufferIO } from '../services/io.js';
import { recommendService } from '../services/recommend.js';
import { assertSafePhaseSlug } from '../phases/id.js';

/**
 * MCP **Resources** (phase 75) — read-on-demand views of `.cadence/` artifacts
 * under a `cadence://` URI scheme. The host reads them as data; there are NO
 * subscriptions / notifications / file-watching (v1 YAGNI line). Readers reuse
 * the same bytes the CLI reads (and `recommendService` for the recommendations
 * payload) — no content is re-derived here.
 */

export interface StaticResourceDef {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  read(repoRoot: string): Promise<string>;
}

const readFileAt = (repoRoot: string, rel: string): Promise<string> =>
  readFile(join(repoRoot, rel), 'utf8');

/** The recommend report as the `--json` payload, via the shared service seam. */
async function readRecommendations(repoRoot: string): Promise<string> {
  const io = bufferIO();
  const result = await recommendService(repoRoot, { json: true }, io);
  if (result.exitCode !== 0) {
    throw new Error(io.stderr().trim() || 'recommend failed — run `cadence init` first');
  }
  return io.stdout().trimEnd();
}

export const STATIC_RESOURCES: StaticResourceDef[] = [
  {
    uri: 'cadence://state',
    name: 'CADENCE state (human view)',
    description: 'Derived human-readable loop state (.cadence/STATE.md).',
    mimeType: 'text/markdown',
    read: (r) => readFileAt(r, '.cadence/STATE.md'),
  },
  {
    uri: 'cadence://state.json',
    name: 'CADENCE state (machine)',
    description: 'Machine-readable loop state (.cadence/state.json).',
    mimeType: 'application/json',
    read: (r) => readFileAt(r, '.cadence/state.json'),
  },
  {
    uri: 'cadence://roadmap',
    name: 'Roadmap',
    description: 'Project roadmap (.cadence/ROADMAP.md).',
    mimeType: 'text/markdown',
    read: (r) => readFileAt(r, '.cadence/ROADMAP.md'),
  },
  {
    uri: 'cadence://project',
    name: 'Project brief',
    description: 'Project brief (.cadence/PROJECT.md).',
    mimeType: 'text/markdown',
    read: (r) => readFileAt(r, '.cadence/PROJECT.md'),
  },
  {
    uri: 'cadence://recommendations',
    name: 'Recommendations',
    description: 'Ranked strategic recommendations (the `cadence recommend --json` payload).',
    mimeType: 'application/json',
    read: readRecommendations,
  },
];

/** The static resource URIs this server advertises (handy for tests/AC-1). */
export const RESOURCE_URIS: readonly string[] = STATIC_RESOURCES.map((r) => r.uri);

type PhaseArtifactKind = 'draft' | 'summary';

interface PhaseTemplateDef {
  uriTemplate: string;
  name: string;
  description: string;
  mimeType: string;
  kind: PhaseArtifactKind;
}

const ARTIFACT_SUFFIX: Record<PhaseArtifactKind, string> = {
  draft: '-DRAFT.md',
  summary: '-SUMMARY.md',
};

export const PHASE_TEMPLATES: readonly PhaseTemplateDef[] = [
  {
    uriTemplate: 'cadence://phase/{phase}/draft',
    name: 'Phase DRAFT',
    description: "A phase's DRAFT.md (cadence://phase/<phase>/draft).",
    mimeType: 'text/markdown',
    kind: 'draft',
  },
  {
    uriTemplate: 'cadence://phase/{phase}/summary',
    name: 'Phase SUMMARY',
    description: "A phase's SUMMARY.md (cadence://phase/<phase>/summary).",
    mimeType: 'text/markdown',
    kind: 'summary',
  },
];

/** Resolve a phase's DRAFT/SUMMARY artifact, throwing a clear error if absent. */
async function readPhaseArtifact(
  repoRoot: string,
  phase: string,
  kind: PhaseArtifactKind,
): Promise<string> {
  const safePhase = assertSafePhaseSlug(phase);
  const dir = join(repoRoot, '.cadence/phases', safePhase);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    throw new Error(`phase not found: ${safePhase} (no .cadence/phases/${safePhase})`);
  }
  const suffix = ARTIFACT_SUFFIX[kind];
  const match = entries
    .filter((e) => e.endsWith(suffix))
    .sort()
    .at(-1);
  if (!match) {
    throw new Error(`no ${kind} artifact for phase ${safePhase} (looked for *${suffix})`);
  }
  return readFile(join(dir, match), 'utf8');
}

/**
 * Register the static + templated `cadence://` resources on an MCP server.
 * A read error surfaces as an MCP error response (the SDK serializes the thrown
 * message); the server keeps serving subsequent requests.
 */
export function registerResources(server: McpServer, repoRoot: string): void {
  for (const def of STATIC_RESOURCES) {
    server.registerResource(
      def.name,
      def.uri,
      { description: def.description, mimeType: def.mimeType },
      async (uri): Promise<ReadResourceResult> => ({
        contents: [{ uri: uri.href, mimeType: def.mimeType, text: await def.read(repoRoot) }],
      }),
    );
  }

  for (const t of PHASE_TEMPLATES) {
    server.registerResource(
      t.name,
      new ResourceTemplate(t.uriTemplate, { list: undefined }),
      { description: t.description, mimeType: t.mimeType },
      async (uri, variables): Promise<ReadResourceResult> => {
        const phase = String(variables.phase);
        const text = await readPhaseArtifact(repoRoot, phase, t.kind);
        return { contents: [{ uri: uri.href, mimeType: t.mimeType, text }] };
      },
    );
  }
}
