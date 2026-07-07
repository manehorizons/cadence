import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve repo-root docs from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

/**
 * Portfolio-readiness doc sync (phase 161, Claude-Handoff-Doc-Sync.md).
 * Locks in the terminology sweep + accuracy fixes as a regression guard so a
 * future doc edit can't silently reintroduce the "three-surface model" / "one
 * engine, four entry points" split-heading confusion, a stale "Claude Code
 * only" claim, or an overclaimed "only surface with ambient gates" line now
 * that the Codex adapter also declares `pre-tool-edit`.
 */
describe('portfolio-readiness doc sync', () => {
  it('AC-1: README.md and docs/README.md use the canonical surface-category vocabulary', () => {
    const readme = read('README.md');
    const docsReadme = read('docs', 'README.md');
    const concepts = read('docs', 'concepts.md');

    for (const md of [readme, docsReadme]) {
      expect(md).toMatch(/one core engine and three surface categories/i);
    }
    expect(readme).not.toMatch(/three-surface model/i);
    expect(docsReadme).not.toMatch(/three-surface model/i);
    expect(readme).not.toMatch(/one engine, four entry points:/i);

    // The concepts.md → README anchor must point at the renamed heading.
    expect(concepts).toContain('README.md#one-engine-three-surface-categories');
    expect(concepts).not.toContain('README.md#three-surface-model');
  });

  it('AC-2: DESIGN.md and CONTEXT.md no longer claim Cadence is Claude-Code-only', () => {
    const design = read('DESIGN.md');
    const context = read('CONTEXT.md');

    expect(context).not.toMatch(/v1 = Claude Code only/);
    expect(context).toContain('Codex');

    // The old claim survives only inside a "Historical" callout, not as a bare assertion.
    expect(design).toMatch(/Historical \(pre-Phase 60, v1\)/);
    expect(design).toMatch(/Codex is a shipped conformance consumer/);
  });

  it('AC-3: MCP docs describe the imperative-loop-only scope via the surface-category vocabulary', () => {
    const mcp = read('docs', 'mcp.md');
    const commands = read('docs', 'reference', 'commands.md');

    expect(mcp).toMatch(/one of Cadence's three surface categories/);
    expect(mcp).not.toMatch(/This is a \*\*third surface\*\* on the single engine:/);
    expect(mcp).toMatch(/ambient edit-time gates\?/i);

    expect(commands).toMatch(/one of Cadence's three surface categories/);
    expect(commands).not.toMatch(/a third surface alongside the CLI and the Claude Code hook\nadapter/);
  });

  it('AC-4: docs/claude-code.md calls Claude Code the reference adapter, not the only one', () => {
    const claudeCode = read('docs', 'claude-code.md');
    expect(claudeCode).toMatch(/reference adapter\*\* for \*ambient\* edit-time gates/);
    expect(claudeCode).not.toMatch(/the \*\*only\*\* one that delivers/);
  });

  it('AC-5: README.md has a technical-reviewer overview with an architecture diagram', () => {
    const readme = read('README.md');
    expect(readme).toContain('## For technical reviewers');
    expect(readme).toMatch(/```mermaid/);
    // Provider labels in the diagram must match the real provider names (docs/concepts.md Providers table).
    expect(readme).toMatch(/mock \/ anthropic \/ local/);
  });

  it('AC-6: the mock-verifier warning stays prominent and release credibility is surfaced', () => {
    const readme = read('README.md');
    expect(readme).toMatch(/is \*\*not real verification\*\*/);
    expect(readme).toContain('GitHub Releases');
  });

  it('AC-7: README.md carries a portfolio-ready project summary', () => {
    const readme = read('README.md');
    expect(readme).toMatch(
      /DRAFT→BUILD→SETTLE loop with configurable quality gates to verify declared acceptance criteria/
    );
    expect(readme).toMatch(/CLI, Claude Code, Codex, or any MCP-capable host/);
  });
});
