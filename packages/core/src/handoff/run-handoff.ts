// packages/core/src/handoff/run-handoff.ts
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteText } from '../state/atomic-write.js';
import { runContext } from '../intelligence/context.js';
import { loadConfig } from '../config/loader.js';
import { readGitFacts } from './git-facts.js';
import { renderSession } from './render-session.js';
import { pruneHandoffDir } from './retention.js';

export interface HandoffOptions {
  label?: string;
  force?: boolean;
  noStamp?: boolean;
  noGit?: boolean;
}

/** Injectable seam for the best-effort retention prune (Phase 88). */
export interface HandoffDeps {
  prune?: (dir: string, retain: number, current: string) => Promise<string[]>;
}

export interface HandoffResult {
  path: string;
  filename: string;
  lastHandoff: string | null;
  gitAvailable: boolean;
  stamped: boolean;
  /** SESSION docs pruned by retention (empty when disabled or on best-effort failure). */
  pruned: string[];
}

function sanitizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '');
}

export async function runHandoff(
  root: string,
  opts: HandoffOptions = {},
  now: Date = new Date(),
  deps: HandoffDeps = {},
): Promise<HandoffResult> {
  const date = now.toISOString().slice(0, 10);
  const label = opts.label ? sanitizeLabel(opts.label) : '';
  const filename = label ? `SESSION-${date}-${label}.md` : `SESSION-${date}.md`;
  const dir = join(root, '.cadence', 'handoff');
  const path = join(dir, filename);

  if (existsSync(path) && !opts.force) {
    throw new Error(`handoff: ${filename} already exists; pass a distinct --label or --force`);
  }

  const [packet, git] = await Promise.all([
    runContext(root, 'handoff', now),
    opts.noGit ? Promise.resolve({ available: false } as const) : readGitFacts(root),
  ]);

  const md = renderSession({
    generatedAt: now.toISOString(),
    label: label || null,
    packet,
    git,
    contextPacketPath: '.cadence/intelligence/context/handoff.json',
  });

  await mkdir(dir, { recursive: true });
  await atomicWriteText(path, md);

  let stamped = false;
  if (!opts.noStamp) {
    const backend = new SimpleStateBackend(root);
    const state = await backend.readState();
    state.session = { ...state.session, lastHandoff: filename };
    await backend.commit(state);
    stamped = true;
  }

  // Retention (Phase 88): opt-in, count-based, best-effort. Fires at write
  // time so a new doc obsoletes its predecessors; a failure here must never
  // fail the handoff, so any throw is swallowed and `pruned` stays empty.
  let pruned: string[] = [];
  try {
    const { retain } = (await loadConfig(root)).handoff;
    if (retain !== undefined) {
      const prune = deps.prune ?? pruneHandoffDir;
      pruned = await prune(dir, retain, filename);
    }
  } catch {
    /* best-effort — config unreadable or prune failed; leave pruned empty */
  }

  return {
    path,
    filename,
    lastHandoff: stamped ? filename : null,
    gitAvailable: git.available,
    stamped,
    pruned,
  };
}
