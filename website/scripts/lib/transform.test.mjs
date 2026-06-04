import { describe, it, expect } from 'vitest';
import { extractTitle, rewriteLinks, toFrontmatter } from './transform.mjs';

describe('extractTitle', () => {
  it('pulls the first H1 as the title and strips it from the body', () => {
    const { title, body } = extractTitle('# CADENCE Concepts\n\nIntro line.\n', 'docs/concepts.md');
    expect(title).toBe('CADENCE Concepts');
    expect(body).toBe('\nIntro line.\n');
  });

  it('throws, naming the file, when there is no H1', () => {
    expect(() => extractTitle('no heading here\n', 'docs/broken.md')).toThrow(/docs\/broken\.md/);
  });
});

describe('toFrontmatter', () => {
  it('emits YAML frontmatter escaping the title', () => {
    expect(toFrontmatter('Issue tracker: GitHub')).toBe(
      '---\ntitle: "Issue tracker: GitHub"\n---\n',
    );
  });

  it('escapes embedded double-quotes and backslashes in the title', () => {
    expect(toFrontmatter('A \\ "quoted" title')).toBe(
      '---\ntitle: "A \\\\ \\"quoted\\" title"\n---\n',
    );
  });
});

describe('rewriteLinks', () => {
  const base = '/cadence';
  const opts = { sourcePath: 'docs/concepts.md', base };

  it('rewrites a sibling .md link to a base-aware route', () => {
    const out = rewriteLinks('See [config](reference/config.md).', opts);
    expect(out).toBe('See [config](/cadence/reference/config/).');
  });

  it('preserves a trailing #anchor on a rewritten link', () => {
    const out = rewriteLinks('See [gates](concepts.md#gates).', opts);
    expect(out).toBe('See [gates](/cadence/concepts/#gates).');
  });

  it('resolves ../ links relative to the source file directory', () => {
    const out = rewriteLinks('Back to [readme](../README.md).', opts);
    expect(out).toBe('Back to [readme](/cadence/start/install/).');
  });

  it('leaves external links and pure anchors untouched', () => {
    const md = '[site](https://example.com) and [top](#intro)';
    expect(rewriteLinks(md, opts)).toBe(md);
  });

  it('leaves non-.md links (code paths, assets) untouched', () => {
    const md = 'Run [the script](scripts/publish-proof.mjs).';
    expect(rewriteLinks(md, opts)).toBe(md);
  });

  it('does NOT rewrite links inside fenced code blocks', () => {
    const md = '```\n[config](reference/config.md)\n```\n';
    expect(rewriteLinks(md, opts)).toBe(md);
  });

  it('throws on a .md link whose target is not a published route', () => {
    expect(() => rewriteLinks('[internal](../CLAUDE.md)', opts)).toThrow(/CLAUDE\.md/);
  });

  it('leaves image links untouched even when they point at a .md', () => {
    const md = '![diagram](concepts.md)';
    expect(rewriteLinks(md, opts)).toBe(md);
  });

  it('preserves an inline title attribute when rewriting a .md link', () => {
    const out = rewriteLinks('[cfg](reference/config.md "Config ref").', opts);
    expect(out).toBe('[cfg](/cadence/reference/config/ "Config ref").');
  });
});
