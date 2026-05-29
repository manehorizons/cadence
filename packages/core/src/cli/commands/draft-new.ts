import type { Command } from 'commander';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseSpecMd } from '../../parse/spec-parser.js';
import { renderDraftBody, frontmatterStatus } from '../../parse/draft-scaffold.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { atomicWriteText } from '../../state/atomic-write.js';
import { renderStateMd } from '../../render/state-md.js';
import {
  readRecommendationLedger,
  runRecommendationTransition,
} from '../../intelligence/store.js';

/** Registers `draft new <phase> <num>` on the parent `draft` command. */
export function registerDraftNew(cmd: Command): void {
  cmd
    .command('new <phase> <num>')
    .description('Scaffold a new DRAFT.md under .cadence/phases/<phase>/')
    .option('--title <t>', 'Draft title', 'Untitled')
    .option('--tier <t>', 'Tier (quick-fix | standard | complex)', 'standard')
    .option('--from-rec <recId>', 'Praxis recommendation id; on success the rec is auto-converted to this phase (Slice 34.3)')
    .action(async (phase: string, num: string, opts: { title: string; tier: string; fromRec?: string }) => {
      try {
        const cwd = process.cwd();
        const backend = new SimpleStateBackend(cwd);
        const state = await backend.readState();
        if (state.loopPosition !== 'IDLE') {
          const hint =
            state.loopPosition === 'SPEC'
              ? `Approve or discard the active spec (${state.activeSpec ?? '?'}) first (cadence spec approve …).`
              : `Settle or discard the active draft (${state.activeDraft ?? '?'}) first.`;
          process.stderr.write(
            `draft new refused: loopPosition is ${state.loopPosition}, not IDLE. ${hint}\n`,
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
              `draft new refused: recommendation ${opts.fromRec} not found\n`,
            );
            process.exitCode = 1;
            return;
          }
          if (rec.status !== 'candidate' && rec.status !== 'accepted') {
            process.stderr.write(
              `draft new refused: cannot convert recommendation in status ${rec.status}\n`,
            );
            process.exitCode = 1;
            return;
          }
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
        const specPath = join(dir, `${id}-SPEC.md`);
        let body: string;
        if (existsSync(specPath)) {
          const rawSpec = await readFile(specPath, 'utf8');
          if (frontmatterStatus(rawSpec) === 'APPROVED') {
            try {
              const spec = parseSpecMd(rawSpec);
              body = renderDraftBody(phase, id, opts.tier, opts.title, spec);
              console.log(
                `draft new: seeded objective + ${spec.acceptanceCriteria.length} AC(s) from approved SPEC ${id}`,
              );
            } catch (err) {
              process.stderr.write(
                `draft new: SPEC ${id} APPROVED but unparseable (${err instanceof Error ? err.message : String(err)}) — scaffolding empty\n`,
              );
              body = renderDraftBody(phase, id, opts.tier, opts.title);
            }
          } else {
            process.stderr.write(
              `draft new: SPEC ${id} present but not APPROVED — scaffolding empty\n`,
            );
            body = renderDraftBody(phase, id, opts.tier, opts.title);
          }
        } else {
          body = renderDraftBody(phase, id, opts.tier, opts.title);
        }
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

        // Slice 34.3 — chained convert. Phase dir now exists, so the existing
        // FK check inside runRecommendationTransition will pass. If the convert
        // fails (race with another terminal mutating the rec status), the
        // scaffold is already on disk — print a recovery hint and exit non-zero.
        if (opts.fromRec !== undefined) {
          const convertRes = await runRecommendationTransition(
            cwd,
            opts.fromRec,
            'convert',
            phase,
          );
          if (!convertRes.ok) {
            process.stderr.write(
              `draft new: scaffold succeeded but convert failed: ${convertRes.error}. ` +
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
        process.stderr.write(`draft new failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
