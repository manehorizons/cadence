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
<!--
To add a new exception, append a row above this comment, e.g.:

| GHSA-xxxx-xxxx-xxxx | some-package | Vulnerable code path is unreachable in our usage; upstream fix tracked. | 2026-12-31 |
-->
