---
phase: mil-rec-rec-20260723-001
id: 00-00
status: PENDING
---

# 00-00 — Add Claude-Code-vs-ANTHROPIC_API_KEY distinction to the anthropic-provider mock-fallback warning

> **STAGED EXPORT — NOT YET IN THE LOOP.** Praxis wrote this from milestone
> `mil-rec-rec-20260723-001`. To promote: run `cadence spec new <phase> <num>`
> (allocates the real NN-NN id + moves the loop IDLE→SPEC), then replace
> the scaffold body with this content and re-id the frontmatter.

## Objective

The MOCK_FALLBACK_BANNER / anthropic-provider fallback warning (verifier-factory.ts) fires stderr-side at the exact moment a user hits silent mock-fallback, but says only 'ANTHROPIC_API_KEY is unset' with no hint that being logged into Claude Code doesn't satisfy this. Docs alone don't help since the user may never open them at the failure moment. Add the distinction inline to the warning text itself, mirroring the honesty-first pattern already used for MOCK_VERIFIER_NOTICE.

## Acceptance Criteria

### AC-1: The anthropic mock-fallback warning names Claude-Code login as insufficient
Given a verifier family is configured (or overridden) to `provider: anthropic`
but `ANTHROPIC_API_KEY` is unset — absent from both `env` and any `.env`
discovered at `cwd` — so `createVerifierFactory`'s anthropic branch
(`packages/core/src/verify/verifier-factory.ts` ~209-216) takes the
key-missing path,
When the factory selects a verifier and emits its single stderr warning via
`warn` before returning `spec.mock()`,
Then the warning still opens with the `${spec.label}:` prefix and still
contains the literal substring `ANTHROPIC_API_KEY is unset` (so the five
sibling-family regex assertions keep matching unchanged), AND it additionally
states that being logged into Claude Code (its OAuth/subscription session)
does NOT satisfy this requirement — the `anthropic` provider is a direct
Anthropic SDK call needing a separately API-billed `ANTHROPIC_API_KEY`, with
no visibility into Claude Code's own credential store. The byte-exact
assertion at `packages/core/tests/verify/verifier-factory.test.ts:84` is
updated to the new full string, and a test asserts the new Claude-Code
clause is present (the `AC-1` token sits inside an asserting `it()` block).

### AC-2: (decide in/out — see Open Questions) `config explain`'s provider-no-key warning carries the same distinction
Given `provider: anthropic` is set on a provider block with
`anthropicKeyPresent: false`, so `deriveWarnings`
(`packages/core/src/config-explain/build.ts` ~59-65) pushes the
`provider-no-key` warning shown by `cadence config explain`,
When `buildExplanation` renders that warning,
Then the message — in addition to today's "ANTHROPIC_API_KEY is unset — it
will silently fall back to 'mock'" text — states that a Claude Code login
does not satisfy the `anthropic` provider, mirroring AC-1's wording so the
two surfaces stay consistent, verified by a test in
`packages/core/tests/config-explain/warnings.test.ts` asserting the new
clause (the `AC-2` token inside an asserting block). This AC lands only if
the Open-Questions decision keeps `config explain` in this phase; otherwise
it is removed here and re-homed on a sibling rec.

## Constraints

- In scope: the single inline `warn(...)` literal in `createVerifierFactory`'s
  anthropic branch (`verifier-factory.ts` ~212-214). One edit propagates to
  all six verifier families (spec-review, verifier, per-task, code-review,
  plan-review, security-audit) because they share this factory and only vary
  by `spec.label`. AC-2, if kept, adds the parallel edit in
  `config-explain/build.ts` — no other source files.
- The warning string is a tested contract. `verifier-factory.test.ts:84`
  pins it **byte-exact** and MUST be updated in the same change; the sibling
  tests (`per-task.test.ts`, `code-review.test.ts`, `plan-review.test.ts`,
  `security-audit.test.ts`, `factory.test.ts`) match only the regex
  `/ANTHROPIC_API_KEY is unset/`, so that exact substring MUST survive to
  keep them green without edits.
- Do NOT touch the `local` or `host-cli` fallback warning strings, nor their
  tests. The Claude-Code confusion is specific to `anthropic`; `host-cli`
  already carries its own subscription-vs-API-key clarification (the
  quota-transparency notice, `docs/providers.md` ~352-374) covering that axis
  in the opposite direction.
- Do NOT edit or repoint `MOCK_VERIFIER_NOTICE`
  (`packages/types/src/guidance.ts`) or `MOCK_FALLBACK_BANNER`. The anthropic
  warn() is a standalone inline literal that does not render from either;
  `MOCK_VERIFIER_NOTICE` is the shared "mock = not real verification" honesty
  source with unrelated wording. Mirror its honest, plain-stderr tone — do
  not reuse or mutate the constant.
- Keep the runtime behavior identical otherwise: stderr-only (never stdout),
  exactly one warning per selection, no new env/`.env` reads, no network or
  binary probe. The change is wording only.
- Doc sync: `docs/providers.md:130` quotes the current warning verbatim as a
  fenced sample. Update that one sample so it does not display a warning that
  no longer exists. The richer explanatory callout for the anthropic section
  is deliberately owned by sibling **rec-20260723-002** (docs) — keep this
  phase to the minimal sample sync, not the full callout, to avoid colliding
  with that rec.
- Out of scope: CLAUDECODE=1 detection and any `cadence doctor` / `cadence
  activate` messaging changes — those belong to sibling **rec-20260723-003**.

## Open Questions

- **Exact wording (bikeshed).** The new Claude-Code clause should be one or
  two sentences kept terse for a stderr warning, and MUST retain the
  `ANTHROPIC_API_KEY is unset` substring for the sibling regex tests. Human
  to approve the final sentence before implementation.
- **Is AC-2 (`config explain`) in this phase or a new sibling rec?**
  rec-20260723-001's `files:` list scopes it to `verifier-factory.ts` only,
  and `config-explain/build.ts` is not owned by rec-002 (docs) or rec-003
  (doctor/activate). Options: (a) fold it in here as AC-2 for surface
  consistency (recommended — it is the diagnostic a confused user runs, and
  a trivial parallel edit with its own pure-function test), or (b) drop AC-2
  and spin a new sibling rec. Human decides; AC-2 is written so it can be
  removed cleanly if deferred.
- **Targeted string vs shared honesty variant.** Should the distinction be a
  targeted anthropic-only inline literal (recommended — the confusion is
  anthropic-specific, and `MOCK_VERIFIER_NOTICE` is about mock-is-a-placeholder,
  a different message), or should `MOCK_VERIFIER_NOTICE` gain a
  Claude-Code-aware variant reused by both surfaces?
- **Always-show vs CLAUDECODE-gated.** Show the Claude-Code line
  unconditionally (recommended — it helps even outside a session and adds no
  new detection), or only when `CLAUDECODE=1` is detected? The gated variant
  overlaps rec-20260723-003 and adds detection surface this rec deliberately
  excludes.
