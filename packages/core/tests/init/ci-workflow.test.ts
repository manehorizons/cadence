import { describe, it, expect } from 'vitest';
import {
  renderCiWorkflowYaml,
  parseGitHubOwnerRepo,
  renderBranchProtectionRecipe,
} from '../../src/init/ci-workflow.js';

describe('renderCiWorkflowYaml', () => {
  it('embeds the install command and the verify phase --changed invocation', () => {
    const yaml = renderCiWorkflowYaml('pnpm install --frozen-lockfile');
    expect(yaml).toContain('pnpm install --frozen-lockfile');
    expect(yaml).toContain('cadence verify phase --changed --base');
    expect(yaml).toContain('on:\n  pull_request:');
  });
});

describe('parseGitHubOwnerRepo', () => {
  it('parses an https origin URL', () => {
    expect(parseGitHubOwnerRepo('https://github.com/manehorizons/cadence.git')).toEqual({
      owner: 'manehorizons',
      repo: 'cadence',
    });
  });

  it('parses an ssh origin URL', () => {
    expect(parseGitHubOwnerRepo('git@github.com:manehorizons/cadence.git')).toEqual({
      owner: 'manehorizons',
      repo: 'cadence',
    });
  });

  it('returns null for a non-GitHub remote', () => {
    expect(parseGitHubOwnerRepo('https://gitlab.com/foo/bar.git')).toBeNull();
  });
});

describe('renderBranchProtectionRecipe', () => {
  it('substitutes the resolved owner/repo and branch', () => {
    const recipe = renderBranchProtectionRecipe({ owner: 'manehorizons', repo: 'cadence' }, 'main');
    expect(recipe).toContain('repos/manehorizons/cadence/branches/main/protection/required_status_checks');
    expect(recipe).toContain("--method PATCH -f 'contexts[]=cadence-verify'");
  });

  it('falls back to a placeholder when owner/repo is unresolvable', () => {
    const recipe = renderBranchProtectionRecipe(null, 'main');
    expect(recipe).toContain('repos/<owner>/<repo>/branches/main');
  });
});
