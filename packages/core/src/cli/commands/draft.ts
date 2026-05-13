import type { Command } from 'commander';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseDraftMd } from '../../parse/draft-parser.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { coherenceCheck } from '../../coherence/check.js';
import { atomicWriteText } from '../../state/atomic-write.js';
import { renderStateMd } from '../../render/state-md.js';

export function registerDraftCommand(program: Command): void {
  const cmd = program.command('draft').description('Draft phase workflow');

  cmd
    .command('new <phase> <num>')
    .description('Scaffold a new DRAFT.md under .keel/phases/<phase>/')
    .option('--title <t>', 'Draft title', 'Untitled')
    .option('--tier <t>', 'Tier (quick-fix | standard | complex)', 'standard')
    .action(async (phase: string, num: string, opts: { title: string; tier: string }) => {
      try {
        const cwd = process.cwd();
        const dir = join(cwd, '.keel', 'phases', phase);
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
        const projectMdPath = join(cwd, '.keel', 'PROJECT.md');
        const projectMd = existsSync(projectMdPath) ? await readFile(projectMdPath, 'utf8') : '';
        const result = coherenceCheck(draft, state, projectMd);
        if (result.issues.length === 0) {
          console.log('coherence: OK');
          return;
        }
        let blocked = false;
        for (const i of result.issues) {
          const line = `[${i.severity.toUpperCase()}] ${i.code}: ${i.message}`;
          if (i.severity === 'block') {
            process.stderr.write(line + '\n');
            blocked = true;
          } else {
            process.stderr.write('[WARN] ' + line + '\n');
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
    .action(async (phase: string, num: string) => {
      try {
        const cwd = process.cwd();
        const padded = num.padStart(2, '0');
        const id = `${phase.slice(0, 2)}-${padded}`;
        const path = join(cwd, '.keel', 'phases', phase, `${id}-DRAFT.md`);
        const raw = await readFile(path, 'utf8');
        const draft = parseDraftMd(raw);
        const backend = new SimpleStateBackend(cwd);
        const state = await backend.readState();
        const projectMdPath = join(cwd, '.keel', 'PROJECT.md');
        const projectMd = existsSync(projectMdPath) ? await readFile(projectMdPath, 'utf8') : '';
        const result = coherenceCheck(draft, state, projectMd);
        const blockers = result.issues.filter((i) => i.severity === 'block');
        if (blockers.length > 0) {
          for (const b of blockers) process.stderr.write(`[BLOCK] ${b.code}: ${b.message}\n`);
          process.exitCode = 2;
          return;
        }
        state.activePhase = phase;
        state.activeDraft = id;
        state.loopPosition = 'BUILD';
        state.tier = draft.tier;
        if (!state.openDrafts.some((d) => d.id === id)) {
          state.openDrafts.push({ id, since: new Date().toISOString() });
        }
        await backend.writeState(state);
        await atomicWriteText(join(cwd, '.keel', 'STATE.md'), renderStateMd(state));
        console.log(`Approved ${id}; loopPosition=BUILD`);
      } catch (err) {
        process.stderr.write(`draft approve failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exitCode = 1;
      }
    });
}
