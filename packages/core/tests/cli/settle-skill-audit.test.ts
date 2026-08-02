import { describe, it, expect, afterEach } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const CADENCE_CLI = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist', 'cli', 'index.js');

function run(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const env: NodeJS.ProcessEnv = { ...process.env, ANTHROPIC_API_KEY: '' };
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd, env });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

async function initGitRepo(root: string): Promise<void> {
  execSync('git init -q', { cwd: root, stdio: 'ignore' });
  execSync('git config user.email "test@cadence.local"', { cwd: root, stdio: 'ignore' });
  execSync('git config user.name "Cadence Test"', { cwd: root, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: root, stdio: 'ignore' });
  await writeFile(join(root, '.gitignore'), '.cadence/state.json\n');
  execSync('git add .gitignore', { cwd: root, stdio: 'ignore' });
  execSync('git commit -q -m init', { cwd: root, stdio: 'ignore' });
}

async function patchConfig(root: string, mut: (c: Record<string, unknown>) => void): Promise<void> {
  const p = join(root, '.cadence/config.json');
  const c = JSON.parse(await readFile(p, 'utf8'));
  mut(c);
  await writeFile(p, JSON.stringify(c, null, 2));
}

/** Seed state.skillAudit.invoked (state.json exists after `draft approve`). */
async function seedInvoked(root: string, invoked: string[]): Promise<void> {
  const p = join(root, '.cadence/state.json');
  const s = JSON.parse(await readFile(p, 'utf8'));
  s.skillAudit = { ...(s.skillAudit ?? { required: [] }), invoked };
  await writeFile(p, JSON.stringify(s, null, 2));
}

/** Add a `requiredSkills:` line into the DRAFT frontmatter (before approve). */
async function addRequiredSkillsFrontmatter(root: string, list: string[]): Promise<void> {
  const dp = join(root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
  let body = await readFile(dp, 'utf8');
  body = body.replace(/\n---\n/, `\nrequiredSkills: ${list.join(', ')}\n---\n`);
  await writeFile(dp, body, 'utf8');
}

async function arrange(
  root: string,
  opts: { profile?: string; requiredSkillsFm?: string[] } = {},
): Promise<void> {
  await initGitRepo(root);
  if (opts.profile) await patchConfig(root, (c) => (c.profile = opts.profile));
  await patchConfig(root, (c) => (c.notify = { transport: 'file' }));
  // Phase 214 (T4): no real AC-1 coverage seeded here — predates
  // gates.evidenceFloor. Relax to 'unverified' so this file's skill-audit
  // assertions aren't newly refused by the unrelated evidence-floor gate.
  await patchConfig(root, (c) => (c.gates = { sealed: [], evidenceFloor: 'unverified' }));
  await run(['draft', 'new', '01-foundation', '01', '--title=Demo'], root);
  const dp = join(root, '.cadence/phases/01-foundation/01-01-DRAFT.md');
  let body = await readFile(dp, 'utf8');
  body = body.replace(/- files: `path\/to\/file\.ts`/, '- files: `src/foo.ts`');
  await writeFile(dp, body, 'utf8');
  if (opts.requiredSkillsFm) await addRequiredSkillsFrontmatter(root, opts.requiredSkillsFm);
  await run(['draft', 'approve', '01-foundation', '01', '--no-approve'], root);
  await mkdir(join(root, 'src'), { recursive: true });
  await writeFile(join(root, 'src', 'foo.ts'), 'export const x = 1;\n');
  execSync('git add src/foo.ts', { cwd: root, stdio: 'ignore' });
  await run(['build', 'task', 'T1', '--status=DONE'], root);
}

const SETTLE = ['settle', 'run', '--auto', '--no-interactive', '--allow-missing-coverage', '--allow-stale-draft'];
const summaryPath = (root: string) =>
  join(root, '.cadence/phases/01-foundation/01-01-SUMMARY.json');
const logPath = (root: string) => join(root, '.cadence/anomalies.log');

describe('cadence settle run — required-skill gate (Phase 34.1)', () => {
  it('AC-3/AC-4 (a): effective-empty → inert pass, no anomaly', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    const r = await run(SETTLE, active.root);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/skill-audit/);
    expect(existsSync(summaryPath(active.root))).toBe(true);
    if (existsSync(logPath(active.root))) {
      expect(await readFile(logPath(active.root), 'utf8')).not.toMatch(/skill-audit-miss/);
    }
  });

  it('AC-3 (b): required satisfied (namespace-qualified invoked) → proceeds', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    await patchConfig(active.root, (c) => (c.skillAudit = { required: ['brainstorming'] }));
    await seedInvoked(active.root, ['superpowers:brainstorming']);
    const r = await run(SETTLE, active.root);
    expect(r.code).toBe(0);
    expect(existsSync(summaryPath(active.root))).toBe(true);
  });

  it('249-01/AC-3: AC-3 (c) shortfall → exit 1 + skill-audit-miss error anomaly, refused SUMMARY records gates provenance + empty acResults (byte-identical refusal behavior otherwise)', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    await patchConfig(active.root, (c) => (c.skillAudit = { required: ['tdd'] }));
    await seedInvoked(active.root, []);
    const r = await run(SETTLE, active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/required skill\(s\) not invoked: tdd/);
    // Phase 249: this is the anomaly/skill-audit refusal family, now routed
    // through the same writeRefusedSettleSummary the gate-loop refusal
    // family (phase 170/247) already uses — a SUMMARY is written, not
    // withheld.
    expect(existsSync(summaryPath(active.root))).toBe(true);
    const summary = JSON.parse(await readFile(summaryPath(active.root), 'utf8'));
    expect(summary.acResults).toEqual([]);
    expect(Array.isArray(summary.gates)).toBe(true);
    expect(summary.gates.length).toBeGreaterThan(0);
    expect(
      summary.gates.every((g: { status: string }) => g.status === 'ran' || g.status === 'skipped'),
    ).toBe(true);
    // This SUMMARY reflects THIS refusal's draft/progress, not a stale
    // artifact — draftId matches, and T1's real DONE build record (set by
    // `arrange()`) round-trips through buildTaskResults.
    expect(summary.draftId).toBe('01-01');
    expect(summary.taskResults).toEqual([{ id: 'T1', status: 'DONE', notes: '' }]);
    const log = await readFile(logPath(active.root), 'utf8');
    expect(log).toMatch(/"type":"skill-audit-miss"/);
    expect(log).toMatch(/"severity":"error"/);
    expect(log).toMatch(/"missing":\["tdd"\]/);
  });

  it('AC-3 (d): shortfall + --allow-skill-audit-miss → exit 0, warn anomaly bypassed:true', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    await patchConfig(active.root, (c) => (c.skillAudit = { required: ['tdd'] }));
    await seedInvoked(active.root, []);
    const r = await run([...SETTLE, '--allow-skill-audit-miss'], active.root);
    expect(r.code).toBe(0);
    expect(existsSync(summaryPath(active.root))).toBe(true);
    const log = await readFile(logPath(active.root), 'utf8');
    expect(log).toMatch(/"type":"skill-audit-miss"/);
    expect(log).toMatch(/"bypassed":true/);
  });

  it('AC-4 (e): shortfall + telemetry.skillInvocations:false → exit 0, unenforceable warn', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root);
    await patchConfig(active.root, (c) => {
      c.skillAudit = { required: ['tdd'] };
      c.telemetry = { tokenUtilization: true, skillInvocations: false, remoteOptIn: false };
    });
    await seedInvoked(active.root, []);
    const r = await run(SETTLE, active.root);
    expect(r.code).toBe(0);
    expect(existsSync(summaryPath(active.root))).toBe(true);
    const log = await readFile(logPath(active.root), 'utf8');
    expect(log).toMatch(/"type":"skill-audit-miss"/);
    expect(log).toMatch(/"unenforceable":true/);
  });

  it('AC-1 (f): config ∪ DRAFT requiredSkills → SUMMARY.skillAudit.required is the deduped union', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root, { requiredSkillsFm: ['b'] });
    await patchConfig(active.root, (c) => (c.skillAudit = { required: ['a'] }));
    await seedInvoked(active.root, ['superpowers:a', 'x:b']);
    const r = await run(SETTLE, active.root);
    expect(r.code).toBe(0);
    const summary = JSON.parse(await readFile(summaryPath(active.root), 'utf8'));
    expect([...summary.skillAudit.required].sort()).toEqual(['a', 'b']);
  });

  it('AC-5: strict profile still emits skill-audit-miss (unconditional — strict lacks anomaly-notify)', async () => {
    active = await tempRepo({ initialized: true });
    await arrange(active.root, { profile: 'strict' });
    await patchConfig(active.root, (c) => (c.skillAudit = { required: ['tdd'] }));
    await seedInvoked(active.root, []);
    const r = await run(SETTLE, active.root);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/required skill\(s\) not invoked: tdd/);
    // The anomaly fires even though strict cells carry NO 'anomaly-notify'
    // gate — proves the deliberate unconditional-emission divergence.
    const log = await readFile(logPath(active.root), 'utf8');
    expect(log).toMatch(/"type":"skill-audit-miss"/);
  });
});
