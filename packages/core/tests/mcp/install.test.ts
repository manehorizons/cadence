import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tempRepo, type Fixture } from '@manehorizons/cadence-testkit';
import { bufferIO } from '../../src/services/io.js';
import { mergeMcpConfig, mcpSnippet, installMcpConfig } from '../../src/mcp/install.js';

let active: Fixture | null = null;
afterEach(async () => {
  if (active) {
    await active.cleanup();
    active = null;
  }
});

describe('mcp install — pure merge (phase 78)', () => {
  // AC-2: non-destructive + idempotent merge
  it('AC-2: creates fresh, preserves other servers, and is idempotent', () => {
    const fresh = JSON.parse(mergeMcpConfig(null));
    expect(fresh.mcpServers.cadence).toEqual({ command: 'cadence', args: ['mcp', 'serve'] });

    const withOther = JSON.stringify({
      mcpServers: { other: { command: 'x', args: [] } },
      someTopLevel: true,
    });
    const merged = mergeMcpConfig(withOther);
    const parsed = JSON.parse(merged);
    expect(parsed.mcpServers.other).toEqual({ command: 'x', args: [] }); // preserved
    expect(parsed.mcpServers.cadence).toBeDefined();
    expect(parsed.someTopLevel).toBe(true); // unknown top-level key preserved

    // idempotent: merging the result again yields identical bytes
    expect(mergeMcpConfig(merged)).toBe(merged);
  });

  // AC-3: malformed input throws (caller must not overwrite)
  it('AC-3: malformed or non-object JSON throws', () => {
    expect(() => mergeMcpConfig('{ not json')).toThrow(/not valid JSON/);
    expect(() => mergeMcpConfig('[1,2,3]')).toThrow(/must be a JSON object/);
  });
});

describe('mcp install — service (phase 78)', () => {
  // AC-1: default writes/merges project .mcp.json
  it('AC-1: creates .mcp.json with the cadence server', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    const res = await installMcpConfig(active.root, {}, io);
    expect(res.exitCode).toBe(0);
    const written = JSON.parse(await readFile(join(active.root, '.mcp.json'), 'utf8'));
    expect(written.mcpServers.cadence).toEqual({ command: 'cadence', args: ['mcp', 'serve'] });
  });

  // AC-2: idempotent on disk
  it('AC-2: a second run leaves the file byte-identical', async () => {
    active = await tempRepo({ initialized: true });
    const path = join(active.root, '.mcp.json');
    await installMcpConfig(active.root, {}, bufferIO());
    const first = await readFile(path, 'utf8');
    await installMcpConfig(active.root, {}, bufferIO());
    expect(await readFile(path, 'utf8')).toBe(first);
  });

  // AC-3: malformed existing file aborts without writing
  it('AC-3: malformed .mcp.json aborts without overwriting', async () => {
    active = await tempRepo({ initialized: true });
    const path = join(active.root, '.mcp.json');
    await writeFile(path, '{ broken', 'utf8');
    const io = bufferIO();
    const res = await installMcpConfig(active.root, {}, io);
    expect(res.exitCode).toBe(1);
    expect(await readFile(path, 'utf8')).toBe('{ broken'); // untouched
  });

  // AC-4: --print writes nothing
  it('AC-4: --print emits the snippet and writes no file', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    const res = await installMcpConfig(active.root, { print: true }, io);
    expect(res.exitCode).toBe(0);
    expect(existsSync(join(active.root, '.mcp.json'))).toBe(false);
    expect(io.stdout()).toContain('"cadence"');
    expect(io.stdout()).toBe(mcpSnippet() + '\n' + 'Add to .mcp.json in your project root (Claude Code reads it automatically).\n');
  });

  // AC-4: a non-claude-code client is print-only too
  it('AC-4: --client cursor writes nothing', async () => {
    active = await tempRepo({ initialized: true });
    const io = bufferIO();
    const res = await installMcpConfig(active.root, { client: 'cursor' }, io);
    expect(res.exitCode).toBe(0);
    expect(existsSync(join(active.root, '.mcp.json'))).toBe(false);
    expect(io.stdout()).toContain('.cursor/mcp.json');
  });
});
