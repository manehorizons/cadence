---
'@manehorizons/cadence-core': minor
'@manehorizons/cadence-types': minor
'@manehorizons/cadence-host-claude-code': minor
'@manehorizons/cadence-host-codex': minor
---

Coverage-gate assertion mode (phase 108): an opt-in
`verification.coverageMode` that closes the test-coverage gate's
"mentioned-but-not-tested" false positive. The default `mention` mode is
unchanged — any occurrence of an `AC-N` token anywhere in a matched test file
(comments included) counts as covered.

- `verification.coverageMode: "assertion"` counts an `AC-N` token only when it
  sits inside an asserting `it()`/`test()` block. A comment-only or
  assertion-less mention is reported as a **weak link**: the gate refuses with a
  distinct "not inside an asserting it()/test() block" hint, separate from the
  plain "has no linked test" message for an entirely-absent AC, and the refusal
  names the mode.
- Span detection is a pure, dependency-free, string/comment-aware scan
  (`findTestSpans`) — no AST, no new dependency, no network; deterministic and
  offline. Parens inside a title string don't break it.
- Editable via `cadence config edit coverageMode`; documented in
  `docs/reference/config.md` and `docs/concepts.md`.

Backward-compatible: a config with no `verification.coverageMode` loads as
`mention` and behaves byte-for-byte as before. `cadence-types` carries the new
schema field; `host-claude-code` / `host-codex` carry version-alignment bumps
only.
