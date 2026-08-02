import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, dirname } from 'node:path';
import { tempRepo, type Fixture } from '@thomas-powers-jr/cadence-testkit';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '../../dist');
const CLI = join(DIST, 'cli/index.js');
const SERVER_MODULE = pathToFileURL(join(DIST, 'mcp/server.js')).href;
const PROBE = pathToFileURL(join(__dirname, 'fixtures/sdk-load-probe.mjs')).href;

function spawnProbed(
  nodeArgs: string[],
  cwd: string,
  outFile: string,
): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['--import', PROBE, ...nodeArgs], {
      cwd,
      env: { ...process.env, SDK_PROBE_OUT: outFile },
    });
    p.on('exit', (code) => resolve(code ?? 0));
  });
}

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('MCP SDK lazy-loading (phase 58)', () => {
  // AC-7: the MCP SDK is lazy-loaded off the CLI hot path.
  it('AC-7: `cadence progress` does not load @modelcontextprotocol/sdk', async () => {
    active = await tempRepo({ initialized: true });
    const out = join(active.root, 'sdk-loads.log');

    // Positive control: importing the server module DOES load the SDK, proving
    // the probe actually detects loads (so the negative assertion is meaningful).
    await rm(out, { force: true });
    await spawnProbed(['-e', `import(${JSON.stringify(SERVER_MODULE)})`], active.root, out);
    expect(existsSync(out)).toBe(true);
    expect(await readFile(out, 'utf8')).toMatch(/@modelcontextprotocol/);

    // The real assertion: a normal CLI command never loads the SDK.
    await rm(out, { force: true });
    const code = await spawnProbed([CLI, 'progress'], active.root, out);
    expect(code).toBe(0);
    expect(existsSync(out)).toBe(false);
  });
});
