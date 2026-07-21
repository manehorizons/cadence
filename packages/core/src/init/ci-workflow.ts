/** Renders `.github/workflows/cadence-verify.yml` for `cadence init --ci`. */
export function renderCiWorkflowYaml(installCommand: string): string {
  return `name: cadence-verify
on:
  pull_request:
jobs:
  cadence-verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: ${installCommand}
      - run: npx cadence verify phase --changed --base "\${{ github.event.pull_request.base.sha }}"
`;
}

export interface OwnerRepo {
  owner: string;
  repo: string;
}

const GITHUB_REMOTE_RE = /github\.com[:/]([^/]+)\/([^/.]+?)(\.git)?$/;

/** Parse a `git remote get-url origin` value (https or ssh form) into owner/repo, or null if not GitHub. */
export function parseGitHubOwnerRepo(remoteUrl: string): OwnerRepo | null {
  const m = GITHUB_REMOTE_RE.exec(remoteUrl.trim());
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]! };
}

/**
 * The `gh api` branch-protection recipe printed (never executed) after
 * `cadence init --ci` writes the workflow — matches the repo's
 * "refuse + suggest, never silently mutate" convention for anything
 * touching shared/branch-protected state.
 */
export function renderBranchProtectionRecipe(ownerRepo: OwnerRepo | null, defaultBranch: string): string {
  const target = ownerRepo ? `${ownerRepo.owner}/${ownerRepo.repo}` : '<owner>/<repo>';
  return `To require this check on your default branch, run:
  gh api repos/${target}/branches/${defaultBranch}/protection/required_status_checks \\
    --method PATCH -f 'contexts[]=cadence-verify'
`;
}
