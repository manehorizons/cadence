import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  AnomalyEvent,
  CadenceConfig,
  CadenceState,
  Draft,
  GateSet,
} from '@manehorizons/cadence-types';
import { coherenceCheck, type CoherenceResult } from '../coherence/check.js';
import { atomicWriteText } from '../state/atomic-write.js';
import { selectNotifier } from '../notify/factory.js';
import { selectPlanReviewVerifier } from '../verify/plan-review-factory.js';
import { emitPlanReviewUnconverged } from '../notify/plan-review.js';
import {
  ScriptedPrompter,
  StdinPrompter,
  type Prompter,
} from '../verify/prompter.js';
import type { DraftGateContext, DraftGateOpts } from './draft-types.js';

/**
 * Build the `DraftGateContext` the draft gates consume (Phase 39.7). The draft
 * command router owns construction; gates reach git/verifier/notifier/prompter/
 * sidecar only through the ports built here. Verifier + coherence are memoized
 * so they run at most once per command.
 */
export function buildDraftContext(args: {
  cwd: string;
  state: CadenceState;
  draft: Draft;
  config: CadenceConfig | null;
  gateSet: GateSet;
  phase: string;
  id: string;
  projectMd: string;
  opts: DraftGateOpts;
}): DraftGateContext {
  const { cwd, state, draft, config, gateSet, phase, id, projectMd, opts } = args;
  let coherenceMemo: CoherenceResult | undefined;
  let planReviewMemo: ReturnType<typeof selectPlanReviewVerifier> | undefined;
  const sidecarPath = join(cwd, '.cadence', 'phases', phase, `${id}-PLAN-REVIEW.json`);
  return {
    cwd,
    state,
    draft,
    config,
    gateSet,
    phase,
    id,
    opts,
    coherence: () => (coherenceMemo ??= coherenceCheck(draft, state, projectMd)),
    verifiers: {
      planReview: {
        verify: (input) =>
          (planReviewMemo ??= selectPlanReviewVerifier(config)).verify(input),
      },
    },
    emit: {
      coherenceWarn: (events) => notifyOrWarn(events, config),
      planReviewUnconverged: (info) =>
        emitPlanReviewUnconverged(selectNotifier(config), info),
    },
    prompter: { create: createPrompter },
    planReviewSidecar: {
      // Absent / corrupt / legacy-29.7 (no `attempts`) → {0, []}. history append-only.
      read: async () => {
        let attemptsSoFar = 0;
        let history: unknown[] = [];
        if (existsSync(sidecarPath)) {
          try {
            const prior = JSON.parse(await readFile(sidecarPath, 'utf8'));
            if (typeof prior.attempts === 'number') attemptsSoFar = prior.attempts;
            if (Array.isArray(prior.history)) history = prior.history;
          } catch {
            /* corrupt/legacy → treat as fresh (attemptsSoFar 0) */
          }
        }
        return { attemptsSoFar, history };
      },
      write: (text) => atomicWriteText(sidecarPath, text),
    },
    io: { err: (s) => process.stderr.write(s) },
  };
}

/**
 * Prompter construction policy (test seam: CADENCE_PROMPTER_SCRIPT drives the
 * walker without a real TTY; else StdinPrompter, which throws on a non-TTY — the
 * approve gate turns that throw into a refusal).
 */
function createPrompter(): Prompter {
  const scripted = process.env.CADENCE_PROMPTER_SCRIPT;
  if (scripted !== undefined) {
    return new ScriptedPrompter(
      scripted.split('\n').filter((s) => s.length > 0 || s === ''),
    );
  }
  return new StdinPrompter();
}

async function notifyOrWarn(
  events: AnomalyEvent[],
  config: CadenceConfig | null,
): Promise<void> {
  const notifier = selectNotifier(config);
  try {
    await notifier.notify(events);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `cadence-notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
    );
  }
}
