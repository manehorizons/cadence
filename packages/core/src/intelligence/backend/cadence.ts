import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BackendStatus,
  IntelligenceMilestone,
  Recommendation,
} from '@cadence/types';
import { SimpleStateBackend } from '../../state/simple.js';
import { nextAction } from '../../progress.js';

export type BackendDetection = { present: boolean; kind: 'cadence' | null };
export type BackendArtifacts = {
  phaseCount: number;
  roadmap: boolean;
  state: boolean;
  milestones: boolean;
};

export interface PraxisBackend {
  id: string;
  detect(root: string): Promise<BackendDetection>;
  readStatus(root: string): Promise<BackendStatus>;
  readArtifacts(root: string): Promise<BackendArtifacts>;
  listLegalActions(root: string): Promise<string[]>;
  renderSpecDraft(
    milestone: IntelligenceMilestone,
    recs: ReadonlyArray<Pick<Recommendation, 'id' | 'title'>>,
  ): string;
}

function cadenceDir(root: string): string {
  return join(root, '.cadence');
}

export const cadenceBackend: PraxisBackend = {
  id: 'cadence',

  async detect(root: string): Promise<BackendDetection> {
    const present =
      existsSync(cadenceDir(root)) && existsSync(join(cadenceDir(root), 'state.json'));
    return { present, kind: present ? 'cadence' : null };
  },

  async readStatus(root: string): Promise<BackendStatus> {
    const detection = await this.detect(root);
    if (!detection.present) {
      return { present: false, kind: null, legalActions: [] };
    }
    try {
      const state = await new SimpleStateBackend(root).readState();
      return {
        present: true,
        kind: 'cadence',
        loopPosition: state.loopPosition,
        activePhase: state.activePhase,
        activeDraft: state.activeDraft,
        activeSpec: state.activeSpec,
        tier: state.tier,
        legalActions: [nextAction(state).command],
        artifacts: await this.readArtifacts(root),
      };
    } catch (err) {
      return {
        present: true,
        kind: 'cadence',
        legalActions: [],
        stateError: err instanceof Error ? err.message : String(err),
        artifacts: await this.readArtifacts(root),
      };
    }
  },

  async readArtifacts(root: string): Promise<BackendArtifacts> {
    const d = cadenceDir(root);
    const phasesDir = join(d, 'phases');
    let phaseCount = 0;
    if (existsSync(phasesDir)) {
      try {
        const entries = await readdir(phasesDir, { withFileTypes: true });
        phaseCount = entries.filter((e) => e.isDirectory()).length;
      } catch {
        phaseCount = 0;
      }
    }
    return {
      phaseCount,
      roadmap: existsSync(join(d, 'ROADMAP.md')),
      state: existsSync(join(d, 'STATE.md')),
      milestones: existsSync(join(d, 'MILESTONES.md')),
    };
  },

  async listLegalActions(root: string): Promise<string[]> {
    const status = await this.readStatus(root);
    return status.legalActions;
  },

  renderSpecDraft(
    milestone: IntelligenceMilestone,
    recs: ReadonlyArray<Pick<Recommendation, 'id' | 'title'>>,
  ): string {
    const lines: string[] = [
      '---',
      `phase: ${milestone.id}`,
      'id: 00-00',
      'status: PENDING',
      '---',
      '',
      `# 00-00 — ${milestone.name}`,
      '',
      '> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone',
      `> \`${milestone.id}\`. To promote: run \`cadence spec new <phase> <num>\``,
      '> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace',
      '> the scaffold body with this content and re-id the frontmatter.',
      '',
      '## Objective',
      '',
      milestone.objective,
      '',
      '## Acceptance Criteria',
      '',
    ];
    recs.forEach((r, i) => {
      lines.push(`### AC-${i + 1}: ${r.title || r.id}`);
      lines.push('Given _(precondition)_');
      lines.push('When _(action)_');
      lines.push('Then _(outcome)_');
      lines.push('');
    });
    lines.push('## Constraints', '');
    const constraints = [
      ...milestone.preMortem.driftRisks,
      ...milestone.preMortem.outOfScope,
    ];
    if (constraints.length === 0) lines.push('- _(constraint)_');
    else for (const c of constraints) lines.push(`- ${c}`);
    lines.push('');
    lines.push('## Open Questions', '');
    const questions = [
      ...milestone.preMortem.hiddenDependencies,
      ...milestone.preMortem.likelyFailureModes,
    ];
    if (questions.length === 0) lines.push('- _(question)_');
    else for (const q of questions) lines.push(`- ${q}`);
    lines.push('');
    return lines.join('\n');
  },
};
