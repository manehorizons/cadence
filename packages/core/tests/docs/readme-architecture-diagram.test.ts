import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { registerAllCommands } from '../../src/cli/register.js';

// packages/core/tests/docs → repo root is four levels up.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

/** README's mermaid architecture diagram — the block this test guards. */
function readmeDiagram(): string {
  const readme = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
  const m = readme.match(/```mermaid\n([\s\S]*?)```/);
  if (!m) throw new Error('README.md: architecture mermaid block not found');
  return m[1]!;
}

/**
 * The real `VerifierProvider` union, parsed from its source declaration
 * rather than hand-duplicated — a TS type has no runtime representation to
 * import, so this reads the literal union off the `export type` line.
 */
function realVerifierProviders(): string[] {
  const src = readFileSync(
    join(REPO_ROOT, 'packages/core/src/verify/verifier-factory.ts'),
    'utf8',
  );
  const m = src.match(/export type VerifierProvider =\s*([^;]+);/);
  if (!m) throw new Error('verifier-factory.ts: VerifierProvider union not found');
  return m[1]!
    .split('|')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter((s) => s.length > 0);
}

/** The diagram's verifier-provider labels, e.g. "mock / anthropic / local / host-cli". */
function diagramVerifierProviders(): string[] {
  const diagram = readmeDiagram();
  const m = diagram.match(/Verifier providers<br\/>([^"]+)"/);
  if (!m) throw new Error('README.md diagram: verifier-providers label not found');
  return m[1]!.split('/').map((s) => s.trim());
}

/**
 * Real host-adapter packages: those under `packages/host-*` whose `src/`
 * implements the `HostAdapter` contract (event-map.ts + shim.ts per
 * CLAUDE.md's adapter-contract description). `host-toolkit` deliberately
 * lacks both — it is shared plumbing depended on by the two real adapters,
 * not itself a distinct surface — so this signal excludes it without
 * hand-maintaining an allowlist.
 */
function realHostAdapterCount(): number {
  const packagesDir = join(REPO_ROOT, 'packages');
  return readdirSync(packagesDir).filter((name) => {
    if (!name.startsWith('host-')) return false;
    const srcDir = join(packagesDir, name, 'src');
    return existsSync(join(srcDir, 'event-map.ts')) && existsSync(join(srcDir, 'shim.ts'));
  }).length;
}

function mcpServeRegistered(): boolean {
  const program = new Command();
  registerAllCommands(program);
  const mcp = program.commands.find((c) => c.name() === 'mcp');
  return Boolean(mcp?.commands.some((c) => c.name() === 'serve'));
}

describe('README architecture-diagram doc-content guard (rec-20260726-004)', () => {
  it('AC-1: diagram verifier-provider list matches the real VerifierProvider union', () => {
    const real = realVerifierProviders();
    const diagram = diagramVerifierProviders();
    expect(real.length).toBeGreaterThan(0);
    expect([...diagram].sort()).toEqual([...real].sort());
  });

  it('AC-2: diagram surface labels match the real CLI / host-adapter / MCP surfaces', () => {
    const diagram = readmeDiagram();

    // cadence CLI surface: always true (the CLI itself registers commands),
    // asserted here so a future rename of the diagram's CLI node is caught.
    expect(diagram).toMatch(/cadence CLI/);

    // Host adapters surface: exactly the packages implementing the
    // HostAdapter contract, currently Claude Code + Codex.
    const adapterCount = realHostAdapterCount();
    expect(adapterCount).toBe(2);
    expect(diagram).toMatch(/Host adapters<br\/>Claude Code \+ Codex/);

    // MCP surface: the `cadence mcp serve` command is really registered.
    expect(mcpServeRegistered()).toBe(true);
    expect(diagram).toMatch(/cadence mcp serve/);
  });
});
