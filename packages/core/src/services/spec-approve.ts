import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseSpecMd } from '../parse/spec-parser.js';
import { SimpleStateBackend } from '../state/simple.js';
import { atomicWriteText } from '../state/atomic-write.js';
import { loadConfig } from '../config/loader.js';
import { selectNotifier } from '../notify/factory.js';
import { parseUiSpecMd } from '../parse/ui-spec-parser.js';
import {
  resolveSpecReviewPort,
  resolveUiSpecReviewPort,
  type SpecApproveVerifierPorts,
} from './spec-approve-ports.js';
import { runConvergentReview } from '../verify/converge.js';
import { emitSpecReviewUnconverged } from '../notify/spec-review.js';
import { emitUiSpecReviewUnconverged } from '../notify/ui-spec-review.js';
import { assertSafePhaseSlug, derivePhaseTaskId } from '../phases/id.js';
import { formatCommandError } from './format-command-error.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence spec approve <phase> <num>` — run the convergent spec-review gate;
 * on pass mark APPROVED and leave the spec stage (SPEC→IDLE).
 */
export async function specApproveService(
  repoRoot: string,
  args: {
    phase: string;
    num: string;
    allowSpecReviewFailure?: boolean;
    allowUiSpecReviewFailure?: boolean;
  },
  io: CommandIO,
  ports: Partial<SpecApproveVerifierPorts> = {},
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

    const verifier = resolveSpecReviewPort(ports.specReview, cfg, repoRoot);
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
    const bypassed = !res.pass && args.allowSpecReviewFailure === true;

    const result = runConvergentReview({
      pass: res.pass,
      findingsCount: res.findings.length,
      provider: res.provider,
      ...(res.model ? { model: res.model } : {}),
      attemptsSoFar,
      history,
      maxAttempts,
      bypassed,
      idField: 'specId',
      idValue: id,
    });
    const nv = result.nv;
    await atomicWriteText(
      sidecarPath,
      JSON.stringify(result.sidecarJson, null, 2) + '\n',
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

    // rec-20260711-004 — ui-spec-review, only when a UI-SPEC is present.
    // Reached only when spec-review passed or was bypassed above (spec-review's
    // own reloop/escalate branches already `return`ed) — see design doc §2.
    const uiSpecPath = join(repoRoot, '.cadence', 'phases', phase, `${id}-UI-SPEC.md`);
    const uiSidecarPath = join(repoRoot, '.cadence', 'phases', phase, `${id}-UI-SPEC-REVIEW.json`);
    if (!existsSync(uiSpecPath) && existsSync(uiSidecarPath)) {
      io.err(
        `ui-spec-review: UI-SPEC-REVIEW sidecar present but UI-SPEC.md absent — ` +
          `ui-spec-review skipped (spec-review's result alone determines this approve).\n`,
      );
    } else if (existsSync(uiSpecPath)) {
      const rawUiSpec = await readFile(uiSpecPath, 'utf8');
      const uiSpec = parseUiSpecMd(rawUiSpec);
      const uiVerifier = resolveUiSpecReviewPort(ports.uiSpecReview, cfg, repoRoot);
      let uiAttemptsSoFar = 0;
      let uiHistory: unknown[] = [];
      if (existsSync(uiSidecarPath)) {
        try {
          const prior = JSON.parse(await readFile(uiSidecarPath, 'utf8'));
          if (typeof prior.attempts === 'number') uiAttemptsSoFar = prior.attempts;
          if (Array.isArray(prior.history)) uiHistory = prior.history;
        } catch {
          /* corrupt/legacy → fresh */
        }
      }

      const uiRes = await uiVerifier.verify({ uiSpec });
      const uiBypassed = !uiRes.pass && args.allowUiSpecReviewFailure === true;

      const uiResult = runConvergentReview({
        pass: uiRes.pass,
        findingsCount: uiRes.findings.length,
        provider: uiRes.provider,
        ...(uiRes.model ? { model: uiRes.model } : {}),
        attemptsSoFar: uiAttemptsSoFar,
        history: uiHistory,
        maxAttempts,
        bypassed: uiBypassed,
        idField: 'specId',
        idValue: id,
      });
      const uiNv = uiResult.nv;
      await atomicWriteText(
        uiSidecarPath,
        JSON.stringify(uiResult.sidecarJson, null, 2) + '\n',
      );

      if (!uiRes.pass) {
        for (const f of uiRes.findings) {
          io.err(`ui-spec-review: ${f.severity} — ${f.message}\n`);
          if (f.suggestedEdit) {
            io.err(`  ↳ suggested: ${f.suggestedEdit}\n`);
          }
        }

        if (args.allowUiSpecReviewFailure) {
          if (uiNv.verdict === 'escalate') {
            await emitUiSpecReviewUnconverged(selectNotifier(cfg), {
              specId: id,
              attempts: uiNv.attempt,
              maxAttempts,
              findings: uiRes.findings.length,
              provider: uiRes.provider,
              ...(uiRes.model ? { model: uiRes.model } : {}),
              bypassed: true,
            });
          }
          io.err(
            `ui-spec-review: --allow-ui-spec-review-failure set; proceeding past ` +
              `${uiRes.findings.length} finding(s).\n`,
          );
        } else if (uiNv.verdict === 'reloop') {
          io.err(
            `ui-spec-review: attempt ${uiNv.attempt}/${maxAttempts} did not pass — ` +
              `fix the UI-SPEC and re-run \`cadence spec approve\`, ` +
              `or pass --allow-ui-spec-review-failure to proceed anyway.\n`,
          );
          return { exitCode: 1 };
        } else {
          await emitUiSpecReviewUnconverged(selectNotifier(cfg), {
            specId: id,
            attempts: uiNv.attempt,
            maxAttempts,
            findings: uiRes.findings.length,
            provider: uiRes.provider,
            ...(uiRes.model ? { model: uiRes.model } : {}),
          });
          io.err(
            `spec approve refused: ui-spec-review did NOT converge after ` +
              `${maxAttempts} attempts — a human decision is required. ` +
              `Re-scope the UI-SPEC, or pass --allow-ui-spec-review-failure to proceed anyway.\n`,
          );
          return { exitCode: 1 };
        }
      }

      await atomicWriteText(uiSpecPath, rawUiSpec.replace(/^status: PENDING$/m, 'status: APPROVED'));
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
