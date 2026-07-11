import { describe, it, expect, afterEach } from 'vitest';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { runDoctor } from '../../src/doctor/run.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

const HEALTHY_ENV = { nodeVersion: 'v20.11.0', platform: 'linux' as const };

async function writeCoverageMode(root: string, coverageMode: 'assertion' | 'mention'): Promise<void> {
  const path = join(root, '.cadence', 'config.json');
  const raw = JSON.parse(await readFile(path, 'utf8'));
  raw.verification = { ...raw.verification, coverageMode };
  await writeFile(path, JSON.stringify(raw, null, 2));
}

function findCheck(checks: { name: string }[], name: string) {
  return checks.find((c) => c.name === name);
}

describe('runDoctor', () => {
  it('AC-1: healthy initialized project → no errors, report.ok true', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc' });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    expect(report.ok).toBe(true);
    // Warnings are allowed (e.g. verification-readiness warns on default mock config).
    // Errors must be absent for report.ok to be true.
    expect(report.checks.every((c) => c.severity !== 'error')).toBe(true);
    expect(report.checks.map((c) => c.name)).toEqual(
      expect.arrayContaining(['node', 'initialized', 'state']),
    );
  });

  it('AC-2: uninitialized project → initialized is error, report.ok false', async () => {
    active = await tempRepo({ initialized: false });
    const report = await runDoctor(active.root, HEALTHY_ENV);
    const init = report.checks.find((c) => c.name === 'initialized');
    expect(init?.severity).toBe('error');
    expect(init?.detail).toMatch(/\.cadence\//);
    expect(init?.remediation).toMatch(/cadence init/);
    expect(report.ok).toBe(false);
  });

  it('AC-2/AC-5: sub-floor node → node is error, report.ok false', async () => {
    active = await tempRepo({ initialized: true });
    const report = await runDoctor(active.root, {
      nodeVersion: 'v18.20.0',
      platform: 'linux',
    });
    const node = report.checks.find((c) => c.name === 'node');
    expect(node?.severity).toBe('error');
    expect(report.ok).toBe(false);
  });
});

/**
 * T4 (phase 166, AC-4, fix round): `runDoctor` — not just the MCP
 * `doctorService` seam — flags `verification.coverageMode: 'assertion'`
 * paired with a detected project language that has no assertion-mode
 * span-parsing support yet. This is the check `cadence doctor` (the CLI
 * command) must surface, since the CLI calls `runDoctor` directly and never
 * goes through `doctorService`.
 *
 * Phase 167 shipped real assertion-mode span support for python/go/rust/php
 * (previously js/ts-only), checked against the live coverage-profile
 * registry rather than a hardcoded language list (`../../src/doctor/run.ts`,
 * `checkCoverageModeLanguageSupport`) — a phase-167 doc review caught that
 * this check had originally been left hardcoded to `lang === 'js'` even
 * after all five profiles landed, which would have kept producing a false
 * "no support yet" warning for exactly the four languages the phase built
 * support for. The python-warns case below no longer applies (python now
 * has real support, like js/go/rust/php); only `unknown` (no recognized
 * marker file) still warns.
 */
describe('runDoctor — coverage-mode language support (phase 166 AC-4, phase 167 registry-driven fix)', () => {
  it('flags coverageMode:assertion paired with an unrecognized project language (no marker file)', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-lang-unknown' });
    // No package.json/pyproject.toml/go.mod/Cargo.toml/composer.json — detectProjectLanguage() → 'unknown'.

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'coverage-mode-language-support');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('warning');
    expect(check?.detail).toMatch(/coverageMode/);
    expect(check?.detail).toMatch(/assertion/);
    expect(check?.detail).toMatch(/unknown/);
    expect(check?.remediation).toMatch(/cadence config edit coverageMode/);
    // A warning must not fail the overall report.
    expect(report.ok).toBe(true);
  });

  it('does not flag coverageMode:assertion paired with a detected js project', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-lang-js' });
    await writeFile(join(active.root, 'package.json'), JSON.stringify({ name: 'demo' }));

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'coverage-mode-language-support');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('ok');
  });

  it.each([
    ['python', 'pyproject.toml', '[tool.poetry]\nname = "demo"\n'],
    ['go', 'go.mod', 'module demo\n\ngo 1.22\n'],
    ['rust', 'Cargo.toml', '[package]\nname = "demo"\n'],
    ['php', 'composer.json', JSON.stringify({ name: 'demo/demo' })],
  ])(
    'does not flag coverageMode:assertion paired with a detected %s project (phase 167: real span support now exists)',
    async (lang, markerFile, markerContent) => {
      active = await tempRepo({ initialized: true, projectName: `doc-lang-${lang}` });
      await writeFile(join(active.root, markerFile), markerContent);

      const report = await runDoctor(active.root, HEALTHY_ENV);

      const check = findCheck(report.checks, 'coverage-mode-language-support');
      expect(check).toBeDefined();
      expect(check?.severity).toBe('ok');
      expect(check?.detail).toMatch(new RegExp(lang));
    },
  );

  it('does not flag coverageMode:mention regardless of detected language', async () => {
    active = await tempRepo({ initialized: true, projectName: 'doc-lang-mention' });
    await writeCoverageMode(active.root, 'mention');
    await writeFile(join(active.root, 'pyproject.toml'), '[tool.poetry]\nname = "demo"\n');

    const report = await runDoctor(active.root, HEALTHY_ENV);

    const check = findCheck(report.checks, 'coverage-mode-language-support');
    expect(check).toBeDefined();
    expect(check?.severity).toBe('ok');
  });
});
