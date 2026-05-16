import type { Command } from 'commander';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AnomalyEvent } from '@cadence/types';
import { parseDraftMd } from '../../parse/draft-parser.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { coherenceCheck, type CoherenceIssue } from '../../coherence/check.js';
import { atomicWriteText } from '../../state/atomic-write.js';
import { renderStateMd } from '../../render/state-md.js';
import { loadConfig } from '../../config/loader.js';
import { effectiveGateSet } from '../../gates/engine.js';
import { selectNotifier } from '../../notify/factory.js';
import {
  ScriptedPrompter,
  StdinPrompter,
  type Prompter,
} from '../../verify/prompter.js';
import { selectPlanReviewVerifier } from '../../verify/plan-review-factory.js';

/**
 * Phase 24.1 — manual approve gate prompt walker. Accepts y/yes/n/no
 * (case-insensitive); 3 retries before refuse. Mirrors the 3-retry pattern
 * from `verify/interactive.ts` askVerdict.
 */
async function askApproveVerdict(prompter: Prompter): Promise<'yes' | 'no'> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = (
      await prompter.ask('Approve and enter BUILD? [y/n]: ')
    )
      .trim()
      .toLowerCase();
    if (raw === 'y' || raw === 'yes') return 'yes';
    if (raw === 'n' || raw === 'no') return 'no';
  }
  return 'no';
}

export function registerDraftCommand(program: Command): void {
  const cmd = program.command('draft').description('Draft phase workflow');

  cmd
    .command('new <phase> <num>')
    .description('Scaffold a new DRAFT.md under .cadence/phases/<phase>/')
    .option('--title <t>', 'Draft title', 'Untitled')
    .option('--tier <t>', 'Tier (quick-fix | standard | complex)', 'standard')
    .action(async (phase: string, num: string, opts: { title: string; tier: string }) => {
      try {
        const cwd = process.cwd();
        const backend = new SimpleStateBackend(cwd);
        const state = await backend.readState();
        if (state.loopPosition !== 'IDLE') {
          process.stderr.write(
            `draft new refused: loopPosition is ${state.loopPosition}, not IDLE. ` +
              `Settle or discard the active draft (${state.activeDraft ?? '?'}) first.\n`,
          );
          process.exitCode = 1;
          return;
        }
        const dir = join(cwd, '.cadence', 'phases', phase);
        const padded = num.padStart(2, '0');
        const id = `${phase.slice(0, 2)}-${padded}`;
        const path = join(dir, `${id}-DRAFT.md`);
        if (existsSync(path)) {
          process.stderr.write(`DRAFT already exists: ${path}\n`);
          process.exitCode = 2;
          return;
        }
        await mkdir(dir, { recursive: true });
        const body = `---\nphase: ${phase}\nid: ${id}\ntier: ${opts.tier}\nstatus: PENDING\n---\n\n# ${id} — ${opts.title}\n\n## Objective\n\n_(one sentence)_\n\n## Acceptance Criteria\n\n### AC-1: _(name)_\nGiven _(precondition)_\nWhen _(action)_\nThen _(outcome)_\n\n## Tasks\n\n### T1: _(task name)_\n- files: \`path/to/file.ts\`\n- action: _(what to do)_\n- verify: _(how to verify)_\n- done: AC-1\n\n## Boundaries\n\n- _(DO NOT change …)_\n`;
        await writeFile(path, body);

        state.activePhase = phase;
        state.activeDraft = id;
        state.loopPosition = 'DRAFT';
        if (!state.openDrafts.some((d) => d.id === id)) {
          state.openDrafts.push({ id, since: new Date().toISOString() });
        }
        await backend.writeState(state);
        await atomicWriteText(join(cwd, '.cadence', 'STATE.md'), renderStateMd(state));

        console.log(`Created ${path}`);
      } catch (err) {
        process.stderr.write(`draft new failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });

  cmd
    .command('check <path>')
    .description('Coherence-check a DRAFT.md against state.json + PROJECT.md')
    .action(async (path: string) => {
      try {
        const cwd = process.cwd();
        const raw = await readFile(path, 'utf8');
        const draft = parseDraftMd(raw);
        const backend = new SimpleStateBackend(cwd);
        const state = await backend.readState();
        const projectMdPath = join(cwd, '.cadence', 'PROJECT.md');
        const projectMd = existsSync(projectMdPath) ? await readFile(projectMdPath, 'utf8') : '';
        const result = coherenceCheck(draft, state, projectMd);
        if (result.issues.length === 0) {
          console.log('coherence: OK');
          return;
        }
        let blocked = false;
        const warns: CoherenceIssue[] = [];
        for (const i of result.issues) {
          const line = `[${i.severity.toUpperCase()}] ${i.code}: ${i.message}`;
          if (i.severity === 'block') {
            process.stderr.write(line + '\n');
            blocked = true;
          } else {
            process.stderr.write('[WARN] ' + line + '\n');
            warns.push(i);
          }
        }
        // Phase 23.2 — coherence-warn anomaly emission. Fires per warn issue
        // when `'anomaly-notify'` is in the effective gate set. Block-severity
        // issues already refuse loudly above; emission is for the soft warns.
        if (warns.length > 0) {
          const cfg = await loadConfig(cwd).catch(() => null);
          const gateSet = effectiveGateSet(state, cfg, draft);
          if (gateSet.gates.includes('anomaly-notify')) {
            const now = new Date().toISOString();
            const events: AnomalyEvent[] = warns.map((w) => ({
              type: 'coherence-warn' as const,
              severity: 'warn' as const,
              message: w.message,
              context: { code: w.code, source: 'coherence.check' },
              ts: now,
            }));
            const notifier = selectNotifier(cfg);
            try {
              await notifier.notify(events);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              process.stderr.write(
                `cadence-notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
              );
            }
          }
        }
        if (blocked) process.exitCode = 2;
      } catch (err) {
        process.stderr.write(`draft check failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });

  cmd
    .command('approve <phase> <num>')
    .description('Approve a draft and enter BUILD phase')
    .option(
      '--allow-auto-complex',
      "override DESIGN.md §4 M2 soft cap: approve an auto × complex draft anyway",
    )
    .option(
      '--no-approve',
      "bypass the manual approve gate (Phase 24.1) per invocation; required for non-TTY runs when the 'approve' gate is in the effective set",
    )
    .option(
      '--allow-plan-review-failure',
      "proceed past a failing plan-review gate (Phase 25.1) instead of refusing approve; findings are still printed",
    )
    .action(
      async (
        phase: string,
        num: string,
        opts: {
          allowAutoComplex?: boolean;
          approve?: boolean;
          allowPlanReviewFailure?: boolean;
        },
      ) => {
      try {
        const cwd = process.cwd();
        const padded = num.padStart(2, '0');
        const id = `${phase.slice(0, 2)}-${padded}`;
        const path = join(cwd, '.cadence', 'phases', phase, `${id}-DRAFT.md`);
        const raw = await readFile(path, 'utf8');
        const draft = parseDraftMd(raw);
        const backend = new SimpleStateBackend(cwd);
        const state = await backend.readState();
        const projectMdPath = join(cwd, '.cadence', 'PROJECT.md');
        const projectMd = existsSync(projectMdPath) ? await readFile(projectMdPath, 'utf8') : '';
        const result = coherenceCheck(draft, state, projectMd);
        const blockers = result.issues.filter((i) => i.severity === 'block');
        if (blockers.length > 0) {
          for (const b of blockers) process.stderr.write(`[BLOCK] ${b.code}: ${b.message}\n`);
          process.exitCode = 2;
          return;
        }

        // DESIGN.md §4 M2 — soft cap on auto × complex. Refuse before
        // transitioning to BUILD so the user fixes the profile/tier choice
        // before any task work happens. Phase 21.1.
        const cfg = await loadConfig(cwd).catch(() => null);
        const gateSet = effectiveGateSet(state, cfg, draft);
        if (gateSet.softCap && !opts.allowAutoComplex) {
          process.stderr.write(
            'draft approve refused: auto × complex is soft-capped (DESIGN.md §4 M2). Pass --allow-auto-complex to override, or bump the draft\'s profile to standard/strict.\n',
          );
          process.exitCode = 1;
          return;
        }
        if (gateSet.softCap && opts.allowAutoComplex) {
          process.stderr.write(
            'draft approve: --allow-auto-complex set; proceeding past soft cap (auto × complex).\n',
          );
        }

        // Phase 24.1 — manual approve gate. Fires when `'approve'` is in the
        // effective gate set (strict-any-tier, standard×standard,
        // standard×complex). `--no-approve` (commander auto-flag for the
        // declared `--no-approve` option → opts.approve === false) bypasses.
        // Coherence blockers and soft cap already refused above so the prompt
        // only appears for otherwise-passable approvals.
        if (gateSet.gates.includes('approve') && opts.approve !== false) {
          let prompter: Prompter;
          const scripted = process.env.CADENCE_PROMPTER_SCRIPT;
          if (scripted !== undefined) {
            const answers = scripted.split('\n').filter((s) => s.length > 0 || s === '');
            prompter = new ScriptedPrompter(answers);
          } else {
            try {
              prompter = new StdinPrompter();
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              process.stderr.write(
                `manual-approve: ${msg} Pass --no-approve to bypass the manual approve gate.\n`,
              );
              process.exitCode = 1;
              return;
            }
          }
          let verdict: 'yes' | 'no';
          try {
            verdict = await askApproveVerdict(prompter);
          } finally {
            await prompter.close?.();
          }
          if (verdict === 'no') {
            process.stderr.write(
              'draft approve refused: user declined manual approve gate.\n',
            );
            process.exitCode = 1;
            return;
          }
        }

        // Phase 25.1 — plan-review gate. Fires when `'plan-review'` is in
        // the effective gate set (strict×complex). Runs against the parsed
        // DRAFT (no diff/SUMMARY at approve time). `pass=false` refuses
        // before any state mutation unless `--allow-plan-review-failure`.
        if (gateSet.gates.includes('plan-review')) {
          const verifier = selectPlanReviewVerifier(cfg);
          const res = await verifier.verify({ draft });
          // Phase 29.7 G3 — persist a plan-review record (pass OR fail) so a
          // loop run can later prove it ran / which provider / verdict.
          // No state-schema change: per-phase sidecar artifact.
          await atomicWriteText(
            join(cwd, '.cadence', 'phases', phase, `${id}-PLAN-REVIEW.json`),
            JSON.stringify(
              {
                draftId: id,
                pass: res.pass,
                provider: res.provider,
                ...(res.model ? { model: res.model } : {}),
                findings: res.findings.length,
                at: new Date().toISOString(),
              },
              null,
              2,
            ) + '\n',
          );
          if (!res.pass) {
            for (const f of res.findings) {
              process.stderr.write(
                `plan-review: ${f.severity} — ${f.message}\n`,
              );
              if (f.suggestedEdit) {
                process.stderr.write(`  ↳ suggested: ${f.suggestedEdit}\n`);
              }
            }
            if (!opts.allowPlanReviewFailure) {
              process.stderr.write(
                `draft approve refused: plan-review found ${res.findings.length} finding(s). ` +
                  `Fix the plan, or pass --allow-plan-review-failure to proceed anyway.\n`,
              );
              process.exitCode = 1;
              return;
            }
            process.stderr.write(
              `plan-review: --allow-plan-review-failure set; proceeding past ${res.findings.length} finding(s).\n`,
            );
          }
        }

        // Phase 23.2 — coherence-warn emission at approve time. Same pattern
        // as `draft check` but with `source: 'coherence.approve'`. Fires
        // before the BUILD state transition so failed dispatches don't leave
        // partial state.
        const warns = result.issues.filter((i) => i.severity === 'warn');
        if (warns.length > 0 && gateSet.gates.includes('anomaly-notify')) {
          const now = new Date().toISOString();
          const events: AnomalyEvent[] = warns.map((w) => ({
            type: 'coherence-warn' as const,
            severity: 'warn' as const,
            message: w.message,
            context: { code: w.code, source: 'coherence.approve' },
            ts: now,
          }));
          const notifier = selectNotifier(cfg);
          try {
            await notifier.notify(events);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            process.stderr.write(
              `cadence-notify: ${notifier.name} transport failed — ${msg} (continuing)\n`,
            );
          }
        }

        state.activePhase = phase;
        state.activeDraft = id;
        state.loopPosition = 'BUILD';
        state.tier = draft.tier;
        // Phase 23.1 — DRAFT-read mtime gate: stamp the approve timestamp so
        // settle can detect post-approve DRAFT edits.
        state.draftReadAt = new Date().toISOString();
        if (!state.openDrafts.some((d) => d.id === id)) {
          state.openDrafts.push({ id, since: new Date().toISOString() });
        }
        await backend.writeState(state);
        await atomicWriteText(join(cwd, '.cadence', 'STATE.md'), renderStateMd(state));
        console.log(`Approved ${id}; loopPosition=BUILD`);
      } catch (err) {
        process.stderr.write(`draft approve failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    },
  );
}
