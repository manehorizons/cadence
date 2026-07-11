/**
 * `cadence verify coverage --explain AC-N` (phase 167, T8, AC-8).
 *
 * Spawns the built CLI (per this repo's own known gotcha — CLI tests must
 * run against `dist/cli/index.js`, so `pnpm build` first or a regression
 * hides until CI) against real ephemeral-repo fixtures
 * (`@manehorizons/cadence-testkit`), the same pattern `doctor.test.ts` and
 * `draft-approve-gate.test.ts` use.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';

const CADENCE_CLI = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'dist',
  'cli',
  'index.js',
);

function run(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args], { cwd });
    let stdout = '';
    let stderr = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.stderr.on('data', (d) => (stderr += d.toString()));
    p.on('exit', (code) => resolve({ stdout, stderr, code: code ?? 0 }));
  });
}

async function writeTestFile(root: string, rel: string, body: string): Promise<void> {
  const abs = join(root, rel);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, body, 'utf8');
}

/** Overwrite `.cadence/config.json`'s `verification.testGlobs` (assertion
 * mode is already the fresh-init default per `defaultConfig`). */
async function setTestGlobs(root: string, globs: string[]): Promise<void> {
  const cfgPath = join(root, '.cadence', 'config.json');
  const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
  cfg.verification.testGlobs = globs;
  await writeFile(cfgPath, JSON.stringify(cfg, null, 2));
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('cadence verify coverage --explain (phase 167, T8, AC-8)', () => {
  it('AC-8: a qualifying js/ts span is reported with file, profile, span, and satisfies=true (human mode)', async () => {
    active = await tempRepo({ initialized: true });
    await writeTestFile(
      active.root,
      'packages/pkg/a.test.ts',
      "it('doc (AC-8)', () => { expect(1).toBe(1); });\n",
    );
    const r = await run(['verify', 'coverage', '--explain', 'AC-8'], active.root);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('packages/pkg/a.test.ts');
    expect(r.stdout).toContain('profile: js-ts');
    expect(r.stdout).toMatch(/satisfies:\s*true/);
    expect(r.stdout).toContain('Overall: SATISFIED');
  });

  it('AC-8: --json emits structured facts on stdout (file, profile, spans, satisfaction)', async () => {
    active = await tempRepo({ initialized: true });
    await writeTestFile(
      active.root,
      'packages/pkg/a.test.ts',
      "it('doc (AC-8)', () => { expect(1).toBe(1); });\n",
    );
    const r = await run(['verify', 'coverage', '--explain', 'AC-8', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.acId).toBe('AC-8');
    expect(parsed.mode).toBe('assertion');
    expect(parsed.satisfied).toBe(true);
    const file = parsed.files.find((f: { file: string }) => f.file === 'packages/pkg/a.test.ts');
    expect(file).toBeDefined();
    expect(file.profileId).toBe('js-ts');
    expect(file.spansFound).toBeGreaterThan(0);
    expect(file.occurrences).toHaveLength(1);
    expect(file.occurrences[0].satisfies).toBe(true);
    expect(file.occurrences[0].span).not.toBeNull();
  });

  it('AC-8: an unclaimed extension is distinguished from "profile found but no span"', async () => {
    active = await tempRepo({ initialized: true });
    await setTestGlobs(active.root, ['**/*.rb']);
    await writeTestFile(
      active.root,
      'lib/thing_spec.rb',
      ["it 'does the thing (AC-8)' do", '  expect(1).to eq(1)', 'end', ''].join('\n'),
    );
    const r = await run(['verify', 'coverage', '--explain', 'AC-8', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const file = parsed.files.find((f: { file: string }) => f.file === 'lib/thing_spec.rb');
    expect(file).toBeDefined();
    expect(file.profileId).toBeNull();
    expect(file.profileReason).toMatch(/no coverage profile registered/);
    expect(file.occurrences).toHaveLength(1);
    expect(file.occurrences[0].satisfies).toBe(false);
    expect(file.occurrences[0].reason).toMatch(/no coverage profile claims/);
    expect(parsed.satisfied).toBe(false);
  });

  it('AC-8: a token inside a non-asserting block is found but marked not-satisfying, with a distinct reason', async () => {
    active = await tempRepo({ initialized: true });
    await setTestGlobs(active.root, ['**/*_test.go']);
    await writeTestFile(
      active.root,
      'pkg/baz_test.go',
      [
        'package pkg',
        '',
        'func TestBaz(t *testing.T) {',
        '\t// AC-8 mentioned only, this function never asserts',
        '\tx := 1',
        '\t_ = x',
        '}',
        '',
      ].join('\n'),
    );
    const r = await run(['verify', 'coverage', '--explain', 'AC-8', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const file = parsed.files.find((f: { file: string }) => f.file === 'pkg/baz_test.go');
    expect(file).toBeDefined();
    expect(file.profileId).toBe('go');
    expect(file.occurrences).toHaveLength(1);
    const occ = file.occurrences[0];
    expect(occ.span).not.toBeNull();
    expect(occ.span.hasAssertion).toBe(false);
    expect(occ.satisfies).toBe(false);
    expect(occ.reason).toMatch(/token present but block not asserting/);
    expect(parsed.satisfied).toBe(false);
  });

  it('AC-8: no files matched the globs at all is reported plainly, distinct from "matched but nothing qualified"', async () => {
    active = await tempRepo({ initialized: true });
    await setTestGlobs(active.root, ['**/*.nonexistent-ext']);
    const r = await run(['verify', 'coverage', '--explain', 'AC-8', '--json'], active.root);
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.anyFilesMatched).toBe(false);
    expect(parsed.files).toEqual([]);
    expect(parsed.satisfied).toBe(false);

    const human = await run(['verify', 'coverage', '--explain', 'AC-8'], active.root);
    expect(human.stdout).toMatch(/No test files matched/);
  });

  it('AC-8: the command is genuinely read-only — .cadence/state.json is byte-identical before and after', async () => {
    active = await tempRepo({ initialized: true });
    await writeTestFile(
      active.root,
      'packages/pkg/a.test.ts',
      "it('doc (AC-8)', () => { expect(1).toBe(1); });\n",
    );
    const statePath = join(active.root, '.cadence', 'state.json');
    const before = await readFile(statePath, 'utf8');
    const r = await run(['verify', 'coverage', '--explain', 'AC-8', '--json'], active.root);
    expect(r.code).toBe(0);
    const after = await readFile(statePath, 'utf8');
    expect(after).toBe(before);
  });
});
