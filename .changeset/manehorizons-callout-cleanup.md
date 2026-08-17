---
"@thomas-powers-jr/cadence-core": patch
---

Docs: remove the `@manehorizons` → `@thomas-powers-jr` npm-scope migration callout from the three README-style entry points (`README.md`, `packages/core/README.md`, `docs/README.md`).

The scope rename shipped in phase 250; download volume on the old scope is low enough that the operator no longer wants the callout surfaced on the package's GitHub and npm landing pages. `docs/migration-npm-scope.md` (the full migration guide) is untouched — it still explains the rename to anyone who lands there directly.

While syncing these files, also fixed a stale Providers description (two of the three README-style entry points still named "OpenAI, Claude, Ollama" — none of which are real provider ids) and reconciled each entry point's doc-index list against the others, restoring the missing "Host adapters" and "Release process" links to whichever list lacked them.
