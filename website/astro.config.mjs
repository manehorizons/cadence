// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// GitHub project-pages base. Centralized here; a custom-domain swap is a
// two-line change (set site to the domain, base to '/').
const SITE = 'https://manehorizons.github.io';
const BASE = '/cadence';

export default defineConfig({
  site: SITE,
  base: BASE,
  integrations: [
    starlight({
      title: 'CADENCE',
      description:
        'A draft/build/settle framework for AI-assisted development with configurable quality gates.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/manehorizons/cadence' },
      ],
      customCss: ['./src/styles/theme.css'],
      // Sidebar is filled in Task 2 once synced pages exist.
      sidebar: [],
    }),
  ],
});
