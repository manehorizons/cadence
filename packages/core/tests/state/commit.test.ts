import { describe, it, expect, vi } from 'vitest';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { SimpleStateBackend } from '../../src/state/simple.js';
import { renderStateMd } from '../../src/render/state-md.js';
import { CadenceStateZ } from '@manehorizons/cadence-types';
import { StateConflictError } from '../../src/errors.js';

let active: Fixture | null = null;

describe('SimpleStateBackend.commit (Phase 41.1)', () => {
  it('writes state.json AND STATE.md together, STATE.md matching renderStateMd', async () => {
    active = await tempRepo({ initialized: true });
    const backend = new SimpleStateBackend(active.root);
    const state = await backend.readState();
    state.session.subagentSpawns = 7;
    state.skillAudit.invoked = ['superpowers:tdd'];

    await backend.commit(state);

    const dir = join(active.root, '.cadence');
    const json = CadenceStateZ.parse(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')));
    expect(json.session.subagentSpawns).toBe(7);
    expect(json.skillAudit.invoked).toEqual(['superpowers:tdd']);

    const md = await readFile(join(dir, 'STATE.md'), 'utf8');
    expect(md).toBe(renderStateMd(state));
    // STATE.md reflects the committed state (no stale view).
    expect(md).toContain('Subagent spawns this session: 7');
    expect(md).toContain('Invoked: superpowers:tdd');

    await active.cleanup();
    active = null;
  });

  it('creates the .cadence dir when missing before writing both artefacts', async () => {
    active = await tempRepo({ initialized: true });
    // A backend rooted at a fresh subdir with no .cadence yet.
    const sub = join(active.root, 'nested');
    await mkdir(sub, { recursive: true });
    const backend = new SimpleStateBackend(sub);
    const seed = await new SimpleStateBackend(active.root).readState();

    await backend.commit(seed);

    const dir = join(sub, '.cadence');
    expect(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')).project.name).toBe(seed.project.name);
    expect(await readFile(join(dir, 'STATE.md'), 'utf8')).toBe(renderStateMd(seed));

    await active.cleanup();
    active = null;
  });

  it('bumps state.revision in place on a successful commit (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    const backend = new SimpleStateBackend(active.root);
    const state = await backend.readState();
    expect(state.revision).toBe(0);

    await backend.commit(state);

    expect(state.revision).toBe(1);
    const onDisk = await backend.readState();
    expect(onDisk.revision).toBe(1);

    await active.cleanup();
    active = null;
  });

  it('two sequential commits from the same in-memory state object both succeed (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    const backend = new SimpleStateBackend(active.root);
    const state = await backend.readState();

    state.skillAudit.invoked = ['a'];
    await backend.commit(state);
    state.skillAudit.invoked = ['a', 'b'];
    await backend.commit(state); // must not throw: state.revision was bumped in place by the first commit

    const onDisk = await backend.readState();
    expect(onDisk.skillAudit.invoked).toEqual(['a', 'b']);
    expect(onDisk.revision).toBe(2);

    await active.cleanup();
    active = null;
  });

  it('refuses a commit built from a stale read (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    const staleReader = new SimpleStateBackend(active.root);
    const otherWriter = new SimpleStateBackend(active.root);
    const staleState = await staleReader.readState(); // revision 0
    const freshState = await otherWriter.readState(); // revision 0

    await otherWriter.commit(freshState); // bumps on-disk revision to 1

    await expect(staleReader.commit(staleState)).rejects.toBeInstanceOf(StateConflictError);

    await active.cleanup();
    active = null;
  });

  it('conflict error message names both revisions (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    const staleReader = new SimpleStateBackend(active.root);
    const otherWriter = new SimpleStateBackend(active.root);
    const staleState = await staleReader.readState();
    const freshState = await otherWriter.readState();
    await otherWriter.commit(freshState);

    await expect(staleReader.commit(staleState)).rejects.toThrow(
      /you had revision 0, current is 1/,
    );

    await active.cleanup();
    active = null;
  });

  it('a refused commit does not mutate the caller state or the on-disk file (AC-2)', async () => {
    active = await tempRepo({ initialized: true });
    const staleReader = new SimpleStateBackend(active.root);
    const otherWriter = new SimpleStateBackend(active.root);
    const staleState = await staleReader.readState();
    const freshState = await otherWriter.readState();
    freshState.skillAudit.invoked = ['winner'];
    await otherWriter.commit(freshState);

    staleState.skillAudit.invoked = ['loser'];
    await expect(staleReader.commit(staleState)).rejects.toBeInstanceOf(StateConflictError);
    expect(staleState.revision).toBe(0); // untouched by the failed attempt

    const onDisk = await staleReader.readState();
    expect(onDisk.skillAudit.invoked).toEqual(['winner']); // the refused write never landed

    await active.cleanup();
    active = null;
  });

  it('{ force: true } bypasses the conflict, overwrites, and warns to stderr (AC-5)', async () => {
    active = await tempRepo({ initialized: true });
    const staleReader = new SimpleStateBackend(active.root);
    const otherWriter = new SimpleStateBackend(active.root);
    const staleState = await staleReader.readState();
    const freshState = await otherWriter.readState();
    freshState.skillAudit.invoked = ['first'];
    await otherWriter.commit(freshState);

    staleState.skillAudit.invoked = ['forced'];
    const warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await staleReader.commit(staleState, { force: true });
    const wroteWarning = warnSpy.mock.calls.some((call) => String(call[0]).includes('force'));
    warnSpy.mockRestore();
    expect(wroteWarning).toBe(true);

    const onDisk = await staleReader.readState();
    expect(onDisk.skillAudit.invoked).toEqual(['forced']);

    await active.cleanup();
    active = null;
  });

  it('a telemetry-only intervening bump no longer falsely conflicts with an unrelated structural commit (AC-1)', async () => {
    active = await tempRepo({ initialized: true });
    const backend = new SimpleStateBackend(active.root);
    const telemetryWriter = new SimpleStateBackend(active.root);

    // Caller reads state at revision 0 and begins building an unrelated
    // structural change (nothing to do with session.subagentSpawns).
    const state = await backend.readState();
    state.skillAudit.invoked = ['superpowers:tdd'];

    // Before the caller commits, a second backend instance bumps ONLY the
    // telemetry counter session.subagentSpawns via the telemetry-exempt
    // write path — this is the real fixed code path: handleSubagentResult()
    // now calls backend.bumpSessionCounter() instead of the old read +
    // mutate + commit() sequence for this case, specifically because
    // bumpSessionCounter() never compares to or bumps `revision`.
    const dir = join(active.root, '.cadence');
    const revisionBefore = (
      await readFile(join(dir, 'state.json'), 'utf8').then((raw) => JSON.parse(raw))
    ).revision;

    await telemetryWriter.bumpSessionCounter('subagentSpawns', 1);

    const revisionAfter = (
      await readFile(join(dir, 'state.json'), 'utf8').then((raw) => JSON.parse(raw))
    ).revision;
    // Core guarantee of the fix: a telemetry bump never touches `revision`.
    expect(revisionAfter).toBe(revisionBefore);

    // The caller's structural commit, still built from revision 0, has
    // nothing to do with subagentSpawns and should be allowed to land.
    // Before the fix, this failed because the old handleSubagentResult()
    // path routed telemetry bumps through commit(), which bumps the shared
    // `revision` regardless of what changed — invalidating this unrelated
    // structural commit's snapshot. bumpSessionCounter() leaves `revision`
    // untouched, so this now resolves successfully.
    await expect(backend.commit(state)).resolves.toBeUndefined();

    await active.cleanup();
    active = null;
  });

  it('two structural commits from the same on-disk revision still conflict — telemetry exemption did not widen (AC-3)', async () => {
    active = await tempRepo({ initialized: true });
    const staleReader = new SimpleStateBackend(active.root);
    const otherWriter = new SimpleStateBackend(active.root);
    const staleState = await staleReader.readState(); // revision 0
    const freshState = await otherWriter.readState(); // revision 0

    // Both callers mutate genuinely structural fields — loopPosition and
    // openDrafts — never session.subagentSpawns. This is deliberately NOT
    // the telemetry-only shape bumpSessionCounter() exempts from the
    // revision guard, so both commits must still go through commit()'s
    // compare-and-swap exactly as before this phase.
    freshState.loopPosition = 'BUILD';
    freshState.openDrafts.push({ id: '194-01', since: new Date().toISOString() });
    await otherWriter.commit(freshState); // bumps on-disk revision to 1

    staleState.loopPosition = 'SETTLE';
    staleState.activeTask = { id: 'T3', status: 'IN_PROGRESS', touchedFiles: [] };
    await expect(staleReader.commit(staleState)).rejects.toBeInstanceOf(StateConflictError);

    // The winning structural commit landed; the conflicting one never did.
    const onDisk = await staleReader.readState();
    expect(onDisk.loopPosition).toBe('BUILD');
    expect(onDisk.openDrafts).toEqual([{ id: '194-01', since: expect.any(String) }]);
    expect(onDisk.revision).toBe(1);

    await active.cleanup();
    active = null;
  });

  it('bootstrap write accepts a nonzero revision unconditionally — the check is truly skipped, not coincidentally satisfied (AC-4)', async () => {
    active = await tempRepo({ initialized: true });
    const sub = join(active.root, 'nested-bootstrap');
    await mkdir(sub, { recursive: true });
    const backend = new SimpleStateBackend(sub);
    const seed = await new SimpleStateBackend(active.root).readState();
    seed.revision = 42; // deliberately nonzero and unrelated to any on-disk file at `sub`

    await backend.commit(seed);

    const onDisk = await backend.readState();
    expect(onDisk.revision).toBe(42); // written as-is; no comparison was possible or attempted

    await active.cleanup();
    active = null;
  });
});

describe('SimpleStateBackend.bumpSessionCounter (Phase 194 / issue #234)', () => {
  it('increments the named session counter and leaves revision untouched', async () => {
    active = await tempRepo({ initialized: true });
    const backend = new SimpleStateBackend(active.root);
    const before = await backend.readState();
    expect(before.session.subagentSpawns).toBe(0);
    expect(before.revision).toBe(0);

    await backend.bumpSessionCounter('subagentSpawns', 1);
    await backend.bumpSessionCounter('subagentSpawns', 2);

    const after = await backend.readState();
    expect(after.session.subagentSpawns).toBe(3);
    expect(after.revision).toBe(0); // never bumped — the whole point of this path

    const dir = join(active.root, '.cadence');
    const md = await readFile(join(dir, 'STATE.md'), 'utf8');
    expect(md).toBe(renderStateMd(after)); // STATE.md kept in sync, same as commit()

    await active.cleanup();
    active = null;
  });

  it('is a silent no-op when state.json does not exist yet', async () => {
    active = await tempRepo({ initialized: false });
    const backend = new SimpleStateBackend(active.root);

    await expect(backend.bumpSessionCounter('subagentSpawns', 1)).resolves.toBeUndefined();
    expect(existsSync(join(active.root, '.cadence', 'state.json'))).toBe(false);

    await active.cleanup();
    active = null;
  });
});
