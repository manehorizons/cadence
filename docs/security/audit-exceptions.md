# npm audit exceptions

CI runs `scripts/check-audit-exceptions.mjs` (`.github/workflows/security.yml`,
`audit` job) on every push, pull request, and the weekly security schedule.
That script runs the audit itself — via a pinned modern pnpm through
`corepack` rather than this repo's own pinned `pnpm@9.12.0`, since `pnpm
audit` under 9.12.0 hits npm's retired legacy audit endpoint (410 Gone —
pnpm/pnpm#11265; see the script's own comments for detail) — and cross-checks
any high or critical advisory it reports against the table below.

**Policy:** any high or critical advisory that is not listed in the table
below, or that is listed but whose `Expiry` date has passed, fails CI. To
accept a specific advisory temporarily, add a row with a justification and a
firm expiry date — do not add open-ended exceptions. When the expiry
arrives, the exception lapses automatically (the advisory starts failing
CI again) and must be re-justified or the underlying dependency must be
upgraded. Renewing an exception past its original expiry requires naming
*why the underlying fix slipped* (a link to what's blocking it) — restating
the original justification verbatim is not a valid renewal.

Advisory ids are the GHSA id (e.g. `GHSA-xxxx-xxxx-xxxx`) or, if GitHub has
not assigned one yet, the npm advisory id reported by `pnpm audit`. Expiry
dates are ISO 8601 (`YYYY-MM-DD`).

## Deferred: vitest major-version upgrade

The `vitest`, `vite`, and `postcss` rows below all trace back to one
package, `vitest` (`vite` and `postcss` are pulled in as its own transitive
dependencies). Note the target version is **not** simply "`>=3.2.6`": that
floor patches the vitest UI-server advisory (`GHSA-5xrq-8626-4rwp`) itself,
but PR #235's own investigation (below) found it insufficient for the
vite/postcss chain — 3.x still transitively resolved a vulnerable
`vite@5.4.21`. The real target proven to close all three in this monorepo's
toolchain is `vitest ^4.1.10` (a major, 2→4 jump — `website/` already runs
`vitest ^4.1.8` successfully). That upgrade is out of scope for phase 254
— it touches `vitest.shared.ts`'s shared worker/timeout/coverage config
consumed by all six `packages/*` workspaces and warrants its own dedicated
phase, not a drive-by dependency bump.

There is prior art, and it is not directly reusable: PR #235
(`chore/security-vitest-and-transitive-bump`) attempted this exact bump
(landing on `vitest ^4.1.10` for precisely the 3.2.6-is-insufficient reason
above) but is stale (branched from `main` on 2026-07-18, before a large
volume of subsequent work) and was closed by the repo owner on 2026-08-04.
One implementation choice within that PR — adding `vite` as an explicit
direct devDependency because it claimed `pnpm.overrides` doesn't work in
this setup — rested on a premise phase 253
(`.cadence/phases/253-dependency-override-remediation/`) has since
disproved empirically: the override mechanism fires correctly, the real
defect was stale override *targets*, not a broken mechanism. Do not reopen,
cherry-pick from, or rebase that branch as-is — its vitest/vite/hono
version targets and breakage fixes are still useful reference, but its
override-workaround approach needs replacing with a proper override entry
before it lands. A future phase must redo the vitest 2→4 (`>=^4.1.10`, not
`>=3.2.6`) upgrade from a current `main`, scoped properly, before these
three exceptions can be permanently closed rather than merely re-justified.

Each of the three rows below was independently re-verified against this
repo's current state on 2026-08-04 (see each row's justification for what
was actually checked) and its expiry extended to **2026-11-02** — a 90-day
window from that re-verification date, clearing this phase's 2026-08-12
deadline with roughly three months of margin for a future phase to land the
upgrade properly, rather than an arbitrarily short window that would just
force another rubber-stamp-adjacent renewal first.

## Exceptions

| Advisory ID | Package | Justification | Expiry |
| --- | --- | --- | --- |
| GHSA-5xrq-8626-4rwp | vitest | Arbitrary file read/execute via the Vitest UI server, reachable only when the process is started with `--ui`. Re-verified 2026-08-04 by grepping every place a vitest invocation could add that flag: `vitest.shared.ts` (the single shared config all six `packages/*` workspaces merge — no `--ui`), every `packages/*/package.json` `test` script (types, testkit, host-claude-code, host-codex, host-toolkit, core — all six run plain `vitest run`), the root `package.json` (`turbo run test`, delegating to the same six scripts), `website/`'s separate-workspace `test` script (also plain `vitest run`), and every CI workflow that runs tests (`.github/workflows/ci.yml`, `docs.yml`, `release.yml` — each invokes `pnpm test` / `pnpm turbo run typecheck lint test`, no vitest flags); no shell script anywhere in the repo passes `--ui` either. The vulnerable UI server is never started. `pnpm-lock.yaml` resolves a single instance, `vitest@2.1.9`, a dev-only devDependency not shipped in any published package. The vitest advisory itself patches at `>=3.2.6`, but the full chain (including the vite/postcss rows below) requires `vitest >=4.1.10` per PR #235's own finding; the real target is tracked as a deferred blocker above ("Deferred: vitest major-version upgrade"), not silently dropped. | 2026-11-02 |
| GHSA-fx2h-pf6j-xcff | vite | `server.fs.deny` bypass on Windows via vite's dev server, transitive of `vitest` (`pnpm-lock.yaml` shows `vitest@2.1.9` depends directly on `vite@5.4.21`, resolved to a single instance). Re-verified 2026-08-04 by grepping the whole repo (root, every `packages/*` workspace, and `website/`) for `vite preview`, `vite serve`, `vite dev`, and any raw `"vite ..."` script entry — none exist anywhere; the only invocation of vite in this repo is the implicit one inside plain `vitest run`, where vitest uses vite purely for in-process module transformation (middleware mode) — no dev server is ever exposed on a listening port. `website/`'s `dev`/`preview` scripts run Astro (`astro dev` / `astro preview`), not vite directly, and in any case `website/` is its own pnpm workspace (`website/pnpm-workspace.yaml`, `website/pnpm-lock.yaml`) outside the root `pnpm-workspace.yaml`'s `packages/*` glob — the audit CI job's `pnpm install --frozen-lockfile` (`.github/workflows/security.yml`, root-level) never installs it. Dev-only devDependency, not shipped in any published package. Resolves once the vitest upgrade lands (see "Deferred: vitest major-version upgrade" above). | 2026-11-02 |
| GHSA-88fw-hqm2-52qc | hono | CORS middleware reflects Origin with credentials when defaulted to wildcard; transitive of `@modelcontextprotocol/sdk`'s optional HTTP transport. This repo's MCP surface (`cadence mcp serve`) only ever uses the SDK's stdio transport (see CLAUDE.md: "MCP ... exposes the imperative loop only, over stdio") — the HTTP transport classes that pull in `hono` are never imported or instantiated, so this CORS path is unreachable in our usage. Re-check on the next `@modelcontextprotocol/sdk` bump. | 2026-08-28 |
| GHSA-r28c-9q8g-f849 | postcss | Path traversal in previous-source-map auto-loading (`sourceMappingURL`) can disclose arbitrary `.map` file contents when PostCSS parses attacker-controlled CSS without `map: false`; patched in postcss 8.5.18, resolves here to `8.5.14` (single instance in `pnpm-lock.yaml`), pulled in transitively only via `vite@5.4.21`'s own dependency on `postcss` (chain: `vitest > vite > postcss`). Re-verified 2026-08-04 by grepping every `packages/*` workspace for `.css` files and for direct `postcss` imports/requires: the only `.css` files present are `packages/*/coverage/{base,prettify}.css`, gitignored static assets auto-generated by the v8 coverage HTML reporter — never parsed by PostCSS and never attacker-controlled; no `packages/*/package.json` declares `postcss` as a dependency and no `src`/`tests` file imports it. `website/` remains a wholly separate pnpm workspace/lockfile (see the vite row above for the grep confirming it isn't installed by the audit CI job); its one static, repo-authored `website/src/styles/theme.css` is still not attacker-controlled input either way. Unreachable, and even if triggered there is no exfiltration channel (output stays local to the test run). Dev-only devDependency, not shipped in any published package. Resolves alongside the vitest upgrade (see "Deferred: vitest major-version upgrade" above). | 2026-11-02 |
<!--
To add a new exception, append a row above this comment, e.g.:

| GHSA-xxxx-xxxx-xxxx | some-package | Vulnerable code path is unreachable in our usage; upstream fix tracked. | 2026-12-31 |
-->

## Known CI configuration discrepancies (not audit exceptions)

- `.github/workflows/docs.yml:44` pins `pnpm/action-setup@v4`, while every
  other workflow that sets up pnpm (`ci.yml`, `release.yml`, and both jobs
  in `security.yml`) pins `@v6`. This is a real, minor version-pin drift —
  not a CVE, so it does not belong in the exceptions table above — noted
  here for visibility. Not fixed as part of phase 253 (out of scope); see
  `rec-20260805-001`.
