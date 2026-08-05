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

## Exceptions

| Advisory ID | Package | Justification | Expiry |
| --- | --- | --- | --- |
| GHSA-5xrq-8626-4rwp | vitest | Arbitrary file read/execute via the Vitest UI server. `--ui` is never passed in this repo (`vitest.shared.ts`, CI, local scripts all run plain `vitest run`), so the vulnerable server is never started; dev-only devDependency, not shipped in any published package. Upgrade to vitest >=3.2.6 tracked separately (a major-version bump affecting `vitest.shared.ts`'s worker/timeout config across all packages). | 2026-08-13 |
| GHSA-fx2h-pf6j-xcff | vite | `server.fs.deny` bypass on Windows, transitive of `vitest`'s dev server. No `vite`/`vitest` dev server is ever exposed outside a local `pnpm test` run (no `vite preview`/serve usage in this repo); dev-only devDependency, not shipped. Resolves once the `vitest` upgrade above lands (vite is pulled in transitively). | 2026-08-13 |
| GHSA-88fw-hqm2-52qc | hono | CORS middleware reflects Origin with credentials when defaulted to wildcard; transitive of `@modelcontextprotocol/sdk`'s optional HTTP transport. This repo's MCP surface (`cadence mcp serve`) only ever uses the SDK's stdio transport (see CLAUDE.md: "MCP ... exposes the imperative loop only, over stdio") — the HTTP transport classes that pull in `hono` are never imported or instantiated, so this CORS path is unreachable in our usage. Re-check on the next `@modelcontextprotocol/sdk` bump. | 2026-08-28 |
| GHSA-r28c-9q8g-f849 | postcss | Path traversal in previous-source-map auto-loading (`sourceMappingURL`) can disclose arbitrary `.map` file contents when PostCSS parses attacker-controlled CSS without `map: false`; patched in postcss 8.5.18. Transitive of `vitest`'s dev-server toolchain (`vitest > vite > postcss`), dev-only devDependency, not shipped in any published package. No CSS files exist within this audited workspace (`packages/*`) and no code here imports `postcss` directly (verified via grep) — unreachable, and even if triggered there is no exfiltration channel (output stays local to the test run). A separate `website/` package has its own `pnpm-workspace.yaml`/lockfile outside this workspace's `packages/*` glob and is not installed or audited by this CI job; its one static, repo-authored `theme.css` is not attacker-controlled input in any case. Resolves alongside the `vitest >=3.2.6` upgrade tracked for the `vite` exception above (same transitive chain). | 2026-08-13 |
| GHSA-mh99-v99m-4gvg | brace-expansion | DoS via unbounded expansion length causing an out-of-memory crash; vulnerable <=5.0.7, patched >=5.0.8. Transitive of the ESLint toolchain (`@typescript-eslint/{eslint-plugin,parser} > typescript-estree/utils > minimatch@10.2.5 > brace-expansion@5.0.6`), dev-only devDependency, not shipped in any published package — the only place this runs is `eslint` invoked locally/in CI over source files, never on attacker-controlled input. A pre-existing `pnpm.overrides` entry for this exact package in `package.json` was previously misdiagnosed as silently dead, on the strength of a `[WARN] The "pnpm" field in package.json is no longer read by pnpm...` message. That warning is printed by a globally-installed newer pnpm launcher (e.g. v11.2.2) self-switching before it delegates to this repo's `packageManager`-pinned `pnpm@9.12.0`, which reads and applies `pnpm.overrides` from `package.json` correctly — confirmed empirically across independent runs (see `.cadence/phases/253-dependency-override-remediation/253-01-T3-EVIDENCE.md`). The real defect: the override *fired correctly* and pinned the tree to `brace-expansion@5.0.7` — but `5.0.7` is itself a vulnerable version (patched floor is `>=5.0.8`), so this was a stale override target that had never been refreshed past the pre-patch floor it was originally written against. (A *different* failure mode is also possible and is a real risk generally — an override key only fires when its selector intersects the *declared* range of the dependent requesting the package, not whatever version would naturally resolve, so a selector that drifts entirely out of that range goes silently unmatched with no error, even at debug loglevel, see `253-01-T3-EVIDENCE.md` Finding 2 — but that is not what happened to this specific entry, which was actively applying its stale target the whole time.) Phase 253 refreshed this target to the current patched floor (brace-expansion 5.x line >=5.0.9) and added `scripts/check-lockfile-overrides.mjs`, a CI detector that fails the build if any override target is ever left unsatisfied by a resolved lockfile instance again. Originally filed as `rec-20260724-012`, whose premise this correction disproves; superseded accordingly. | 2026-08-20 |
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
