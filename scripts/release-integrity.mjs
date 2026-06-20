#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CADENCE_SCOPE = '@manehorizons/cadence-';
const DEFAULT_ROOT = fileURLToPath(new URL('..', import.meta.url));

export function normalizeVersion(raw) {
  const version = String(raw ?? '').trim().replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid package version: ${raw}`);
  }
  return version;
}

export function extractChangelogEntry(changelog, version) {
  const normalized = normalizeVersion(version);
  const lines = String(changelog).split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${normalized}`);
  if (start === -1) {
    throw new Error(`packages/core/CHANGELOG.md has no ## ${normalized} entry`);
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (/^##\s+\S/.test(lines[i])) {
      end = i;
      break;
    }
  }

  return lines.slice(start + 1, end).join('\n').trim();
}

export function validatePackageVersions(packages, version) {
  const normalized = normalizeVersion(version);
  const mismatches = packages.filter((pkg) => pkg.version !== normalized);
  if (mismatches.length > 0) {
    throw new Error(
      `Package version mismatch for ${normalized}: ${mismatches
        .map((pkg) => `${pkg.name}@${pkg.version}`)
        .join(', ')}`,
    );
  }
}

export function buildReleaseNotes({ version, packages, changelogEntry, runUrl }) {
  const normalized = normalizeVersion(version);
  const packageList = packages.map((pkg) => `- \`${pkg.name}\``).join('\n');
  const verification = [
    '- npm publish completed with provenance in the Release workflow.',
    `- Remote tag \`v${normalized}\` is verified before the GitHub Release is created.`,
    '- npm package versions and GitHub Release metadata are verified after publish.',
  ];

  if (runUrl) {
    verification.push(`- Workflow run: ${runUrl}`);
  }

  return [
    `## Package Changelog`,
    '',
    changelogEntry,
    '',
    '## Published Packages',
    '',
    `All public packages are published on npm as \`${normalized}\`:`,
    '',
    packageList,
    '',
    '## Verification',
    '',
    verification.join('\n'),
    '',
  ].join('\n');
}

export async function discoverPublicPackages(root) {
  const packagesDir = join(root, 'packages');
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const packages = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const packageJsonPath = join(dir, 'package.json');
    let json;
    try {
      json = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    } catch {
      continue;
    }
    if (json.private === true) continue;
    if (typeof json.name !== 'string' || !json.name.startsWith(CADENCE_SCOPE)) continue;
    packages.push({ name: json.name, version: normalizeVersion(json.version), dir });
  }

  packages.sort((a, b) => a.name.localeCompare(b.name));
  if (packages.length === 0) {
    throw new Error(`No public ${CADENCE_SCOPE} packages found under ${packagesDir}`);
  }
  return packages;
}

export function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: 'utf8',
    shell: false,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(
      `${command} ${args.join(' ')} failed with exit ${result.status}${detail ? `:\n${detail}` : ''}`,
    );
  }
  return result.stdout.trim();
}

async function retry(label, fn, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts: ${lastError?.message ?? lastError}`);
}

async function readCoreVersion(root) {
  const coreJson = JSON.parse(await readFile(join(root, 'packages', 'core', 'package.json'), 'utf8'));
  return normalizeVersion(coreJson.version);
}

async function readCoreChangelogEntry(root, version) {
  const changelog = await readFile(join(root, 'packages', 'core', 'CHANGELOG.md'), 'utf8');
  return extractChangelogEntry(changelog, version);
}

function workflowRunUrl(env) {
  if (!env.GITHUB_SERVER_URL || !env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) return '';
  return `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

function assertRemoteTag(root, tag, env) {
  const output = runCommand('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`], {
    cwd: root,
    env,
  });
  if (!output.includes(`refs/tags/${tag}`)) {
    throw new Error(`Remote tag ${tag} was not found on origin`);
  }
}

function releaseExists(tag, root, env) {
  const result = spawnSync('gh', ['release', 'view', tag], {
    cwd: root,
    env,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status === 0) return true;
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (combined.includes('release not found')) return false;
  throw new Error(`gh release view ${tag} failed:\n${combined.trim()}`);
}

function upsertGitHubRelease(root, tag, title, notesFile, env) {
  if (releaseExists(tag, root, env)) {
    runCommand(
      'gh',
      [
        'release',
        'edit',
        tag,
        '--title',
        title,
        '--notes-file',
        notesFile,
        '--draft=false',
        '--prerelease=false',
        '--latest',
        '--verify-tag',
      ],
      { cwd: root, env },
    );
    return 'updated';
  }

  runCommand(
    'gh',
    ['release', 'create', tag, '--title', title, '--notes-file', notesFile, '--latest', '--verify-tag'],
    { cwd: root, env },
  );
  return 'created';
}

async function verifyNpmPackages(packages, version, root, env) {
  await Promise.all(
    packages.map((pkg) =>
      retry(`npm view ${pkg.name}`, async () => {
        const published = runCommand('npm', ['view', pkg.name, 'version'], { cwd: root, env });
        if (published !== version) {
          throw new Error(`${pkg.name} is ${published} on npm, expected ${version}`);
        }
      }),
    ),
  );
}

function verifyGitHubRelease(root, tag, env) {
  const raw = runCommand(
    'gh',
    ['release', 'view', tag, '--json', 'tagName,name,isDraft,isPrerelease,url'],
    { cwd: root, env },
  );
  const release = JSON.parse(raw);
  if (release.tagName !== tag) {
    throw new Error(`GitHub Release tagName is ${release.tagName}, expected ${tag}`);
  }
  if (release.name !== tag) {
    throw new Error(`GitHub Release name is ${release.name}, expected ${tag}`);
  }
  if (release.isDraft) {
    throw new Error(`GitHub Release ${tag} is still a draft`);
  }
  if (release.isPrerelease) {
    throw new Error(`GitHub Release ${tag} is marked prerelease`);
  }
  return release.url;
}

export async function buildReleasePlan(root = DEFAULT_ROOT, env = process.env) {
  const version = await readCoreVersion(root);
  const packages = await discoverPublicPackages(root);
  validatePackageVersions(packages, version);
  const changelogEntry = await readCoreChangelogEntry(root, version);
  const notes = buildReleaseNotes({
    version,
    packages,
    changelogEntry,
    runUrl: workflowRunUrl(env),
  });
  return { version, tag: `v${version}`, packages, notes };
}

export async function verifyNpmPublished({ root = DEFAULT_ROOT, env = process.env } = {}) {
  const plan = await buildReleasePlan(root, env);
  await verifyNpmPackages(plan.packages, plan.version, root, env);
  return plan;
}

export async function runReleaseIntegrity({ root = DEFAULT_ROOT, env = process.env, dryRun = false } = {}) {
  const plan = await buildReleasePlan(root, env);
  if (dryRun) {
    return { ...plan, action: 'dry-run', releaseUrl: '' };
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'cadence-release-'));
  const notesFile = join(tempDir, `${plan.tag}-notes.md`);
  try {
    writeFileSync(notesFile, plan.notes);
    assertRemoteTag(root, plan.tag, env);
    const action = upsertGitHubRelease(root, plan.tag, plan.tag, notesFile, env);
    await verifyNpmPackages(plan.packages, plan.version, root, env);
    assertRemoteTag(root, plan.tag, env);
    const releaseUrl = verifyGitHubRelease(root, plan.tag, env);
    return { ...plan, action, releaseUrl };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  return {
    dryRun: argv.includes('--dry-run'),
    verifyNpm: argv.includes('--verify-npm'),
    json: argv.includes('--json'),
    root: argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : DEFAULT_ROOT,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.verifyNpm) {
    const result = await verifyNpmPublished(opts);
    if (opts.json) {
      process.stdout.write(
        `${JSON.stringify({
          version: result.version,
          tag: result.tag,
          packages: result.packages.map((pkg) => pkg.name),
          action: 'verified-npm',
        })}\n`,
      );
      return;
    }
    process.stdout.write(
      `release-integrity: verified ${result.packages.length} public npm package(s) at ${result.version}\n`,
    );
    return;
  }

  const result = await runReleaseIntegrity(opts);
  if (opts.json) {
    process.stdout.write(
      `${JSON.stringify({
        version: result.version,
        tag: result.tag,
        packages: result.packages.map((pkg) => pkg.name),
        action: result.action,
        releaseUrl: result.releaseUrl,
      })}\n`,
    );
    return;
  }
  process.stdout.write(
    [
      `release-integrity: ${result.action} GitHub Release ${result.tag}`,
      `release-integrity: verified ${result.packages.length} public npm package(s)`,
      result.releaseUrl ? `release-integrity: ${result.releaseUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n') + '\n',
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(`release-integrity: ${err.message}\n`);
    process.exitCode = 1;
  });
}
