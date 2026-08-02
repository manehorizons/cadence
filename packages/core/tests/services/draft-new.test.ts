// rec-20260711-004 (Phase 205, T8) — `draft new` seeds a `## UI Contract`
// section from an APPROVED sibling `<id>-UI-SPEC.md`. Direct-call style
// against `draftNewService`, matching this directory's existing
// `scaffold-collision.test.ts`/`spec-approve.test.ts` fixtures rather than
// the CLI-spawn style used by `tests/cli/draft-new-seed.test.ts` (this file
// didn't exist prior to T8; there is no prior "reuse the file's own APPROVED
// SPEC constant name" to inherit from, so `APPROVED_SPEC` below matches the
// name `draft-new-seed.test.ts` already uses for the same fixture shape).
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyState } from '@thomas-powers-jr/cadence-types';
import { draftNewService } from '../../src/services/draft-new.js';
import { SimpleStateBackend } from '../../src/state/simple.js';
import type { CommandIO } from '../../src/services/io.js';

function captureIO(): { io: CommandIO; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (s) => out.push(s), err: (s) => err.push(s) }, out, err };
}

let root: string | undefined;
afterEach(async () => {
  if (root) {
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
    root = undefined;
  }
});

/** A minimal IDLE cadence repo — no config.json needed (draftNewService
 * tolerates a missing config, skipping the phase-collision guard). */
async function mktemp(): Promise<string> {
  const r = await mkdtemp(join(tmpdir(), 'cadence-draft-new-ui-'));
  await mkdir(join(r, '.cadence', 'phases'), { recursive: true });
  await new SimpleStateBackend(r).commit(emptyState('draft-new-ui-test'));
  return r;
}

const APPROVED_SPEC = `---
phase: 01-ui-demo
id: 01-01
status: APPROVED
---

# 01-01 — Demo Spec

## Objective

Seed me into the draft.

## Acceptance Criteria

### AC-1: alpha
Given a
When b
Then c
`;

describe('draftNewService — UI Contract seed (rec-20260711-004)', () => {
  it('AC-6: seeds a UI Contract section from an APPROVED sibling UI-SPEC', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence', 'phases', '01-ui-demo');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(join(phaseDir, '01-01-SPEC.md'), APPROVED_SPEC);
    await writeFile(
      join(phaseDir, '01-01-UI-SPEC.md'),
      `---\nphase: 01-ui-demo\nid: 01-01\nstatus: APPROVED\n---\n\n# 01-01 — demo\n\n## Components\n\n### X\n- new\n\n#### Layout & Tokens\n- spacing-4\n\n#### Precedent References\n- (none)\n\n## Responsive & Interaction\n\n- collapses below 768px\n`,
    );
    const { io, out } = captureIO();
    const res = await draftNewService(root, { phase: '01-ui-demo', num: '1' }, io);
    expect(res.exitCode).toBe(0);
    const draftBody = await readFile(join(phaseDir, '01-01-DRAFT.md'), 'utf8');
    expect(draftBody).toContain('## UI Contract');
    expect(out.join('')).toMatch(/seeded .* UI Contract/);
  });

  it('AC-7: prints a non-fatal notice and omits UI Contract when the UI-SPEC is present but not APPROVED', async () => {
    root = await mktemp();
    const phaseDir = join(root, '.cadence', 'phases', '02-ui-demo2');
    await mkdir(phaseDir, { recursive: true });
    await writeFile(
      join(phaseDir, '02-01-SPEC.md'),
      APPROVED_SPEC.replace('phase: 01-ui-demo', 'phase: 02-ui-demo2').replace('id: 01-01', 'id: 02-01'),
    );
    await writeFile(
      join(phaseDir, '02-01-UI-SPEC.md'),
      `---\nphase: 02-ui-demo2\nid: 02-01\nstatus: PENDING\n---\n\n# 02-01 — demo\n\n## Components\n\n## Responsive & Interaction\n`,
    );
    const { io, out, err } = captureIO();
    const res = await draftNewService(root, { phase: '02-ui-demo2', num: '1' }, io);
    expect(res.exitCode).toBe(0);
    const draftBody = await readFile(join(phaseDir, '02-01-DRAFT.md'), 'utf8');
    expect(draftBody).not.toContain('## UI Contract');
    expect(err.join('')).toMatch(/UI-SPEC 02-01 present but not APPROVED/);
    expect(out.join('')).not.toMatch(/UI Contract/);
  });
});
