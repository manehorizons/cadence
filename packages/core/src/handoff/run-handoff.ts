// packages/core/src/handoff/run-handoff.ts
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteText } from '../state/atomic-write.js';
import { runContext } from '../intelligence/context.js';
import { readGitFacts } from './git-facts.js';
import { renderSession } from './render-session.js';

export interface HandoffOptions {
  label?: string;
  force?: boolean;
  noStamp?: boolean;
  noGit?: boolean;
}

export interface HandoffResult {
  path: string;
  filename: string;
  lastHandoff: string | null;
  gitAvailable: boolean;
  stamped: boolean;
}

function sanitizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, '-').replace(/[^A-Za-z0-9._-]/g, '');
}

export async function runHandoff(
  root: string,
  opts: HandoffOptions = {},
  now: Date = new Date(),
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

  return {
    path,
    filename,
    lastHandoff: stamped ? filename : null,
    gitAvailable: git.available,
    stamped,
  };
}
