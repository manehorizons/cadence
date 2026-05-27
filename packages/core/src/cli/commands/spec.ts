import type { Command } from 'commander';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseSpecMd } from '../../parse/spec-parser.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { atomicWriteText } from '../../state/atomic-write.js';
import { renderStateMd } from '../../render/state-md.js';
import { loadConfig } from '../../config/loader.js';
import { selectNotifier } from '../../notify/factory.js';
import { selectSpecReviewVerifier } from '../../verify/spec-review-factory.js';
import { nextConvergence } from '../../verify/converge.js';
import { emitSpecReviewUnconverged } from '../../notify/spec-review.js';
import {
  readRecommendationLedger,
  runRecommendationTransition,
} from '../../intelligence/store.js';

/**
 * Phase 36.1 — the pre-DRAFT SPEC stage. `spec new` (IDLE→SPEC) scaffolds a
 * `<id>-SPEC.md`; the host agent/human authors it; `spec check` is a
 * read-only structural sanity; `spec approve` runs a convergent spec-review
 * gate (reusing the Phase 35.1 `nextConvergence` primitive verbatim) and on
 * pass returns to IDLE so the existing IDLE-gated `draft new` proceeds.
 */
export function registerSpecCommand(program: Command): void {
  const cmd = program.command('spec').description('Spec phase workflow (pre-DRAFT)');

  cmd
    .command('new <phase> <num>')
    .description('Scaffold a new SPEC.md under .cadence/phases/<phase>/ (IDLE→SPEC)')
    .option('--title <t>', 'Spec title', 'Untitled')
    .option('--from-rec <recId>', 'Praxis recommendation id; on success the rec is auto-converted to this phase (Slice 34.3)')
    .action(
      async (
        phase: string,
        num: string,
        opts: { title: string; fromRec?: string },
      ) => {
        try {
          const cwd = process.cwd();
          const backend = new SimpleStateBackend(cwd);
          const state = await backend.readState();
          if (state.loopPosition !== 'IDLE') {
            process.stderr.write(
              `spec new refused: loopPosition is ${state.loopPosition}, not IDLE. ` +
                `Approve/settle/discard the active unit first.\n`,
            );
            process.exitCode = 1;
            return;
          }
          // Slice 34.3 — pre-flight the rec BEFORE any fs writes so we never
          // scaffold a phase for a missing or unconvertible rec.
          if (opts.fromRec !== undefined) {
            const recLedger = await readRecommendationLedger(cwd);
            const rec = recLedger.recommendations.find((r) => r.id === opts.fromRec);
            if (!rec) {
              process.stderr.write(
                `spec new refused: recommendation ${opts.fromRec} not found\n`,
              );
              process.exitCode = 1;
              return;
            }
            if (rec.status !== 'candidate' && rec.status !== 'accepted') {
              process.stderr.write(
                `spec new refused: cannot convert recommendation in status ${rec.status}\n`,
              );
              process.exitCode = 1;
              return;
            }
          }
          const dir = join(cwd, '.cadence', 'phases', phase);
          const padded = num.padStart(2, '0');
          const id = `${phase.slice(0, 2)}-${padded}`;
          const path = join(dir, `${id}-SPEC.md`);
          if (existsSync(path)) {
            process.stderr.write(`SPEC already exists: ${path}\n`);
            process.exitCode = 2;
            return;
          }
          await mkdir(dir, { recursive: true });
          const body = `---\nphase: ${phase}\nid: ${id}\nstatus: PENDING\n---\n\n# ${id} — ${opts.title}\n\n## Objective\n\n_(one sentence)_\n\n## Acceptance Criteria\n\n### AC-1: _(name)_\nGiven _(precondition)_\nWhen _(action)_\nThen _(outcome)_\n\n## Constraints\n\n- _(constraint)_\n\n## Open Questions\n\n- _(question)_\n`;
          await writeFile(path, body);

          state.activePhase = phase;
          state.activeSpec = id;
          state.loopPosition = 'SPEC';
          await backend.writeState(state);
          await atomicWriteText(join(cwd, '.cadence', 'STATE.md'), renderStateMd(state));

          console.log(`Created ${path}`);

          // Slice 34.3 — chained convert. Phase dir now exists, so the
          // existing FK check inside runRecommendationTransition will pass.
          // If the convert fails (race with another terminal mutating the
          // rec status), the scaffold is already on disk — print a clear
          // recovery hint and exit non-zero.
          if (opts.fromRec !== undefined) {
            const convertRes = await runRecommendationTransition(
              cwd,
              opts.fromRec,
              'convert',
              phase,
            );
            if (!convertRes.ok) {
              process.stderr.write(
                `spec new: scaffold succeeded but convert failed: ${convertRes.error}. ` +
                  `Run \`cadence recommendation convert ${opts.fromRec} --to-phase ${phase}\` to retry.\n`,
              );
              process.exitCode = 1;
              return;
            }
            console.log(
              `recommendation ${opts.fromRec} → converted (to ${phase})`,
            );
          }
        } catch (err) {
          process.stderr.write(
            `spec new failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      },
    );

  cmd
    .command('check <path>')
    .description('Structural sanity-check a SPEC.md (objective + ≥1 AC)')
    .action(async (path: string) => {
      try {
        const raw = await readFile(path, 'utf8');
        const spec = parseSpecMd(raw);
        const issues: string[] = [];
        if (spec.objective.trim().length === 0) issues.push('objective is empty');
        if (spec.acceptanceCriteria.length === 0) issues.push('no acceptance criteria');
        if (issues.length === 0) {
          console.log('spec: OK');
          return;
        }
        for (const i of issues) process.stderr.write(`spec: ${i}\n`);
        process.exitCode = 2;
      } catch (err) {
        process.stderr.write(
          `spec check failed: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exitCode = 1;
      }
    });

  cmd
    .command('approve <phase> <num>')
    .description('Run the convergent spec-review gate; on pass leave the spec stage (SPEC→IDLE)')
    .option(
      '--allow-spec-review-failure',
      'proceed past a failing/unconverged spec-review instead of refusing; findings still printed',
    )
    .action(
      async (
        phase: string,
        num: string,
        opts: { allowSpecReviewFailure?: boolean },
      ) => {
        try {
          const cwd = process.cwd();
          const backend = new SimpleStateBackend(cwd);
          const state = await backend.readState();
          const padded = num.padStart(2, '0');
          const id = `${phase.slice(0, 2)}-${padded}`;
          if (state.loopPosition !== 'SPEC') {
            process.stderr.write(
              `spec approve refused: loopPosition is ${state.loopPosition}, not SPEC.\n`,
            );
            process.exitCode = 1;
            return;
          }
          const specPath = join(cwd, '.cadence', 'phases', phase, `${id}-SPEC.md`);
          if (!existsSync(specPath)) {
            process.stderr.write(`spec approve refused: ${specPath} not found.\n`);
            process.exitCode = 1;
            return;
          }
          const rawSpec = await readFile(specPath, 'utf8');
          const spec = parseSpecMd(rawSpec);
          const cfg = await loadConfig(cwd).catch(() => null);

          // Convergent spec-review — ports the Phase 35.1 plan-review block
          // verbatim (Draft→Spec). spec-review always runs at `spec approve`
          // (the spec stage is itself the opt-in; not a gate-matrix cell).
          const verifier = selectSpecReviewVerifier(cfg);
          const sidecarPath = join(
            cwd, '.cadence', 'phases', phase, `${id}-SPEC-REVIEW.json`,
          );
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
          const bypassed = !res.pass && opts.allowSpecReviewFailure === true;

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
              process.stderr.write(`spec-review: ${f.severity} — ${f.message}\n`);
              if (f.suggestedEdit) {
                process.stderr.write(`  ↳ suggested: ${f.suggestedEdit}\n`);
              }
            }

            if (opts.allowSpecReviewFailure) {
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
              process.stderr.write(
                `spec-review: --allow-spec-review-failure set; proceeding past ` +
                  `${res.findings.length} finding(s).\n`,
              );
              // fall through to APPROVED + IDLE.
            } else if (nv.verdict === 'reloop') {
              process.stderr.write(
                `spec-review: attempt ${nv.attempt}/${maxAttempts} did not pass — ` +
                  `fix the SPEC and re-run \`cadence spec approve\`, ` +
                  `or pass --allow-spec-review-failure to proceed anyway.\n`,
              );
              process.exitCode = 1;
              return;
            } else {
              await emitSpecReviewUnconverged(selectNotifier(cfg), {
                specId: id,
                attempts: nv.attempt,
                maxAttempts,
                findings: res.findings.length,
                provider: res.provider,
                ...(res.model ? { model: res.model } : {}),
              });
              process.stderr.write(
                `spec approve refused: spec-review did NOT converge after ` +
                  `${maxAttempts} attempts — a human decision is required. ` +
                  `Re-scope the spec, or pass --allow-spec-review-failure to proceed anyway.\n`,
              );
              process.exitCode = 1;
              return;
            }
          }

          // Converged (or bypassed): mark APPROVED, leave the spec stage.
          await atomicWriteText(
            specPath,
            rawSpec.replace(/^status: PENDING$/m, 'status: APPROVED'),
          );
          state.loopPosition = 'IDLE';
          state.activeSpec = null;
          await backend.writeState(state);
          await atomicWriteText(join(cwd, '.cadence', 'STATE.md'), renderStateMd(state));
          console.log(`Approved spec ${id}; loopPosition=IDLE`);
        } catch (err) {
          process.stderr.write(
            `spec approve failed: ${err instanceof Error ? err.message : String(err)}\n`,
          );
          process.exitCode = 1;
        }
      },
    );
}
