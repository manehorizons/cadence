import { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseDraftMd } from '../../parse/draft-parser.js';
import { SimpleStateBackend } from '../../state/simple.js';
import { coherenceCheck } from '../../coherence/check.js';

export function registerDraftCommand(program: Command): void {
  const cmd = program.command('draft').description('Draft phase workflow');

  cmd
    .command('check <path>')
    .description('Coherence-check a DRAFT.md against state.json + PROJECT.md')
    .action(async (path: string) => {
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
          console.error(line);
          blocked = true;
        } else {
          console.warn(line);
        }
      }
      if (blocked) process.exit(2);
    });
}
