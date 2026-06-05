// packages/core/src/handoff/run-resume.ts
import type { ResumeResult } from '@manehorizons/cadence-types';
import { SimpleStateBackend } from '../state/simple.js';
import { runContext } from '../intelligence/context.js';
import { locateFreshestHandoff } from './locate.js';
import { extractBriefSections } from './brief.js';

export interface ResumeOptions {
  /** Force output mode. Omitted → drift decides: drift → 'full', else 'brief'. */
  mode?: 'brief' | 'full';
}

export async function runResume(
  root: string,
  opts: ResumeOptions = {},
  now: Date = new Date(),
): Promise<ResumeResult> {
  let lastHandoff: string | null = null;
  let liveLoopPosition: string | null = null;
  try {
    const state = await new SimpleStateBackend(root).readState();
    lastHandoff = state.session.lastHandoff;
    liveLoopPosition = state.loopPosition;
  } catch {
    // no/corrupt state — fall back to globbing, no drift comparison
  }

  const located = await locateFreshestHandoff(root, lastHandoff);
  if (!located) return { found: false };

  const drift =
    located.loopPosition && liveLoopPosition && located.loopPosition !== liveLoopPosition
      ? { docLoopPosition: located.loopPosition, liveLoopPosition }
      : null;

  const mode = opts.mode ?? (drift ? 'full' : 'brief');

  if (mode === 'full') {
    const context = await runContext(root, 'handoff', now);
    return {
      found: true,
      handoffPath: located.path,
      generatedAt: located.generatedAt,
      doc: located.content,
      context,
      drift,
      mode,
    };
  }

  // brief: skip the live-context recompute entirely — the doc is authoritative
  return {
    found: true,
    handoffPath: located.path,
    generatedAt: located.generatedAt,
    doc: extractBriefSections(located.content),
    context: null,
    drift,
    mode,
  };
}
