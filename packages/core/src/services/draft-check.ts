import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseDraftMd } from '../parse/draft-parser.js';
import { coherenceCheck } from '../coherence/check.js';
import { SimpleStateBackend } from '../state/simple.js';
import { loadConfig } from '../config/loader.js';
import { effectiveGateSet } from '../gates/engine.js';
import { buildDraftContext } from '../gates/draft-context.js';
import { emitCoherenceWarns, printAllCoherenceIssues } from '../gates/coherence.js';
import type { CommandIO, CommandResult } from './io.js';

/**
 * `cadence draft check <path>` — coherence-check a DRAFT.md against state +
 * PROJECT.md. `path` is resolved against `repoRoot` (absolute paths pass
 * through). Exit 2 on a blocking issue, matching the CLI.
 */
export async function draftCheckService(
  repoRoot: string,
  args: { path: string },
  io: CommandIO,
): Promise<CommandResult> {
  try {
    const path = resolve(repoRoot, args.path);
    const draft = parseDraftMd(await readFile(path, 'utf8'));
    const state = await new SimpleStateBackend(repoRoot).readState();
    const projectMdPath = join(repoRoot, '.cadence', 'PROJECT.md');
    const projectMd = existsSync(projectMdPath) ? await readFile(projectMdPath, 'utf8') : '';
    const issues = coherenceCheck(draft, state, projectMd).issues;
    if (issues.length === 0) {
      io.out('coherence: OK\n');
      return { exitCode: 0, data: { ok: true, issues: [] } };
    }
    const blocked = printAllCoherenceIssues(issues, { err: (s) => io.err(s) });
    // Phase 23.2 — coherence-warn emission (gated on anomaly-notify). Block
    // issues already printed loudly above; warns still emit even when blocked.
    if (issues.some((i) => i.severity === 'warn')) {
      const cfg = await loadConfig(repoRoot);
      const ctx = buildDraftContext({
        cwd: repoRoot, state, draft, config: cfg,
        gateSet: effectiveGateSet(state, cfg, draft),
        phase: '', id: '', projectMd, opts: {},
      });
      await emitCoherenceWarns(ctx, 'coherence.check');
    }
    return { exitCode: blocked ? 2 : 0, data: { ok: !blocked, issues } };
  } catch (err) {
    io.err(`draft check failed: ${err instanceof Error ? err.message : String(err)}\n`);
    return { exitCode: 1 };
  }
}
