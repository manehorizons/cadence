// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

// GitHub project-pages base. Centralized here; a custom-domain swap is a
// two-line change (set site to the domain, base to '/').
const SITE = 'https://thomas-powers-jr.github.io';
const BASE = '/cadence';

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [
    starlight({
      plugins: [
        starlightTypeDoc({
          entryPoints: [
            '../packages/types/src/index.ts',
            '../packages/host-claude-code/src/index.ts',
          ],
          tsconfig: './tsconfig.typedoc.json',
          output: 'api',
          sidebar: { label: 'API', collapsed: true },
          typeDoc: {
            entryPointStrategy: 'resolve',
            entryFileName: 'index',
          },
        }),
      ],
      title: 'CADENCE',
      description:
        'A draft/build/settle framework for AI-assisted development with configurable quality gates.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/thomas-powers-jr/cadence' },
      ],
      customCss: ['./src/styles/theme.css'],
      sidebar: [
        { label: 'Start Here', items: [
          { label: 'Install & overview', slug: 'start/install' },
          { label: 'Quickstart', slug: 'start/quickstart' },
          { label: 'User guide', slug: 'start/user-guide' },
        ]},
        { label: 'Concepts', items: [
          { label: 'The loop & gates', slug: 'concepts' },
          { label: 'Design decisions', slug: 'concepts/design' },
        ]},
        { label: 'Guides', items: [
          { label: 'Claude Code adapter', slug: 'guides/claude-code' },
          { label: 'Verifier providers', slug: 'guides/providers' },
          { label: 'CLI usage', slug: 'guides/cli' },
        ]},
        { label: 'Reference', items: [
          { label: 'Commands', slug: 'reference/commands' },
          { label: 'Config', slug: 'reference/config' },
        ]},
        { label: 'Contributing', items: [
          { label: 'Contributing', slug: 'contributing' },
          { label: 'Code of conduct', slug: 'contributing/code-of-conduct' },
          { label: 'Security', slug: 'contributing/security' },
          { label: 'Issue tracker', slug: 'contributing/issue-tracker' },
          { label: 'Triage labels', slug: 'contributing/triage-labels' },
          { label: 'Domain docs', slug: 'contributing/domain' },
          { label: 'Release process', slug: 'contributing/release' },
        ]},
        typeDocSidebarGroup,
      ],
    }),
  ],
});
