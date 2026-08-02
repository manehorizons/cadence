# npm scope migration: `@manehorizons` → `@thomas-powers-jr`

As of phase 250, CADENCE's npm scope is `@thomas-powers-jr`, matching the
GitHub org rename already completed in PR #360
(`https://github.com/thomas-powers-jr/cadence`). This is a **rename, not a
new project** — same packages, same code, same maintainer, new scope.

If you arrived here from an `npm install` deprecation notice on an
`@manehorizons/cadence-*` package, this page is what that notice is pointing
you at.

## The old packages are not going away

All five published `@manehorizons/cadence-*` packages remain installable and
resolvable on npm indefinitely. They will be marked **deprecated**
(`npm deprecate`), never unpublished or deleted. A deprecation notice only
adds a warning to `npm install` output and on the npm package page — it does
not break existing installs, lockfiles, or CI. There is no forced-migration
deadline.

| Old (deprecated, still resolvable) | New |
|---|---|
| `@manehorizons/cadence-core` | `@thomas-powers-jr/cadence-core` |
| `@manehorizons/cadence-types` | `@thomas-powers-jr/cadence-types` |
| `@manehorizons/cadence-host-claude-code` | `@thomas-powers-jr/cadence-host-claude-code` |
| `@manehorizons/cadence-host-codex` | `@thomas-powers-jr/cadence-host-codex` |
| `@manehorizons/cadence-host-toolkit` | `@thomas-powers-jr/cadence-host-toolkit` |

(`cadence-testkit` is `private` and was never published under either scope.)

## How to migrate

### If you depend on a `@manehorizons/cadence-*` package directly

Swap the scope in `package.json` (or wherever you install from) and
reinstall:

```sh
npm uninstall @manehorizons/cadence-core
npm install @thomas-powers-jr/cadence-core
```

Same pattern for any of the other four packages you depend on. If you use
the CLI globally:

```sh
npm uninstall -g @manehorizons/cadence-core
npm install -g @thomas-powers-jr/cadence-core
```

The package contents, CLI behavior, and version numbers are unaffected by
the rename — only the scope changed.

### If you use the Claude Code or Codex host adapter

Upgrading the CLI package alone does **not** update an already-installed
lifecycle hook — a hook CADENCE wrote into `.claude/settings.json` (or
`.codex/hooks.json`) before the rename still has the old scope baked into
its command string, and will keep working (old packages stay resolvable)
but is stale.

Two ways to refresh it:

**Automated — `cadence doctor --fix --wire-host`.** After upgrading to a
new-scope `cadence` CLI, run:

```sh
cadence doctor --fix --wire-host
```

`cadence doctor` detects a managed hook entry that still references the old
scope and reports it under the `host-hooks` check with a `host-install` fix.
That repair is classified as a **`wire-host`** action, which — like every
`wire-host` fix — is only applied when `--wire-host` is passed alongside
`--fix`. **Plain `cadence doctor --fix` will report the stale entry as
skipped and leave it unrepaired**; it will not silently fix it. This is
intentional: `--wire-host` fixes re-run a host install (a larger, more
invasive action than the other deterministic `--fix` repairs), so CADENCE
requires you to opt in explicitly rather than doing it implicitly on a bare
`--fix`. Passing `--wire-host` without `--fix` is also a no-op — both flags
are required together.

**Manual — re-run the adapter installer directly.** If you don't use
`cadence doctor`, or want to update the hook without touching anything else
`--fix` might repair, re-run the relevant host adapter's own installer:

```sh
# Claude Code
npx @thomas-powers-jr/cadence-host-claude-code install

# Codex
npx -y @thomas-powers-jr/cadence-host-codex install
```

Either path rewrites the managed hook entry with the current, new-scope
command string.

## Why this exists

Five `@manehorizons/cadence-*` packages have real (if low) download traffic,
so removal was never on the table — this doc plus the npm deprecation
notice are the whole migration path. Package contents and config schema are
unchanged; the one deliberate CLI behavior change is `cadence doctor`, which
now flags a managed hook still pointing at the old scope as stale instead of
silently accepting it — the repair command above is exactly how you clear
that warning.
