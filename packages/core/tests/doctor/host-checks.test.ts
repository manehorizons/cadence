import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';
import { runDoctor } from '../../src/doctor/run.js';
import { writeCompleteManagedSettings } from './host-hooks-fixture.js';

const ENV = { nodeVersion: 'v22.11.0', platform: 'linux' as const };

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
  delete process.env.CODEX_HOME;
});

async function writeCommand(
  root: string,
  name: string,
  runLine: string,
): Promise<void> {
  const dir = join(root, '.claude', 'commands');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, name),
    `---\ndescription: x\nallowed-tools: Bash(cadence:*), Read\n---\n\n<!-- managed-by: cadence -->\n\n${runLine}\n`,
  );
}

async function writeCodexHooks(root: string): Promise<void> {
  await mkdir(join(root, '.codex'), { recursive: true });
  await writeFile(
    join(root, '.codex', 'hooks.json'),
    JSON.stringify({
      hooks: {
        Stop: [{ _managedBy: 'cadence', hooks: [{ type: 'command', command: 'x' }] }],
      },
    }),
  );
}

async function writeCodexPrompt(codexHome: string): Promise<void> {
  await mkdir(join(codexHome, 'prompts'), { recursive: true });
  await writeFile(
    join(codexHome, 'prompts', 'cadence-progress.md'),
    '---\ndescription: x\n---\n\n<!-- managed-by: cadence -->\n\nRun cadence progress.\n',
  );
}

describe('runDoctor — setup + host checks', () => {
  it('AC-6: non-portable run-line → host-commands warning naming the file', async () => {
    active = await tempRepo({ initialized: true });
    await writeCommand(
      active.root,
      'cadence-progress.md',
      '!node C:\\Users\\x\\dist\\cli\\index.js progress',
    );
    const report = await runDoctor(active.root, ENV);
    const hc = report.checks.find((c) => c.name === 'host-commands');
    expect(hc?.severity).toBe('warning');
    expect(hc?.detail).toMatch(/cadence-progress\.md/);
    expect(hc?.remediation).toMatch(/--local/);
    expect(report.ok).toBe(true); // a warning must not fail the report
  });

  it('AC-6: portable run-lines → host-commands ok', async () => {
    active = await tempRepo({ initialized: true });
    await writeCommand(active.root, 'cadence-progress.md', '!cadence progress');
    await writeCommand(
      active.root,
      'cadence-draft.md',
      '!cadence draft new $ARGUMENTS',
    );
    const report = await runDoctor(active.root, ENV);
    expect(
      report.checks.find((c) => c.name === 'host-commands')?.severity,
    ).toBe('ok');
  });

  it('git-hooks: .git present without core.hooksPath → warning', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.git'), { recursive: true });
    await writeFile(
      join(active.root, '.git', 'config'),
      '[core]\n\trepositoryformatversion = 0\n',
    );
    // Phase 133: the git-hooks check is only a warning when .githooks/ exists.
    await mkdir(join(active.root, '.githooks'), { recursive: true });
    const report = await runDoctor(active.root, ENV);
    expect(report.checks.find((c) => c.name === 'git-hooks')?.severity).toBe(
      'warning',
    );
    expect(report.ok).toBe(true);
  });

  it('git-hooks: core.hooksPath=.githooks → ok', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.git'), { recursive: true });
    await writeFile(
      join(active.root, '.git', 'config'),
      '[core]\n\trepositoryformatversion = 0\n\thooksPath = .githooks\n',
    );
    const report = await runDoctor(active.root, ENV);
    expect(report.checks.find((c) => c.name === 'git-hooks')?.severity).toBe(
      'ok',
    );
  });

  it('no .git / no .claude → git-hooks, host-hooks, host-commands all ok (n/a)', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, ENV);
    for (const n of [
      'git-hooks',
      'host-hooks',
      'host-commands',
      'codex-hooks',
      'codex-prompts',
      'codex-agents-md',
      'codex-cadence-command',
    ]) {
      expect(report.checks.find((c) => c.name === n)?.severity).toBe('ok');
    }
    expect(report.ok).toBe(true);
  });

  it('host-hooks: settings.json without managed entries → error (phase 295: zero of 8 expected entries present)', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.claude'), { recursive: true });
    await writeFile(
      join(active.root, '.claude', 'settings.json'),
      JSON.stringify({ hooks: {} }),
    );
    const report = await runDoctor(active.root, ENV);
    expect(report.checks.find((c) => c.name === 'host-hooks')?.severity).toBe(
      'error',
    );
  });

  it('host-hooks: a single managed entry is an incomplete install → error naming what is missing (phase 295)', async () => {
    active = await tempRepo({ initialized: true });
    await mkdir(join(active.root, '.claude'), { recursive: true });
    await writeFile(
      join(active.root, '.claude', 'settings.json'),
      JSON.stringify({
        hooks: {
          Stop: [{ _managedBy: 'cadence', hooks: [{ type: 'command', command: 'x' }] }],
        },
      }),
    );
    const report = await runDoctor(active.root, ENV);
    const check = report.checks.find((c) => c.name === 'host-hooks');
    expect(check?.severity).toBe('error');
    expect(check?.detail).toMatch(/SessionStart/);
  });

  it('295-01/AC-3: a complete managed set → ok, byte-identical message to pre-phase-295', async () => {
    active = await tempRepo({ initialized: true });
    await writeCompleteManagedSettings(active.root);
    const report = await runDoctor(active.root, ENV);
    const check = report.checks.find((c) => c.name === 'host-hooks');
    expect(check?.severity).toBe('ok');
    expect(check?.detail).toBe('CADENCE-managed hook entries are present in settings.json.');
  });

  it('295-01/AC-1, 295-01/AC-2, 295-01/AC-6: reproduces this repo\'s measured gap (missing Skill matcher + no SubagentStart) → error naming both, fixId host-install', async () => {
    active = await tempRepo({ initialized: true });
    await writeCompleteManagedSettings(active.root, [
      { event: 'PostToolUse', matcher: 'Skill', omit: true },
      { event: 'SubagentStart', matcher: null, omit: true },
    ]);
    const report = await runDoctor(active.root, ENV);
    const check = report.checks.find((c) => c.name === 'host-hooks');
    expect(check?.severity).toBe('error');
    expect(check?.detail).toMatch(/PostToolUse.*Skill/);
    expect(check?.detail).toMatch(/SubagentStart/);
    expect(check?.fixId).toBe('host-install');
  });

  it('host-hooks: a complete managed set plus a non-managed third-party entry → ok, third-party entry never named (phase 295, AC-4 read side)', async () => {
    active = await tempRepo({ initialized: true });
    await writeCompleteManagedSettings(active.root, [], {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: 'deja hook user-prompt-submit' }] },
      ],
    });
    const report = await runDoctor(active.root, ENV);
    const check = report.checks.find((c) => c.name === 'host-hooks');
    expect(check?.severity).toBe('ok');
    expect(check?.detail).not.toMatch(/deja/);
  });

  it('295-01/AC-7: codex-hooks: a single managed marker still reports ok — existence-only, unaffected by phase 295', async () => {
    active = await tempRepo({ initialized: true });
    process.env.CODEX_HOME = join(active.root, 'codex-home');
    await writeCodexHooks(active.root);
    const report = await runDoctor(active.root, ENV);
    expect(report.checks.find((c) => c.name === 'codex-hooks')?.severity).toBe('ok');
  });

  it('codex readiness: all managed artifacts present → ok', async () => {
    active = await tempRepo({ initialized: true });
    process.env.CODEX_HOME = join(active.root, 'codex-home');
    await writeCodexHooks(active.root);
    await writeCodexPrompt(process.env.CODEX_HOME);
    await writeFile(
      join(active.root, 'AGENTS.md'),
      '# demo\n\n<!-- cadence:managed:start -->\n## CADENCE\n<!-- cadence:managed:end -->\n',
    );
    const report = await runDoctor(active.root, ENV);
    for (const n of ['codex-hooks', 'codex-prompts', 'codex-agents-md']) {
      expect(report.checks.find((c) => c.name === n)?.severity).toBe('ok');
    }
  });

  it('codex readiness: missing hooks/prompts/AGENTS.md are fixable findings', async () => {
    active = await tempRepo({ initialized: true });
    process.env.CODEX_HOME = join(active.root, 'codex-home');
    await mkdir(join(active.root, '.codex'), { recursive: true });
    const report = await runDoctor(active.root, ENV);
    expect(report.checks.find((c) => c.name === 'codex-hooks')?.fixId).toBe(
      'codex-host-install',
    );
    expect(report.checks.find((c) => c.name === 'codex-prompts')?.fixId).toBe(
      'codex-host-install',
    );
    expect(report.checks.find((c) => c.name === 'codex-agents-md')?.fixId).toBe(
      'agents-md',
    );
  });
});
