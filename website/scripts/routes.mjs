// Single source of truth for which repo docs are published and where.
// `src` is repo-root-relative. `out` is the path under src/content/docs/
// (no extension) and also defines the site route (`/<base>/<out>/`).
// `group`/`label` drive the Starlight sidebar.
export const ROUTES = [
  // Start Here
  { src: 'README.md',                 out: 'start/install',          group: 'Start Here',  label: 'Install & overview' },
  { src: 'docs/quickstart.md',        out: 'start/quickstart',       group: 'Start Here',  label: 'Quickstart' },
  { src: 'docs/README.md',            out: 'start/user-guide',       group: 'Start Here',  label: 'User guide' },
  // Concepts
  { src: 'docs/concepts.md',          out: 'concepts',               group: 'Concepts',    label: 'The loop & gates' },
  { src: 'DESIGN.md',                 out: 'concepts/design',        group: 'Concepts',    label: 'Design decisions' },
  // Guides
  { src: 'docs/claude-code.md',       out: 'guides/claude-code',     group: 'Guides',      label: 'Claude Code adapter' },
  { src: 'docs/providers.md',         out: 'guides/providers',       group: 'Guides',      label: 'Verifier providers' },
  { src: 'docs/cli.md',               out: 'guides/cli',             group: 'Guides',      label: 'CLI usage' },
  // Reference
  { src: 'docs/reference/commands.md', out: 'reference/commands',    group: 'Reference',   label: 'Commands' },
  { src: 'docs/reference/config.md',  out: 'reference/config',       group: 'Reference',   label: 'Config' },
  // Contributing
  { src: 'CONTRIBUTING.md',           out: 'contributing',           group: 'Contributing', label: 'Contributing' },
  { src: 'CODE_OF_CONDUCT.md',        out: 'contributing/code-of-conduct', group: 'Contributing', label: 'Code of conduct' },
  { src: 'SECURITY.md',               out: 'contributing/security',  group: 'Contributing', label: 'Security' },
  { src: 'docs/agents/issue-tracker.md', out: 'contributing/issue-tracker', group: 'Contributing', label: 'Issue tracker' },
  { src: 'docs/agents/triage-labels.md', out: 'contributing/triage-labels', group: 'Contributing', label: 'Triage labels' },
  { src: 'docs/agents/domain.md',     out: 'contributing/domain',    group: 'Contributing', label: 'Domain docs' },
];

// Build a Map from repo-relative src path -> route info, for link rewriting.
export function routeIndex(routes = ROUTES) {
  return new Map(routes.map((r) => [r.src, r]));
}
