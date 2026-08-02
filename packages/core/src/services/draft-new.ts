import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseSpecMd } from '../parse/spec-parser.js';
import { parseUiSpecMd } from '../parse/ui-spec-parser.js';
import { renderDraftBody, frontmatterStatus } from '../parse/draft-scaffold.js';
import {
  isDraftTemplateName,
  renderDraftTemplateBody,
  supportedDraftTemplates,
} from '../parse/draft-templates.js';
import { SimpleStateBackend } from '../state/simple.js';
import { readRecommendationLedger } from '../intelligence/store/io.js';
import { runRecommendationTransition } from '../intelligence/store/recommendations.js';
import { loadConfig } from '../config/loader.js';
import { phaseNumber } from '../phases/collision.js';
import { assertNoPhaseCollision } from '../phases/guard.js';
import { assertSafePhaseSlug, derivePhaseSlug, derivePhaseTaskId } from '../phases/id.js';
import { resolveNextFreePhase } from '../phases/next-free.js';
import { formatCommandError } from './format-command-error.js';
import type { CommandIO, CommandResult } from './io.js';
import type { UiSpec } from '@thomas-powers-jr/cadence-types';

/**
 * `cadence draft new <phase> <num>` — scaffold a DRAFT.md (IDLE→DRAFT) and,
 * with `fromRec`, chain-convert the recommendation. Faithful extraction of the
 * former CLI action body.
 */
export async function draftNewService(
  repoRoot: string,
  args: {
    phase?: string;
    num?: string;
    title?: string;
    tier?: string;
    template?: string;
    fromRec?: string;
    allowPhaseCollision?: boolean;
  },
  io: CommandIO,
): Promise<CommandResult> {
  const title = args.title ?? 'Untitled';
  const tier = args.tier ?? 'standard';
  try {
    if (args.template !== undefined && !isDraftTemplateName(args.template)) {
      io.err(
        `draft new refused: unknown template "${args.template}". ` +
          `Supported templates: ${supportedDraftTemplates()}\n`,
      );
      return { exitCode: 1 };
    }
    const backend = new SimpleStateBackend(repoRoot);
    const state = await backend.readState();
    if (state.loopPosition !== 'IDLE') {
      const hint =
        state.loopPosition === 'SPEC'
          ? `Approve or discard the active spec (${state.activeSpec ?? '?'}) first (cadence spec approve …).`
          : `Settle or discard the active draft (${state.activeDraft ?? '?'}) first.`;
      io.err(`draft new refused: loopPosition is ${state.loopPosition}, not IDLE. ${hint}\n`);
      return { exitCode: 1 };
    }
    // Slice 34.3 — pre-flight the rec BEFORE any fs writes so we never
    // scaffold a phase for a missing or unconvertible rec.
    if (args.fromRec !== undefined) {
      const recLedger = await readRecommendationLedger(repoRoot);
      const rec = recLedger.recommendations.find((r) => r.id === args.fromRec);
      if (!rec) {
        io.err(`draft new refused: recommendation ${args.fromRec} not found\n`);
        return { exitCode: 1 };
      }
      if (rec.status !== 'candidate' && rec.status !== 'accepted') {
        io.err(`draft new refused: cannot convert recommendation in status ${rec.status}\n`);
        return { exitCode: 1 };
      }
    }
    const phaseArg = args.phase ?? derivePhaseSlug((await resolveNextFreePhase(repoRoot)) ?? 1, title);
    const numArg = args.num ?? '1';
    const phase = assertSafePhaseSlug(phaseArg);
    const dir = join(repoRoot, '.cadence', 'phases', phase);
    const id = derivePhaseTaskId(phase, numArg);
    const path = join(dir, `${id}-DRAFT.md`);
    if (existsSync(path)) {
      io.err(`DRAFT already exists: ${path}\n`);
      return { exitCode: 2 };
    }
    // Phase 83: worktree-collision guard (see spec-new.ts). Additive to the
    // local `existsSync` refusal; `--allow-phase-collision` bypasses only this.
    const config = await loadConfig(repoRoot).catch(() => undefined);
    if (config) {
      const verdict = await assertNoPhaseCollision(repoRoot, phaseNumber(phase), {
        config,
        // Local excluded from scaffold-time matching (see spec-new.ts): the
        // normal spec→draft progression reuses the same local phase dir, which
        // is self, not a collision. Authority = sibling worktrees + upstream.
        excludeSources: ['local'],
        ...(args.allowPhaseCollision !== undefined ? { allow: args.allowPhaseCollision } : {}),
      });
      if (!verdict.ok) {
        io.err(verdict.message);
        return { exitCode: 1 };
      }
    }
    await mkdir(dir, { recursive: true });
    const specPath = join(dir, `${id}-SPEC.md`);
    const uiSpecPath = join(dir, `${id}-UI-SPEC.md`);

    async function loadApprovedUiSpec(): Promise<UiSpec | undefined> {
      if (!existsSync(uiSpecPath)) return undefined;
      const rawUiSpec = await readFile(uiSpecPath, 'utf8');
      if (frontmatterStatus(rawUiSpec) !== 'APPROVED') {
        io.err(`draft new: UI-SPEC ${id} present but not APPROVED — skipping UI Contract seed\n`);
        return undefined;
      }
      try {
        return parseUiSpecMd(rawUiSpec);
      } catch (err) {
        io.err(
          `draft new: UI-SPEC ${id} APPROVED but unparseable (${err instanceof Error ? err.message : String(err)}) — skipping UI Contract seed\n`,
        );
        return undefined;
      }
    }

    let body: string;
    if (args.template !== undefined) {
      body = renderDraftTemplateBody(args.template, phase, id, tier, title);
    } else if (existsSync(specPath)) {
      const rawSpec = await readFile(specPath, 'utf8');
      if (frontmatterStatus(rawSpec) === 'APPROVED') {
        try {
          const spec = parseSpecMd(rawSpec);
          const uiSpec = await loadApprovedUiSpec();
          body = renderDraftBody(phase, id, tier, title, spec, uiSpec);
          const uiNote = uiSpec ? ' + UI Contract' : '';
          io.out(`draft new: seeded objective + ${spec.acceptanceCriteria.length} AC(s)${uiNote} from approved SPEC ${id}\n`);
        } catch (err) {
          io.err(`draft new: SPEC ${id} APPROVED but unparseable (${err instanceof Error ? err.message : String(err)}) — scaffolding empty\n`);
          body = renderDraftBody(phase, id, tier, title);
        }
      } else {
        io.err(`draft new: SPEC ${id} present but not APPROVED — scaffolding empty\n`);
        body = renderDraftBody(phase, id, tier, title);
      }
    } else {
      body = renderDraftBody(phase, id, tier, title);
    }
    await writeFile(path, body);

    state.activePhase = phase;
    state.activeDraft = id;
    state.loopPosition = 'DRAFT';
    if (!state.openDrafts.some((d) => d.id === id)) {
      state.openDrafts.push({ id, since: new Date().toISOString() });
    }
    await backend.commit(state);

    io.out(`Created ${path}\n`);

    if (args.fromRec !== undefined) {
      const convertRes = await runRecommendationTransition(repoRoot, args.fromRec, 'convert', phase);
      if (!convertRes.ok) {
        io.err(
          `draft new: scaffold succeeded but convert failed: ${convertRes.error}. ` +
            `Run \`cadence recommendation convert ${args.fromRec} --to-phase ${phase}\` to retry.\n`,
        );
        return { exitCode: 1, data: { path, id, converted: false } };
      }
      io.out(`recommendation ${args.fromRec} → converted (to ${phase})\n`);
    }
    return { exitCode: 0, data: { path, id, converted: args.fromRec !== undefined } };
  } catch (err) {
    io.err(`${formatCommandError('draft new', err)}\n`);
    return { exitCode: 1 };
  }
}
