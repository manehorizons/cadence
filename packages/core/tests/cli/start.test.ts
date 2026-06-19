import { describe, it, expect } from 'vitest';
import { runStart, type StartDeps } from '../../src/cli/commands/start.js';
import { bufferIO } from '../../src/services/io.js';
import { resolvePick, type StartOption } from '../../src/start/menu.js';

function deps(over: Partial<StartDeps> = {}): StartDeps & { spawned: StartOption[] } {
  const spawned: StartOption[] = [];
  return {
    spawn: async (o: StartOption) => {
      spawned.push(o);
      return 0;
    },
    initialized: () => false,
    spawned,
    ...over,
  };
}

describe('runStart', () => {
  it('emits the structured menu for --json and never spawns (AC-5)', async () => {
    const io = bufferIO();
    const d = deps();
    const res = await runStart('/repo', { json: true, isTty: false }, io, d);
    expect(res.exitCode).toBe(0);
    const json = JSON.parse(io.stdout());
    expect(json.options).toHaveLength(6);
    expect(json.recommendation.command).toContain('tutorial');
    expect(d.spawned).toHaveLength(0);
  });

  it('prints the menu and exits 0 in a non-TTY (AC-6)', async () => {
    const io = bufferIO();
    const d = deps();
    const res = await runStart('/repo', { isTty: false }, io, d);
    expect(res.exitCode).toBe(0);
    expect(io.stdout()).toContain('What are you doing?');
    expect(io.stdout()).toContain('Recommended: npx -y @manehorizons/cadence-core tutorial');
    expect(d.spawned).toHaveLength(0);
  });

  it('prints an IDLE template recommendation when initialized state says IDLE', async () => {
    const io = bufferIO();
    const d = deps({
      initialized: () => true,
      recommendation: async () => ({
        command: 'cadence draft new --title "Fix login timeout" --template bugfix',
        reason: 'You are set up and idle.',
      }),
    });
    await runStart('/repo', { isTty: false }, io, d);
    expect(io.stdout()).toContain('--template bugfix');
    expect(io.stdout()).toContain('You are set up and idle.');
  });

  it('dispatches a core option via --pick --yes (AC-7)', async () => {
    const io = bufferIO();
    const d = deps();
    const res = await runStart('/repo', { pick: 2, yes: true, isTty: false }, io, d);
    expect(res.exitCode).toBe(0);
    expect(d.spawned).toEqual([
      expect.objectContaining({ runner: 'cadence', args: ['init'] }),
    ]);
  });

  it('dispatches a host option through npx (AC-7)', async () => {
    const io = bufferIO();
    const d = deps();
    await runStart('/repo', { pick: 3, yes: true, isTty: false }, io, d);
    expect(d.spawned[0]).toMatchObject({
      runner: 'npx',
      args: ['-y', '@manehorizons/cadence-host-claude-code', 'install'],
    });
  });

  it('exits non-zero on an invalid --pick and never spawns (AC-8)', async () => {
    const io = bufferIO();
    const d = deps();
    const res = await runStart('/repo', { pick: 99, yes: true, isTty: false }, io, d);
    expect(res.exitCode).toBe(1);
    expect(d.spawned).toHaveLength(0);
    expect(io.stderr()).toContain('Not an option');
  });

  it('prints the command without spawning when confirm is declined (AC-9)', async () => {
    const io = bufferIO();
    const d = deps({ confirm: async () => false });
    const res = await runStart('/repo', { pick: 2, isTty: true }, io, d);
    expect(res.exitCode).toBe(0);
    expect(d.spawned).toHaveLength(0);
    expect(io.stdout()).toContain('cadence init');
  });

  it('spawns when confirm is accepted (AC-9)', async () => {
    const io = bufferIO();
    const d = deps({ confirm: async () => true });
    await runStart('/repo', { pick: 2, isTty: true }, io, d);
    expect(d.spawned).toHaveLength(1);
  });

  it('quits with exit 0 when the interactive prompt returns null (AC-10)', async () => {
    const io = bufferIO();
    const d = deps({ prompt: async () => null });
    const res = await runStart('/repo', { isTty: true }, io, d);
    expect(res.exitCode).toBe(0);
    expect(d.spawned).toHaveLength(0);
  });

  it('dispatches the prompted option (AC-10)', async () => {
    const io = bufferIO();
    const chosen = resolvePick(6)!;
    const d = deps({ prompt: async () => chosen, confirm: async () => true });
    await runStart('/repo', { isTty: true }, io, d);
    expect(d.spawned).toEqual([chosen]);
  });

  it('propagates a non-zero spawn exit code with a fallback line (AC-11)', async () => {
    const io = bufferIO();
    const d = deps({ spawn: async () => 2 });
    const res = await runStart('/repo', { pick: 2, yes: true, isTty: false }, io, d);
    expect(res.exitCode).toBe(2);
    expect(io.stderr().toLowerCase()).toContain('run it yourself');
  });

  it('annotates the init option when the repo is initialized (AC-12)', async () => {
    const io = bufferIO();
    const d = deps({ initialized: () => true });
    await runStart('/repo', { isTty: false }, io, d);
    expect(io.stdout()).toContain('already set up');
  });
});
