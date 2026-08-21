import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { HookDispatcher } from '../../src/hooks/dispatcher.js';

// Phase 155 T2 — boundaryEnforcement: 'block' mode (AC-2, AC-3, AC-4).

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function patchConfig(root: string, patch: Record<string, unknown>): Promise<void> {
  const path = join(root, '.cadence/config.json');
  const cfg = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...cfg, ...patch }, null, 2));
}

async function seedActiveDraft(
  root: string,
  taskFiles: string[],
  draftBoundaryEnforcement?: 'warn' | 'block',
): Promise<void> {
  const phaseDir = join(root, '.cadence/phases/01-foundation');
  await mkdir(phaseDir, { recursive: true });
  const filesLines =
    taskFiles.length > 0
      ? taskFiles.map((f) => `- files: \`${f}\``).join('\n')
      : '- files: (none)';
  const overrideLine = draftBoundaryEnforcement
    ? `boundaryEnforcement: ${draftBoundaryEnforcement}\n`
    : '';
  const draftMd = `---\nphase: 01-foundation\nid: 01-01\ntier: standard\n${overrideLine}status: APPROVED\n---\n\n# 01-01 — Demo\n\n## Objective\n\nDemo.\n\n## Acceptance Criteria\n\n### AC-1: Demo\nGiven setup\nWhen action\nThen outcome\n\n## Tasks\n\n### T1: do thing\n${filesLines}\n- action: do\n- verify: vitest\n- done: AC-1\n\n## Boundaries\n\n- _(none)_\n`;
  await writeFile(join(phaseDir, '01-01-DRAFT.md'), draftMd);
  const statePath = join(root, '.cadence/state.json');
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  state.activePhase = '01-foundation';
  state.activeDraft = '01-01';
  state.loopPosition = 'BUILD';
  state.tier = 'standard';
  state.openDrafts = [{ id: '01-01', since: new Date().toISOString() }];
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

describe('handlePreToolEdit boundaryEnforcement: block', () => {
  it('AC-2: refuses an out-of-boundary edit, naming the file', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    await seedActiveDraft(active.root, ['src/known.ts']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(false);
    expect(result.blockMessage).toContain('src/elsewhere.ts');
  });

  it('AC-2: allows an edit whose file is declared', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    await seedActiveDraft(active.root, ['src/known.ts']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/known.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('AC-3: never blocks when there is no active draft/phase', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('AC-4: never blocks when the draft declares zero files (fails open)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    await seedActiveDraft(active.root, []);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/anything.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('warn mode (default) still never blocks, even with a declared boundary', async () => {
    active = await tempRepo({ initialized: true });
    await seedActiveDraft(active.root, ['src/known.ts']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('AC-5: DRAFT frontmatter boundaryEnforcement: warn overrides a project-level block default', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    await seedActiveDraft(active.root, ['src/known.ts'], 'warn');
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(true);
  });

  it('AC-5: DRAFT frontmatter boundaryEnforcement: block overrides a project-level warn default', async () => {
    active = await tempRepo({ initialized: true });
    await seedActiveDraft(active.root, ['src/known.ts'], 'block');
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/elsewhere.ts'] },
    });
    expect(result.ok).toBe(false);
    expect(result.blockMessage).toContain('src/elsewhere.ts');
  });

  // Phase 286-01 (dec-20260821-001, D-Y) -- `files:` glob expansion. This
  // hook is one of the three call sites the decision leaves UNTOUCHED for
  // the new zero-match anomaly (that wiring is build-task.ts only), but it
  // calls the shared `runBoundaryCheck` directly, so T2's wildcard-matcher
  // change flows through here automatically. RED cases below fail today
  // because the pre-T2 exact-Set.has comparison can't match a wildcard
  // against anything.

  it('286-01/AC-2: every pre-existing literal declared-file scenario in this suite matches an explicit hand-written expected value', async () => {
    // Broadened from one reused refusal fixture to the full set of
    // distinct literal declared-file scenarios already exercised earlier
    // in this describe block: allow-when-declared, refuse-when-undeclared,
    // no-active-draft passthrough, zero-declared-files fail-open, the
    // warn-mode (default) passthrough, and both DRAFT-frontmatter
    // enforcement overrides -- run together and asserted against an explicit
    // hand-written expected value.
    const scenarios: Array<{ scenario: string; result: unknown }> = [];

    {
      active = await tempRepo({ initialized: true });
      await patchConfig(active.root, { boundaryEnforcement: 'block' });
      await seedActiveDraft(active.root, ['src/known.ts']);
      const dispatcher = new HookDispatcher(active.root);
      const result = await dispatcher.dispatch('pre-tool-edit', {
        event: 'pre-tool-edit',
        cwd: active.root,
        raw: { files: ['src/elsewhere.ts'] },
      });
      scenarios.push({
        scenario: 'AC-2: refuses an out-of-boundary edit, naming the file',
        result: { ok: result.ok, blockMessage: result.blockMessage },
      });
      await active.cleanup();
      active = null;
    }

    {
      active = await tempRepo({ initialized: true });
      await patchConfig(active.root, { boundaryEnforcement: 'block' });
      await seedActiveDraft(active.root, ['src/known.ts']);
      const dispatcher = new HookDispatcher(active.root);
      const result = await dispatcher.dispatch('pre-tool-edit', {
        event: 'pre-tool-edit',
        cwd: active.root,
        raw: { files: ['src/known.ts'] },
      });
      scenarios.push({
        scenario: 'AC-2: allows an edit whose file is declared',
        result: { ok: result.ok, blockMessage: result.blockMessage },
      });
      await active.cleanup();
      active = null;
    }

    {
      active = await tempRepo({ initialized: true });
      await patchConfig(active.root, { boundaryEnforcement: 'block' });
      const dispatcher = new HookDispatcher(active.root);
      const result = await dispatcher.dispatch('pre-tool-edit', {
        event: 'pre-tool-edit',
        cwd: active.root,
        raw: { files: ['src/elsewhere.ts'] },
      });
      scenarios.push({
        scenario: 'AC-3: never blocks when there is no active draft/phase',
        result: { ok: result.ok, blockMessage: result.blockMessage },
      });
      await active.cleanup();
      active = null;
    }

    {
      active = await tempRepo({ initialized: true });
      await patchConfig(active.root, { boundaryEnforcement: 'block' });
      await seedActiveDraft(active.root, []);
      const dispatcher = new HookDispatcher(active.root);
      const result = await dispatcher.dispatch('pre-tool-edit', {
        event: 'pre-tool-edit',
        cwd: active.root,
        raw: { files: ['src/anything.ts'] },
      });
      scenarios.push({
        scenario: 'AC-4: never blocks when the draft declares zero files (fails open)',
        result: { ok: result.ok, blockMessage: result.blockMessage },
      });
      await active.cleanup();
      active = null;
    }

    {
      active = await tempRepo({ initialized: true });
      await seedActiveDraft(active.root, ['src/known.ts']);
      const dispatcher = new HookDispatcher(active.root);
      const result = await dispatcher.dispatch('pre-tool-edit', {
        event: 'pre-tool-edit',
        cwd: active.root,
        raw: { files: ['src/elsewhere.ts'] },
      });
      scenarios.push({
        scenario: 'warn mode (default) still never blocks, even with a declared boundary',
        result: { ok: result.ok, blockMessage: result.blockMessage },
      });
      await active.cleanup();
      active = null;
    }

    {
      active = await tempRepo({ initialized: true });
      await patchConfig(active.root, { boundaryEnforcement: 'block' });
      await seedActiveDraft(active.root, ['src/known.ts'], 'warn');
      const dispatcher = new HookDispatcher(active.root);
      const result = await dispatcher.dispatch('pre-tool-edit', {
        event: 'pre-tool-edit',
        cwd: active.root,
        raw: { files: ['src/elsewhere.ts'] },
      });
      scenarios.push({
        scenario: 'AC-5: DRAFT frontmatter warn overrides a project-level block default',
        result: { ok: result.ok, blockMessage: result.blockMessage },
      });
      await active.cleanup();
      active = null;
    }

    {
      active = await tempRepo({ initialized: true });
      await seedActiveDraft(active.root, ['src/known.ts'], 'block');
      const dispatcher = new HookDispatcher(active.root);
      const result = await dispatcher.dispatch('pre-tool-edit', {
        event: 'pre-tool-edit',
        cwd: active.root,
        raw: { files: ['src/elsewhere.ts'] },
      });
      scenarios.push({
        scenario: 'AC-5: DRAFT frontmatter block overrides a project-level warn default',
        result: { ok: result.ok, blockMessage: result.blockMessage },
      });
      await active.cleanup();
      active = null;
    }

    // Hand-written expected value, not a `.snap` file (dec-20260821-002):
    // a literal inline expectation is auditable from a static read, with no
    // claim about when it was captured.
    const EXPECTED: Array<{ scenario: string; result: unknown }> = [
      {
        scenario: 'AC-2: refuses an out-of-boundary edit, naming the file',
        result: {
          ok: false,
          blockMessage:
            "boundaryEnforcement=block: file(s) not declared in any task's files: src/elsewhere.ts",
        },
      },
      {
        scenario: 'AC-2: allows an edit whose file is declared',
        result: { ok: true, blockMessage: undefined },
      },
      {
        scenario: 'AC-3: never blocks when there is no active draft/phase',
        result: { ok: true, blockMessage: undefined },
      },
      {
        scenario: 'AC-4: never blocks when the draft declares zero files (fails open)',
        result: { ok: true, blockMessage: undefined },
      },
      {
        scenario: 'warn mode (default) still never blocks, even with a declared boundary',
        result: { ok: true, blockMessage: undefined },
      },
      {
        scenario: 'AC-5: DRAFT frontmatter warn overrides a project-level block default',
        result: { ok: true, blockMessage: undefined },
      },
      {
        scenario: 'AC-5: DRAFT frontmatter block overrides a project-level warn default',
        result: {
          ok: false,
          blockMessage:
            "boundaryEnforcement=block: file(s) not declared in any task's files: src/elsewhere.ts",
        },
      },
    ];
    expect(scenarios).toEqual(EXPECTED);
  });

  it('286-01/AC-1: a wildcard declared entry (`.changeset/*.md`) matches an edited file of the same shape -- allows the edit (RED pre-T2)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    await seedActiveDraft(active.root, ['.changeset/*.md']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['.changeset/foo.md'] },
    });
    // RED today: the pre-T2 exact Set.has comparison can't match
    // '.changeset/*.md' against '.changeset/foo.md', so this edit is
    // (wrongly) blocked today.
    expect(result.ok).toBe(true);
  });

  it("286-01/AC-3: a wildcard entry covers its own file but a second genuinely undeclared file still refuses, naming only the genuinely undeclared one (RED pre-T2)", async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    await seedActiveDraft(active.root, ['.changeset/*.md']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['.changeset/foo.md', 'src/elsewhere.ts'] },
    });
    // Refuses today AND after the fix -- src/elsewhere.ts is genuinely
    // undeclared either way. Discriminating (RED today, GREEN after T2):
    // '.changeset/foo.md' must stop being named as an offender.
    expect(result.ok).toBe(false);
    expect(result.blockMessage).toContain('src/elsewhere.ts');
    expect(result.blockMessage).not.toContain('changeset/foo.md');
  });

  it('286-01: a declared wildcard entry with zero matching edited files never itself blocks the edit (GREEN today and must stay GREEN -- the new zero-match anomaly is warn-only and wired only into build-task.ts, never this hook)', async () => {
    active = await tempRepo({ initialized: true });
    await patchConfig(active.root, { boundaryEnforcement: 'block' });
    // seedActiveDraft emits ONE `- files:` LINE PER ARRAY ELEMENT, but
    // draft-parser's `/-\s*files:\s*(.+)/.exec(block)` only reads the
    // FIRST such line in a task block (no `g` flag) -- a second declared
    // file on the second array element would be silently dropped, which
    // is exactly what happened the first time this test was written
    // (['.changeset/*.md', 'src/known.ts'] parsed as declaring only the
    // wildcard). The production multi-file syntax is a single line with
    // comma-separated backtick-quoted entries -- built here as ONE array
    // element whose embedded backticks/comma produce that single line.
    await seedActiveDraft(active.root, ['.changeset/*.md`, `src/known.ts']);
    const dispatcher = new HookDispatcher(active.root);
    const result = await dispatcher.dispatch('pre-tool-edit', {
      event: 'pre-tool-edit',
      cwd: active.root,
      raw: { files: ['src/known.ts'] },
    });
    expect(result.ok).toBe(true);
  });
});
