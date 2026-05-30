import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CADENCE_CLI = join(__dirname, '..', '..', 'dist', 'cli', 'index.js');
const PKG = join(__dirname, '..', '..', 'package.json');

function run(args: string[]): Promise<{ stdout: string; code: number }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [CADENCE_CLI, ...args]);
    let stdout = '';
    p.stdout.on('data', (d) => (stdout += d.toString()));
    p.on('exit', (code) => resolve({ stdout, code: code ?? 0 }));
  });
}

describe('cadence --version', () => {
  it('reports the version from package.json (guards against hardcoded drift)', async () => {
    const version = (JSON.parse(readFileSync(PKG, 'utf8')) as { version: string }).version;
    const r = await run(['--version']);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe(version);
  });
});
