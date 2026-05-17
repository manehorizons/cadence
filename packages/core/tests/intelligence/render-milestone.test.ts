import { describe, expect, it } from 'vitest';
import type { IntelligenceMilestone, MilestoneLedger } from '@cadence/types';
import { renderMilestonesMd } from '../../src/intelligence/render-milestone.js';

function mk(p: Partial<IntelligenceMilestone> & { id: string }): IntelligenceMilestone {
  return {
    name: p.id,
    objective: 'do it',
    status: 'proposed',
    recommendationIds: ['rec-1'],
    preMortem: { likelyFailureModes: [], hiddenDependencies: [], driftRisks: [], outOfScope: [] },
    exportTargets: [],
    createdAt: '2026-05-17T00:00:00.000Z',
    updatedAt: '2026-05-17T00:00:00.000Z',
    ...p,
  };
}
const led = (...m: IntelligenceMilestone[]): MilestoneLedger => ({
  schemaVersion: 1,
  milestones: m,
});

describe('renderMilestonesMd', () => {
  it('renders heading, generated-from note, and all sections with empty literals', () => {
    const md = renderMilestonesMd(led());
    expect(md).toMatch(/^# CADENCE Milestone Candidates/m);
    expect(md).toMatch(/> Generated from `\.cadence\/intelligence\/milestones\.json`\./);
    expect(md).not.toMatch(/Generated at:/);
    for (const s of ['## Proposed', '## Accepted', '## Deferred', '## Exported', '## Closed']) {
      expect(md).toContain(s);
    }
    expect(md.match(/None\./g)?.length).toBe(5);
  });

  it('proposed/accepted get the detail block; pre-mortem placeholders only when empty', () => {
    const md = renderMilestonesMd(
      led(
        mk({
          id: 'mil-grp-a',
          name: 'A',
          status: 'proposed',
          recommendationIds: ['rec-1', 'rec-2'],
          preMortem: {
            likelyFailureModes: ['boom'],
            hiddenDependencies: [],
            driftRisks: [],
            outOfScope: [],
          },
        }),
      ),
    );
    expect(md).toMatch(/### mil-grp-a — A/);
    expect(md).toMatch(/- objective: do it/);
    expect(md).toMatch(/- recommendations: rec-1, rec-2/);
    expect(md).toMatch(/- boom/); // seeded entry rendered
    // a seeded section must NOT also emit its placeholder prompt
    expect(md).not.toMatch(/_\(why might this fail\?\)_/);
    // empty sections show the placeholder prompt
    expect(md).toMatch(/_\(what must already be true\?\)_/);
    expect(md).toMatch(/_\(what docs\/specs will drift\?\)_/);
    expect(md).toMatch(/_\(what is explicitly NOT in this milestone\?\)_/);
  });

  it('deferred/exported/closed render as one-liners, id-sorted', () => {
    const md = renderMilestonesMd(
      led(
        mk({ id: 'mil-b', status: 'deferred' }),
        mk({ id: 'mil-a', status: 'deferred' }),
        mk({
          id: 'mil-x',
          status: 'exported',
          exportTargets: [
            { backend: 'cadence', artifactPath: '.cadence/phases/p/00-01-SPEC.md', exportedAt: '2026-05-17T01:00:00.000Z' },
          ],
        }),
        mk({ id: 'mil-c', status: 'closed' }),
      ),
    );
    const deferred = md.slice(md.indexOf('## Deferred'), md.indexOf('## Exported'));
    expect(deferred.indexOf('mil-a')).toBeLessThan(deferred.indexOf('mil-b'));
    expect(md).toMatch(/- mil-x — mil-x → \.cadence\/phases\/p\/00-01-SPEC\.md/);
    expect(md).toMatch(/## Closed\n\n- mil-c — mil-c/);
  });
});
