import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseSpecMd } from '../parse/spec-parser.js';
import { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteText } from '../state/atomic-write.js';
import { loadConfig } from '../config/loader.js';
import { selectNotifier } from '../notify/factory.js';
import { selectSpecReviewVerifier } from '../verify/spec-review-factory.js';
import { nextConvergence } from '../verify/converge.js';
import { emitSpecReviewUnconverged } from '../notify/spec-review.js';
import { assertSafePhaseSlug, derivePhaseTaskId } from '../phases/id.js';
import { formatCommandError } from './format-command-error.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence spec approve <phase> <num>` — run the convergent spec-review gate;
 * on pass mark APPROVED and leave the spec stage (SPEC→IDLE).
 */
export async function specApproveService(
  repoRoot: string,
  args: { phase: string; num: string; allowSpecReviewFailure?: boolean },
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const backend = new SimpleStateBackend(repoRoot);
    const state = await backend.readState();
    const phase = assertSafePhaseSlug(args.phase);
    const id = derivePhaseTaskId(phase, args.num);
    if (state.loopPosition !== 'SPEC') {
      io.err(`spec approve refused: loopPosition is ${state.loopPosition}, not SPEC.\n`);
      return { exitCode: 1 };
    }
    const specPath = join(repoRoot, '.cadence', 'phases', phase, `${id}-SPEC.md`);
    if (!existsSync(specPath)) {
      io.err(`spec approve refused: ${specPath} not found.\n`);
      return { exitCode: 1 };
    }
    const rawSpec = await readFile(specPath, 'utf8');
    const spec = parseSpecMd(rawSpec);
    const cfg = await loadConfig(repoRoot);

    const verifier = selectSpecReviewVerifier(cfg, { cwd: repoRoot });
    const sidecarPath = join(repoRoot, '.cadence', 'phases', phase, `${id}-SPEC-REVIEW.json`);
    let attemptsSoFar = 0;
    let history: unknown[] = [];
    if (existsSync(sidecarPath)) {
      try {
        const prior = JSON.parse(await readFile(sidecarPath, 'utf8'));
        if (typeof prior.attempts === 'number') attemptsSoFar = prior.attempts;
        if (Array.isArray(prior.history)) history = prior.history;
      } catch {
        /* corrupt/legacy → fresh */
      }
    }

    const res = await verifier.verify({ spec });
    const maxAttempts = cfg?.convergence?.maxAttempts ?? 3;
    const nv = nextConvergence(res.pass, attemptsSoFar, maxAttempts);
    const now = new Date().toISOString();
    const bypassed = !res.pass && args.allowSpecReviewFailure === true;

    history.push({
      at: now,
      pass: res.pass,
      findingsCount: res.findings.length,
      provider: res.provider,
      ...(res.model ? { model: res.model } : {}),
      verdict: nv.verdict,
      ...(bypassed ? { bypassed: true } : {}),
    });
    await atomicWriteText(
      sidecarPath,
      JSON.stringify(
        {
          specId: id,
          converged: res.pass,
          attempts: nv.verdict === 'pass' ? attemptsSoFar : nv.attempt,
          maxAttempts,
          history,
          pass: res.pass,
          provider: res.provider,
          ...(res.model ? { model: res.model } : {}),
          findings: res.findings.length,
          at: now,
        },
        null,
        2,
      ) + '\n',
    );

    if (!res.pass) {
      for (const f of res.findings) {
        io.err(`spec-review: ${f.severity} — ${f.message}\n`);
        if (f.suggestedEdit) {
          io.err(`  ↳ suggested: ${f.suggestedEdit}\n`);
        }
      }

      if (args.allowSpecReviewFailure) {
        if (nv.verdict === 'escalate') {
          await emitSpecReviewUnconverged(selectNotifier(cfg), {
            specId: id,
            attempts: nv.attempt,
            maxAttempts,
            findings: res.findings.length,
            provider: res.provider,
            ...(res.model ? { model: res.model } : {}),
            bypassed: true,
          });
        }
        io.err(
          `spec-review: --allow-spec-review-failure set; proceeding past ` +
            `${res.findings.length} finding(s).\n`,
        );
        // fall through to APPROVED + IDLE.
      } else if (nv.verdict === 'reloop') {
        io.err(
          `spec-review: attempt ${nv.attempt}/${maxAttempts} did not pass — ` +
            `fix the SPEC and re-run \`cadence spec approve\`, ` +
            `or pass --allow-spec-review-failure to proceed anyway.\n`,
        );
        return { exitCode: 1 };
      } else {
        await emitSpecReviewUnconverged(selectNotifier(cfg), {
          specId: id,
          attempts: nv.attempt,
          maxAttempts,
          findings: res.findings.length,
          provider: res.provider,
          ...(res.model ? { model: res.model } : {}),
        });
        io.err(
          `spec approve refused: spec-review did NOT converge after ` +
            `${maxAttempts} attempts — a human decision is required. ` +
            `Re-scope the spec, or pass --allow-spec-review-failure to proceed anyway.\n`,
        );
        return { exitCode: 1 };
      }
    }

    // Converged (or bypassed): mark APPROVED, leave the spec stage.
    await atomicWriteText(specPath, rawSpec.replace(/^status: PENDING$/m, 'status: APPROVED'));
    state.loopPosition = 'IDLE';
    state.activeSpec = null;
    await backend.commit(state);
    io.out(`Approved spec ${id}; loopPosition=IDLE\n`);
    return { exitCode: 0, data: { id, approved: true, converged: res.pass, bypassed } };
  } catch (err) {
    io.err(`${formatCommandError('spec approve', err)}\n`);
    return { exitCode: 1 };
  }
}
