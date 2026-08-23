# @thomas-powers-jr/cadence-types

## 1.66.0

### Minor Changes

- 3be42f8: Add: a pack manifest schema, a local pack resolver, and a `cadence doctor` check reporting whether each enabled pack actually resolves — with **zero behavioral effect on gate computation**. This is slice 1 of the packs arc (`docs/packs-design.md`): it proves invariants I-1, I-2, and I-4a are expressible and enforced at the type/resolution layer while nothing anywhere in `gatesFor` or `effectiveGateSet` reads a pack yet. Nothing about which gates fire, for any profile × tier, changes in this release.

  `@thomas-powers-jr/cadence-types` gains `PackManifestZ`, the inferred `PackManifest` type, `PACK_ID_GRAMMAR`, and `isValidPackId`. A pack id follows a single `<scope>/<name>` grammar mirroring npm scoping (internal packs use the `cadence` scope; `@scope/name` is reserved for third-party packs later, with no special-casing — I-1). The manifest schema is `.strict()` at every level, so it fails closed on any unrecognized key rather than silently ignoring it, and it deliberately has no `remove`, `override`, or `set` key anywhere — a pack's `gates[]` entries carry an `add` array and nothing else, so there is no loosening shape to leave unenforced by mistake (I-2/I-3, `dec-20260822-018`). `isValidPackId` is exported separately because a config-supplied id never passes through `PackManifestZ` (that validates the manifest's own `id` field, a different string), so a resolver needs a way to reject a malformed `packs.enabled` entry _before_ it reaches a filesystem path join.

  `@thomas-powers-jr/cadence-core` gains `resolvePacks(repoRoot, config)` and its `ResolvedPack` result type. Resolution is local-only — `.cadence/packs/<id>/pack.json`, project-local, git-tracked, zero network (D-AR; registry/remote sources are an explicit non-goal for this whole arc). It never throws: a missing file, malformed JSON, a schema-validation failure, and a grammar-invalid id each come back as a per-pack `{ id, source, error }` result, and one pack's failure never blocks another's resolution. Ids appearing in both `packs.enabled` and `packs.disabled` are excluded entirely before resolution — disabled wins, the tighten-only principle (D-AQ). `source` is assigned by the resolver, never self-declared by the manifest, so a pack cannot make a self-authorizing claim about its own provenance.

  The new `packs` doctor check surfaces all of this to the operator. Zero enabled packs reports `ok` with no warning, as does a list whose ids are all disabled; when every enabled pack resolves it reports `ok` naming each one. Any unresolved pack makes it `warning` — never `error` — with a detail that names **both** the unresolved ids with their reasons and the ids that did resolve. The warning severity is deliberate and recorded as a two-phase plan in `dec-20260822-025` / `docs/packs-design.md` §6 D-AR: nothing consumes packs behaviorally yet, so an unresolved pack breaks nothing today, and escalating it to a hard settle-time refusal is the job of the later slice that actually makes packs behaviorally consumed (following v1.64.0's "fail loud instead of passing every gate vacuously" precedent). The check is classified `manual` for `cadence doctor --fix` and carries no `fixId`: fabricating a manifest would invent content the operator never authored, and dropping the id from `packs.enabled` would silently disable exactly what they installed it to get.

  Closes `rec-20260822-009`.

- d295ceb: Add: a pack's `skillAudit.required` is now a **real behavioral contributor** to the skill-audit check, with per-requirement provenance recorded in `SUMMARY.json` — and an enabled pack that fails to resolve now refuses settle instead of being silently ignored. This is slice 2 of the packs arc (`docs/packs-design.md`), the first slice where a resolved pack does anything. Gate computation is still untouched: `gatesFor`/`effectiveGateSet` remain free of any `packs/` import, proven by the structural no-coupling test phase 290 added — a manifest's `gates[].add` deltas are still slice 3.

  `runSkillAuditCheck` (`@thomas-powers-jr/cadence-core`) now unions each successfully-resolved enabled pack's `skillAudit.required` into `effectiveRequired` alongside `config.skillAudit.required` and the DRAFT's `requiredSkills`. A pack-declared required skill that telemetry never recorded as invoked refuses `cadence settle run` exactly like a config-declared one, honors the same `--allow-skill-audit-miss` bypass, and takes the same warn path when skill telemetry is off. The null-config path is unchanged: when config fails to load, resolved packs contribute nothing and settle still computes the narrower set without enforcing it, so no repo gains a false refusal from this release.

  `@thomas-powers-jr/cadence-types` gains an additive, optional `provenance: { skill, source }[]` on both `CadenceStateZ.skillAudit` and `SummaryZ`'s `skillAudit` object — `.optional()` with no `.default(...)`, mirroring the `coverageScheme`/`providerSelection` precedent, so a pre-slice-2 `SUMMARY.json` still parses with the key genuinely absent and its content hash still verifies after a schema round-trip. `source` is `config`, `draft`, or `pack:<id>`, and entries are per (skill, source) pair rather than collapsed: a skill required by both config and a pack yields two entries, so the record says where each requirement actually came from instead of erasing it (D-AS).

  An enabled-but-unresolvable pack is now a hard settle-time refusal. The new `checkUnresolvablePacks` (`packages/core/src/checks/pack-resolution.ts`) is a sibling of the skill-audit check, dispatched explicitly by settle and deliberately outside the `Gate` enum and the profile × tier matrix — enabling a pack _is_ the opt-in, so there is no gate to switch on. It runs before the skill-audit check, so settle refuses on the right grounds rather than computing a skill-audit "pass" from a pack whose manifest never loaded. The refusal names each unresolvable id with its reason and is bypassable only via the new dedicated `cadence settle run --allow-unresolvable-pack`, which records the bypass as a real `SUMMARY.gateBypasses` entry (gate `pack-resolution`, severity `warn`) — unlike `--allow-skill-audit-miss`, which only ever emits a `bypassed: true` warn anomaly and never reaches `gateBypasses`.

  Because packs are now behaviorally consumed, `cadence doctor`'s `packs` check escalates from slice 1's deliberate `warning` to `error`, completing the two-phase plan `dec-20260822-025` / `docs/packs-design.md` §6 D-AR recorded up front. An unresolved enabled pack silently drops enforcement the operator installed it to get and will refuse their next settle, so doctor no longer reports that repo as healthy. Zero enabled packs, an all-disabled list, and a fully-resolving set are all still `ok`, and an unloadable `config.json` still degrades to `ok` rather than double-reporting what `checkInitialized` already flags. The check remains `manual` for `cadence doctor --fix` with no `fixId`.

  Closes `rec-20260822-010`.

## 1.65.0

## 1.64.0

## 1.63.0

## 1.62.0

### Minor Changes

- abbde33: Fix: a `files:` declaration containing a wildcard (e.g. `.changeset/*.md`) now actually matches the files it describes, in both `warn` and `block` `boundaryEnforcement` modes.

  `runBoundaryCheck` previously compared declared `files:` entries against touched files via exact `Set` membership — no glob expansion at all, so a wildcard entry could never match anything. Under dispatch-scoped `block` mode this produced a hard, surprising refusal on correctly-scoped work; in `warn` mode it produced a spurious `files-outside-boundary` anomaly even when the touched file was exactly what the pattern was written to cover.

  Declared entries containing `*` are now glob-expanded using the same matcher CADENCE's own coverage scanner already relies on (`globToRegExp`/`toMatcher`, extracted to a shared `packages/core/src/util/glob.ts` — no new runtime dependency). Literal (non-wildcard) declared entries are untouched and remain byte-identical to prior behavior — only entries containing `*` are routed through the new matcher.

  A declared wildcard entry that matches zero touched files now surfaces a new, additive, advisory-only anomaly (`boundary-pattern-unmatched`, `@thomas-powers-jr/cadence-types`) printed by `cadence build task` at `severity: 'warn'` — hardcoded and structurally unable to escalate to a block-mode refusal (it is returned from a separate function, never merged into `runBoundaryCheck`'s own result, and wired into exactly one call site). A literal declared entry matching zero touched files stays silent exactly as before, since that is the ordinary, common case (a task declares three files and touches two of them).

  Closes `rec-20260815-005`.

## 1.61.1

## 1.61.0

## 1.60.0

### Minor Changes

- 3d99185: Makes the dispatch contract enforceable at record time, closing the 2026-07-18 deja incident's three recommendations. A new optional `stop:` DRAFT task field renders as a `**Stop condition:**` packet line, and `cadence draft check` warns (never blocks) when a task declares `files:` with no `stop:`. `cadence build task <id> --status=DONE` now runs a boundary + redundancy check at record time from real git diffs rather than agent self-report: a stray file outside the task's declared `files:` refuses the recording (exit 1, no mutation) once `boundaryEnforcement` resolves to `block`, unless `--allow-boundary-breach` is passed (records anyway, emits an error-severity anomaly). Independent of that config field, one task recorded with `--execution dispatch` escalates boundary enforcement to `block` for the rest of the phase and never de-escalates. `--isolation` and `--model-class` round out the new recording flags; all three carry through to `SUMMARY.json` on settle when present. Fully additive: no `schemaVersion` bump, no `.default()` on any new field, and the existing settle-time `boundary-scan` gate is unchanged.
- 06d8790: `cadence dispatch plan` now computes an advisory execution verdict per task — `{ execution: 'inline'|'dispatch', modelClass, model, reasons[] }` — giving `config.subagentPolicy` and `config.modelPerClass` their first consumer. A new optional `class:` DRAFT task field (`TaskZ.class`) lets an operator declare a task's execution class; a pure heuristic cross-checks it and a mismatch surfaces as a `cadence draft check` coherence warning. `--json` output gains the new per-task fields plus a top-level `signals.contextUtilization` (always `null` for now — no real context-utilization signal is wired in yet). The rendered dispatch packet gains an `**Execution:**` line (and a `**Model:**` line when dispatched). Fully additive: no `schemaVersion` bump, no change to existing fields, and `dispatch plan` remains read-only/advisory only — it does not spawn, schedule, or supervise agents.

## 1.59.0

## 1.58.0

## 1.57.0

### Minor Changes

- c582da3: `deep-verify` and `per-task-verify` now persist the provider/model identity that actually ran them into a settle's `gates[]` array — previously neither gate recorded any identity there at all (unlike `code-review`/`security-audit`), so an operator reading `SUMMARY.json` had no way to tell whether either had run under a real verifier or the `mock` placeholder.

  The new fields — `observedProvider`, `observedModel`, and (for `per-task-verify`) `taskId` — are structurally separate from the existing `provider`/`model` fields on `GateProvenanceZ`, so `deriveAssuranceRecord`'s assurance rollup, which folds `gates[].provider`/`.model` by field name, stays completely blind to them. This is deliberate: this repo's own verifiers already run as `host-cli` (non-mock), so naively feeding `deep-verify`'s and `per-task-verify`'s identity into the existing rollup fields would silently inflate `assurance.overall` toward `strong` on ordinary settles where no review gate actually ran. The safety property is proven by tests on the existing fold code, not by adding a new exclusion branch to it.

  `per-task-verify` never previously appeared in `gates[]` at all — it runs during BUILD, not settle. Settle now synthesizes one entry per task carrying a persisted `PerTaskVerifyRecord`, prepended to the front of the array (per-task-verify's work completed before this settle's own gate loop starts, and prepending preserves the existing convention — used throughout this repo's test suite — that the _last_ entry in `gates[]` is the gate that most recently ran or refused during this settle).

  All three new fields are additive and `.optional()` with no default and no `schemaVersion` bump — absent on every historical `SUMMARY.json`, and `computeSummaryContentHash` is unaffected.

- 4901a00: `cadence resume` now warns when `state.json`'s `session.lastHandoff` pointer names a `SESSION-*.md` file that no longer exists. Previously `locateFreshestHandoff` silently fell back to the freshest-by-`generated_at` doc in `.cadence/handoff/` with no signal that the pointer was dangling, so a stale-but-plausible doc could read as authoritative. The warning names both the missing pointer filename and the doc actually served, and is rendered as its own message distinct from the existing loop-position drift banner, on both the `cadence resume` CLI text surface and the `resumeService`/MCP `CommandIO` surface.

  `ResumeResult` (`@thomas-powers-jr/cadence-types`) gains an additive, optional `danglingHandoffPointer` field carrying the missing pointer's filename when this fires. Absent on every normal resolution path (no pointer ever set, or the pointer names a file that exists).

- 492a388: `settle run --deep` no longer refuses (or requires `--force`) on an Acceptance Criterion whose satisfaction condition is structurally circular — it depends on the very `SUMMARY.md`/`SUMMARY.json` that settle produces, which doesn't exist until after the deep-verify pass that would need to observe it. A new pure classifier (`classifyAcObservability`) detects this narrow shape from an AC's Given/When/Then text and routes it to a distinct `unobservable` verdict instead of an ordinary `fail`. `unobservable`-marked ACs are excluded from deep-verify's offenders list, the evidence-floor gate, and the force-used honesty report's `deep:` bucket — but never rolled up as a pass, and never allowed to move `assurance.overall` toward `strong`. `SUMMARY.md` and the CLI's summary-render surface render such ACs distinctly from both PASS and FAIL, carrying the classifier's reason, so an operator can tell "wasn't checked because it structurally can't be" from "checked and failed."

  `DeepVerdictZ` (`@thomas-powers-jr/cadence-types`) gains an additive, optional `unobservable` boolean field. Absent on every historical `SUMMARY.json` and on every AC this classifier doesn't flag; `computeSummaryContentHash` is unaffected. The classifier defaults to `observable` on any ambiguity — a false negative is just an ordinary `fail`, while a false positive would silently excuse a real failure, so every trigger pattern is narrow and structural (case-sensitive `SUMMARY` token, quote-scope and negation-scope guards) rather than a broad keyword sweep.

## 1.56.0

### Minor Changes

- ca61066: Added `providerSelection` to persisted gate provenance, distinguishing three previously-indistinguishable states behind a `provider: 'mock'` entry: a deliberately **configured** provider (including a deliberately configured `mock`), a silent **fallback** to mock (at selection time in `createVerifierFactory` — a missing `ANTHROPIC_API_KEY`, unset `local` base URL/model, or a verifier family with no `host-cli` builder wired — or at call time in `wrapWithFallback`'s Proxy catch, e.g. a `host-cli` spawn failure), and an **empty-diff** observation for `code-review`/`security-audit` specifically, where a real (non-mock) provider was called but `touchedFiles` was non-empty while the diff was empty, so the call was structurally unable to judge anything. A fallback anywhere in a gate run wins over a success later in the same run (any-fallback-wins, not last-write-wins).

  `GateProvenanceZ.providerSelection` is a new optional enum (`'configured' | 'fallback' | 'empty-diff'`) with no `.default(...)` and no `schemaVersion` bump — additive, matching the precedent set by `coverageScheme`/`coverageMode` (phase 239): every historical `SUMMARY.json` still parses and content-hashes identically (verified against all 275 existing records in this repo's own corpus, 38 of which carry a stored hash).

  Persisted for five of the seven verifier seams: `code-review`, `security-audit` (lifted onto the `gates[]` entry the same way `provider`/`model` already are) and `spec-review`, `ui-spec-review`, `plan-review` (threaded into their convergence-sidecar JSON). `deep-verify` and `per-task-verify` are deliberately excluded — neither persists any provider identity into `gates[]` today, and this repo's own `perTaskVerifier`/`verifier` providers are already `host-cli`; adding baseline persistence to either as a side effect here would grow `deriveAssuranceRecord`'s `verifierRollup` with real `host-cli` entries on ordinary auto-profile settles, silently moving `assurance.overall` toward `strong` with no review gate having actually run — the exact false-confidence failure this field exists to make visible elsewhere. See `docs/providers.md` for the full breakdown and a corpus-wide query command.

### Patch Changes

- 04a38d0: Rendered provider labels now precisely convey what the `mock` verifier does and does not check, and — when the underlying gate provenance carries Phase 263's `providerSelection` — whether a `mock` entry was a deliberate choice, a silent fallback, or (for any provider) an empty-diff judgment that could not evaluate anything.

  Affected surfaces: `cadence summary render`, the on-disk `<id>-SUMMARY.md` sidecar, `cadence doctor`'s verification-readiness warnings, `cadence config explain`'s provider warnings, and the phase-243 fallback banners. All five now source their wording from one single-sourced formatter (`formatVerifierRollupLabel`) and a new `MOCK_VERIFIER_CAPABILITY` constant, so the wording can't drift across renderers the way the pre-existing duplicated literal previously allowed.

  Display layer only: the `mock` provider identity, `provider`/`providerSelection` JSON fields, `AssuranceRecordZ`/`GateProvenanceZ` schema, `deriveAssuranceRecord`'s derivation logic, and `contentHash` verification are all unchanged. `MOCK_VERIFIER_NOTICE` (the pre-existing activation-nudge wording) is untouched — the new constant is a neutral sibling, not a replacement.

## 1.55.0

## 1.54.0

### Minor Changes

- 8b42ff4: Renamed the npm scope to `@thomas-powers-jr` across all five published
  packages, matching the GitHub org rename in #360. This is a rename of
  existing software on its existing 1.x version lineage, not a new product —
  consistent with the standing pre-v2.0.0 semver policy.

  The previously-published packages under the old scope are not deleted —
  they stay resolvable and get `npm deprecate`d with a pointer to the new
  scope, as a separate operator-run step after this release. See
  [docs/migration-npm-scope.md](../docs/migration-npm-scope.md) for the full
  migration path, including the exact `cadence doctor --fix --wire-host`
  command that repairs an existing consumer's host-adapter hook install.

  `cadence doctor`'s host-hooks and `cadence config explain`'s warnings both
  now distinguish a hook entry that's missing entirely from one that's
  present but still pointing at the old scope — previously both cases
  reported the same "not found" message, which was factually wrong for the
  second case.

## 1.53.0

### Minor Changes

- c27bcb0: `code-review` findings are now criteria-anchored (Phase 235, `rec-20260727-004`
  / `rec-20260727-005`): every finding is tagged with how strongly it ties back
  to something the phase's DRAFT actually declared, on a four-tier ladder —
  `executable` > `structured` > `declared` > `undeclared` — resolved by a new
  pure `resolveAnchor` (`packages/core/src/verify/anchor.ts`). A finding whose
  best anchor resolves to `undeclared` is a **criteria gap**: diff work no
  acceptance criterion and no boundary covers.

  `GateProvenanceZ`-adjacent `SummaryZ` gains an additive `AnchorZ` peer schema
  (`{ kind: 'ac' | 'boundary' | 'none', ref?, tier }`, deliberately independent
  of the existing `AcEvidenceZ` ladder — the two rank different things) and
  `FindingZ` gains an optional `anchor` field. Both are purely additive: a
  pre-phase-235 `SUMMARY.json` with no `anchor` on any finding still parses
  unchanged.

  A criteria gap adds **no new refusal path and no new bypass flag** — a gap
  finding flows into the exact same finding stream `code-review` already
  refuses on, so a HIGH-severity gap refuses through the pre-existing
  HIGH-finding contract (`dec-20260729-005`); gap count and severity
  distribution are declared to stderr unconditionally, independent of whether
  the gate passes, refuses, or is bypassed (`dec-20260729-006`). `GATE_ORDER`
  and every gate's pass/refuse semantics for pre-existing finding classes are
  unchanged. Scope is deliberately narrow — only `code-review` is
  criteria-anchored; `spec-review`, `ui-spec-review`, and `plan-review` are
  untouched (`dec-20260729-003`).

  Three limitations were filed rather than papered over. The first —
  `executable` not being reachable in a real settle, because `SettleContext`
  exposed no prior-gate provenance to a single gate (`rec-20260729-002`) — is
  **resolved by phase 241 in this same release**, so it never reaches a
  published version; see that entry for the fix. The other two remain open:
  anchoring is resolved per-file rather than per-finding, so an uncovered
  defect in an otherwise-covered file can be missed (`rec-20260729-003`); and a
  boundary string that merely contains a finding's filename as a substring can
  mask a real gap by granting `declared` tier too broadly (`rec-20260729-005`).

- 5cc4085: Findings now carry a stable identity (Phase 236, `rec-20260727-006`): `FindingZ`
  gains additive `id`, `target: 'artifact' | 'verification'`, `disposition: 'open'
| 'accepted' | 'waived' | 'fixed' | 'superseded'`, and `waiver: { expiry }`
  fields. `id` is a pure content hash over `(file, normalized message)` —
  deliberately never a line number, so the same finding keeps the same `id`
  across settles even after an unrelated edit shifts which line it sits on
  (`packages/core/src/verify/finding-identity.ts`). `anchor`/`severity` are
  accepted as parameters for call-site compatibility but do not participate in
  the hash (Phase 245 narrowed the formula from an original `(file, anchor.kind,
anchor.ref, severity, normalized message)`, after independent review found
  both anchor and severity can legitimately change across settles for the same
  underlying defect). A
  `waiver` is only valid when `disposition === 'waived'`, enforced by a
  cross-field schema refine — a waiver with no expiry is a belief masquerading
  as knowledge, and an orphaned waiver on a non-waived finding is never valid.
  `AnchorZ.kind` widens to also accept `'invariant'`, unused by any producer yet
  (a follow-on phase's scope).

  The `code-review` verifier's persisted findings (`gates/code-review.ts`) now
  carry this identity: `id`, `target: 'artifact'`, and a default
  `disposition: 'open'`, alongside their existing §7.1 anchor tag. This required
  converging code-review's previously-local 3-severity `Finding`/`FindingSeverity`
  type onto the shared, persisted 4-severity `Finding` from `@manehorizons/cadence-types`
  (`rec-20260727-006`'s design-doc decision D9 — "one `Finding` type,
  discriminated by `target`"). `CodeReviewFinding`/`CodeReviewFindingSeverity`
  remain available from `packages/core/src/contracts/index.ts` as backward-compat
  aliases of the now-shared type — `CodeReviewFindingSeverity` correspondingly
  widens from `'high' | 'medium' | 'low'` to the full `'critical' | 'high' |
'medium' | 'low'` union, though no code-review provider constructs `'critical'`
  today.

  `RecommendationSourceZ` gains a `'review'` member (`rec-20260727-011`), so a
  future phase that routes code-review findings into the recommendation ledger
  can carry real provenance instead of mislabeling them `manual`/`cadence`.

  All schema changes are purely additive — every pre-phase-236 `SUMMARY.json`
  still parses unchanged. This phase is deliberately schema-and-computation
  only: findings-to-ledger auto-routing (creating `Recommendation` + `Evidence`
  entries from findings during settle) is **not** implemented here — that
  behavioral work is split to a follow-on phase, recorded inline in
  `.cadence/ROADMAP.md`'s Phase 236 entry.

- 7ddc72a: Identified code-review findings now route into the recommendation ledger at
  settle time (Phase 242, `rec-20260731-003`) — the behavioral half Phase 236
  deliberately deferred. Each finding that carries a stable `Finding.id` (Phase
  236 identity) becomes a `Recommendation` with `source: 'review'`, linked to a
  `cadence-artifact` `Evidence` entry whose `path` is that settle's
  `<draftId>-SUMMARY.json` and whose `summary` names the phase id, draft id, and
  SUMMARY `contentHash`. Routing is keyed on `Finding.id`, so a re-settle of an
  unchanged phase never mints a duplicate entry for a finding already routed,
  and one freshly-minted `scoutId` covers a whole settle's batch rather than one
  per finding. Findings with no stable id (e.g. `security-audit`, which has no
  identity wired in yet) are skipped, never force-routed.

  `RecommendationZ` gains an optional `sourceFindingId` (the dedup key), and
  `addRecommendation` gains optional `source` and a structured `cadence-artifact`
  evidence override — both backward compatible; every existing caller keeps
  today's `source: 'manual'`, free-text-evidence behavior unchanged. Two or more
  findings that collide on identity within one settle (`rec-20260731-001`'s
  known collision — same file/anchor/severity/normalized-message, no occurrence
  discriminant) merge into a single `Recommendation` rather than mint one entry
  with no trace of the duplicates or _N_ separate entries for one id; per
  `dec-20260731-001`, the identity hash itself is untouched — the merge records
  the occurrence count explicitly in the entry's evidence/summary text.

  A new `recommendations.autoRoute` config field (`boolean`, default `true`,
  alongside the existing `autoArchive`) gates the step. Like the existing
  retro-digest and auto-archive steps, routing is best-effort: a failure (e.g. a
  ledger write error) never blocks or fails settle, and always prints a stderr
  notice rather than failing silently. This is a settle-time writer only — no
  new gate, no `GATE_ORDER` change, and no refusal semantics; every existing
  gate's pass/refuse verdict is byte-for-byte unchanged. Disposition mutation
  (accept / waive / fix / supersede) still has no CLI surface — that stays a
  follow-on phase's scope, per Phase 236's own boundary.

- 3b95218: Settle can now tell a `mock`-verified `code-review`/`security-audit` gate
  from a real-provider one — closing CADENCE's sole surviving P0 (Phase 232,
  `rec-20260727-001`). Previously `CodeReviewResult`/`SecurityAuditResult`
  computed `provider`/`model` in memory but discarded both before persistence,
  so a SUMMARY could record only _that_ a review ran, never _what_ ran it.

  `GateProvenanceZ` gains optional `provider`/`model` fields, populated only
  for the `code-review` and `security-audit` gate entries (every other gate's
  entry is unchanged). `GateFlags` gains an internal `verifierIdentity` field
  that gate implementations use to report this identity generically — the
  gate registry merges it onto the persisted provenance entry by flag
  presence, not by gate name, so no gate-specific special-casing was needed
  to express it.

  This is a SUMMARY shape change, so `SummaryZ.schemaVersion` moves from the
  literal `1` to `1 | 2`: writers now emit `2`; readers still accept
  pre-existing `1` records unchanged. A SUMMARY written by a genuinely newer
  Cadence (an unrecognized higher `schemaVersion`) now reports a distinct
  "written by a newer Cadence" diagnostic instead of a generic parse/corruption
  error, mirroring Phase 223's `contentHash` "unverifiable" precedent.

  No `GATE_ORDER` changes, no gate pass/refuse behavior changes, no new
  refusals — this is purely provenance the record was silently dropping.

- cfe582a: Every settle now derives and reports one whole-run **assurance record** —
  a durable answer to "how strongly was this settle actually verified?"
  (Phase 233, `rec-20260728-001`). Composed from the per-gate verifier identity
  persisted in Phase 232 plus the existing per-AC evidence-class ladder
  (`ai-verified > executed > assertion > mention > unverified`), it makes a
  settle whose gates all ran under `mock` visibly different, in the durable
  record, from one verified for real.

  `SummaryZ` gains an optional `assurance` field: `verifierRollup` (one entry
  per distinct `(provider, model)` pair observed across gate provenance),
  `evidenceTally` (an exhaustive count over all five evidence classes), and
  `overall` (`'strong' | 'mixed' | 'weak' | 'unverified'`, a single
  deterministic label). The derivation (`deriveAssuranceRecord`) is a pure
  function of the gate-provenance array and the AC-evidence array only — no
  gate-specific special-casing was needed to express it, clearing this phase's
  binding tripwire and leaving the door open for further kernel/verifier/
  consumer boundary work.

  `assurance` is reported only: it adds no gate, no refusal path, and no
  bypass flag, and settle's pass/refuse outcome is byte-for-byte unchanged.
  It is covered by Phase 223's settle-time content hash, so a post-settle
  hand-edit to it is caught by `cadence summary verify` exactly like any other
  field, and it is surfaced as an `## Assurance` section in both
  `cadence summary render` and the `SUMMARY.md` sidecar.

- bff35bf: `cadence settle` now detects when it is actually executing through a
  `cadence` binary that resolves OUTSIDE the current repo checkout, despite
  that repo having its own local build (`rec-20260729-001`). This is the exact
  bug confirmed on phases 233/234: a stale globally-installed `cadence` binary
  silently shadowed the checkout's own `packages/core/bin/cadence.cjs`,
  producing a downgraded `schemaVersion: 1` SUMMARY with no `assurance`
  record — and the two binaries reported an _identical_ `--version` string on
  the unreleased branch, so version comparison can't catch it.

  Detection (`detectForeignCadenceBinary`, `packages/core/src/services/
settle.ts`) is a pure, unit-tested function: is the realpath of the binary
  actually executing this settle located inside the repo's own toplevel, given
  that the repo is recognizably CADENCE's own monorepo (`packages/core/bin/
cadence.cjs` + `.cadence/` both present at its root). An ordinary consumer
  project settling via a globally-installed `cadence` is never a false
  positive — that gate is what keeps this narrow.

  On a mismatch, settle prints a loud stderr banner ("SETTLING VIA A FOREIGN
  CADENCE BINARY", `buildForeignBinaryBanner` — same shape/placement
  convention as the existing `MOCK_FALLBACK_BANNER`) naming both paths and
  suggesting the fix, and `SummaryZ` gains an optional `foreignBinaryMismatch`
  field (`{ runningBinaryPath, repoToplevel }`) recording the same provenance
  on the written SUMMARY so the condition is auditable from the artifact alone.
  Like `assurance` (phase 233), this is reported only — no gate, no refusal
  path, no bypass flag; settle still completes normally either way. The field
  is genuinely absent (never `false`/`null`) on a matched invocation, which is
  the common/correct case.

  This guard only runs in code that contains it, so it could not have caught
  233/234 themselves, and it will not catch a settle run through an
  already-published `cadence` binary that predates this release — it protects
  settles going forward, once operators are actually running a build that
  includes this fix.

## 1.52.0

### Minor Changes

- 90e3ed9: Closed the phase-attributable AC coverage collision (phase 239). Nothing in a
  settled phase's artifacts previously recorded which phase a test belonged to:
  the `test-coverage` gate searched every `packages/**/*.test.ts` for the bare
  `AC-N` token, so any past phase's `AC-3` satisfied every future phase's
  `AC-3` (AC ids restart at `AC-1` every phase);
  meanwhile `cadence verify phase`'s replay scoped its re-scan to only the files
  the DRAFT declared, which chronically under-declares and produced false
  "drifted" verdicts against phases whose tests genuinely still pass.

  A new opt-in `verification.coverageScheme` config field (`"bare"` | `"phase-qualified"`,
  schema default `"bare"`) closes both. Under `"phase-qualified"`, an `AC-N`
  token must carry its phase-slice prefix (`239-01/AC-3`) to count as coverage
  evidence — a bare or foreign-phase token no longer satisfies the gate, and
  every refusal names the exact expected token. `cadence verify phase` drops
  file-scoping entirely for a phase-qualified SUMMARY and instead matches by
  that phase's own qualified token across the configured `verification.testGlobs`,
  so an under-declared DRAFT no longer produces false drift. A phase
  settled before the scheme existed has no phase-attributable evidence at all;
  its replay now reports every AC `indeterminate` with `drift: false` rather
  than asserting a verdict it cannot substantiate.

  The field defaults to `"bare"` for every existing config (including one that
  predates this field) — this is a two-layer default: `defaultConfig` itself
  holds `"bare"` so `loadConfig`'s config.json-over-`defaultConfig` merge never
  silently flips an upgraded consumer, and only a fresh `cadence init` writes
  `"phase-qualified"` explicitly. Existing consumers on `@manehorizons/cadence-core@1.51.1`
  are fully unaffected until they opt in via `cadence config edit coverageScheme`.
  `SUMMARY.json` gains additive, optional `coverageScheme`/`coverageMode` fields
  recording which scheme produced a settle's evidence; `cadence verify coverage
--explain` reports per-occurrence whether a token satisfies the configured
  scheme.

- 127a06b: **BREAKING (engine floor): minimum supported Node.js raised from `>=20` to
  `>=22`.** Node 20 reaches its scheduled end-of-life in April 2026, and Phase
  238 retires the Node 20 CI/test leg across the monorepo (see
  `.cadence/phases/238-drop-node20-support/`) — these packages are no longer
  tested against, or guaranteed to work on, Node 20 or 21. Shipped as a minor
  bump rather than major, matching the precedent set by the Zod v3→v4 upgrade
  (`[1.4.0]`): no external adopters are affected at release time, and CADENCE
  is reserving its first major/2.0.0 release for when the full coupling of
  Cadence is complete.

  Every published package's `package.json` now declares
  `"engines": { "node": ">=22" }`. Consumers still on Node 20 or 21 should
  upgrade their Node.js runtime before installing or running any package at
  this version or later — by default, npm and pnpm only _warn_ on an
  `engines` mismatch (this repo does not set `engine-strict`), but CI
  pipelines or environments with `engine-strict` enabled will fail outright,
  and pipelines pinned to Node 20 should bump their Node version to keep
  using the `cadence` CLI, either host adapter, or
  `@manehorizons/cadence-types`.

- d7d4239: `SUMMARY.json` gets a settle-time content hash, closing the "hand-edited
  SUMMARY renders faithfully as if it were genuine" gap (rec-20260724-006).

  - `Summary` (types) gains an optional, additive `contentHash: { algorithm:
'sha256'; value: string }` field — existing SUMMARY.json records without
    it keep parsing unchanged.
  - `cadence settle run` now computes a sha256 digest over a canonical
    (deep, stable-key-order) stringification of the settled summary and
    attaches it before writing `SUMMARY.json`/`SUMMARY.md`. Both `cadence
summary render` and the settle-time `SUMMARY.md` sidecar display it.
  - New `cadence summary verify <phase> <num>` recomputes the digest and
    reports `MATCH`, `MISMATCH` (non-zero exit — the stored hash doesn't
    match the content, i.e. the file was edited after settle), or `NO_HASH`
    (a pre-phase-223 or refused-settle record, reported cleanly rather than
    a false pass).

  This is detection only, not signing — self-signing in the same trust
  domain as the artifact's author isn't meaningfully stronger than a hash.
  Full cryptographic signing with an external trust root is deferred to
  rec-20260726-001, gated on the parked MCP/hooks/host-adapter/verifier/
  ledger threat-model rec (mil-rec-rec-20260712-016). See dec-20260726-001
  for the full rationale.

## 1.51.1

### Patch Changes

- 655663e: Unify the five Praxis intelligence ledgers (recommendations, evidence,
  assumptions, decisions, milestones) onto one shared read/write/id-minting
  module (`intelligence/store/ledger.ts`) instead of five independently
  hand-rolled implementations, so a safeguard added for one subject — like
  phase 219's cross-ledger id-collision check, previously recommendations-only
  — now applies to all four minting subjects (recommendations, evidence,
  assumptions, decisions) instead of needing to be re-patched per subject.
  Each subject's existing read/write/mint function names and signatures are
  unchanged (thin wrappers over the shared primitives); bespoke per-subject
  logic (recommendation promotion/archive/unarchive, decision supersession)
  stays subject-specific rather than being forced into one generic shape.

  Also fixes a real gap this refactor surfaced: `milestones.json` was the only
  one of the five ledger files not written with `{ mode: 0o600 }`.

  `cadence intelligence audit`/`reconcile`/`stats` now include milestones as a
  fifth ledger: a new `orphan-milestone` finding kind catches a milestone
  referencing a recommendation id that no longer exists in either the live or
  archived recommendation arrays (a reference to a merely-archived, still
  `unarchive`-recoverable recommendation is correctly NOT flagged).

  `cadence recommendation/decision/assumption list`'s `--sort-by`/
  `--filter-regex`/`--filter-regex-flags` validation is now one shared
  pipeline instead of three independently maintained copies — behavior and
  error wording are unchanged.

  `cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
  version-alignment bumps only; none of the three changed.

- e05922e: Fix `cadence recommendation add`'s id-minting to cross-check `evidence.json`
  (phase 219, rec-20260724-013). `nextRecommendationId` previously derived the
  next `rec-YYYYMMDD-NNN` id only from `recommendations.json`, so a dangling
  `evidence.json` row left behind by a bad rebase-conflict resolution or an
  interrupted `add` call — a `recommendationId` reference with no matching
  `recommendations.json` entry — could silently collide with a freshly minted
  id for an unrelated recommendation. The minted id is now guaranteed strictly
  greater than both the `recommendations.json` max and the max
  `recommendationId` referenced by `evidence.json` for the same date prefix.

  Also adds a new `orphaned-evidence` `cadence doctor` check that surfaces any
  `evidence.json` row whose `recommendationId` has no matching
  `recommendations.json` entry, naming the evidence id and the missing
  recommendation id — so this class of drift is caught immediately instead of
  surviving unnoticed.

  `cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
  version-alignment bumps only; none of the three changed.

- 1f70e66: Extracts the logic host-claude-code and host-codex duplicated into a new
  shared package, `@manehorizons/cadence-host-toolkit`:

  - The hook-event routing algorithm's shape and the slash-command catalog
    (`COMMANDS`) now live in `host-toolkit/src/routing.ts`. Both adapters
    render their slash commands from this one catalog, which fixes a real
    drift bug: host-codex's local copy had silently lost `cadence-dispatch`'s
    `DISPATCH_DIALOGUE` body. Host-codex's own `mapEvent`/`extractPayload`/
    `routeHookEvent` stay local — its `apply_patch`-based extraction is
    genuinely different from host-claude-code's `file_path`-based extraction,
    not just duplicated; only the structurally-identical `RouteResult` type is
    shared.
  - `install.ts`'s managed-marker merge logic and `locate-self.ts` are also
    extracted into the toolkit, with one shared test suite; both adapters'
    own `install.ts`/`locate-self.ts` are now thin wrappers.
  - Core now enforces a new `HostCapabilities.agentIdentification` flag: a
    host that declares it cannot supply `agentId`/`agentType` (Codex, whose
    hook payload shape doesn't document one) causes core to notice loudly on
    stderr instead of silently behaving as if no subagent were involved.
    Codex's CLI now embeds its declared capabilities into the real hook
    payload it sends to `cadence hook`, so the check is live end-to-end, not
    just testable in isolation.

  No CLI-facing behavior, flags, or exit codes changed for either adapter —
  this is an internal dedup/extraction plus one new loud-notice-on-a-capability-
  gap fix, not a rewrite. `HostAdapter`'s public contract is unchanged.

## 1.51.0

### Minor Changes

- a24506d: Adds a `gates.evidenceFloor` gate that refuses `cadence settle run --auto` when any AC's `PASS` verdict rests on evidence ranked below a configured floor on the Phase 140 evidence ladder (`ai-verified` > `executed` > `assertion` > `mention` > `unverified`), closing the enforcement gap left when that ladder shipped visibility-only. Preset defaults: `solo` → `assertion`, `team` / `production` → `executed`; the schema-level default stays `mention` for back-compat. `ai-verified` is reachable only via an explicit config override — no preset defaults to it, since it is structurally unreachable while the active `deep-verify` provider is `mock`, and the refusal now names that specific reason instead of the generic below-floor message.

  A named, per-AC, reason-required bypass (`--evidence-floor-bypass <AC-id:reason>` on `settle run`) exempts exactly the named AC and is recorded in `SUMMARY.gateBypasses` — never a blanket, phase-wide bypass.

  Closes rec-20260724-001 (re-filed P0 from the 2026-07-24 external audit, enforcement half of the assurance-levels gap first raised in the v1.47.0 audit).

- 621f87f: Close the trust envelope: extend the MCP tool-trust enforcement added in phase 181 to `cadence_settle`. Phase 181 classified `cadence_settle` as capability class `SETTLE` and allowed `cadence mcp trust grant --tool cadence_settle` to succeed, but deliberately left the tool itself ungated — an MCP call to `cadence_settle` ran immediately with no trust check. It is now wrapped with the same trust-envelope pre-check as the two `APPROVAL_BYPASS` tools (`cadence_draft_approve`, `cadence_spec_approve`): a call with no valid, matching, unexpired grant is refused — naming the failing check — before `settleService` runs, so no `state.json`/`SUMMARY.{json,md}` write occurs and the loop position is unchanged. A valid grant, issued via `cadence mcp trust grant --tool cadence_settle` on a real terminal, lets the call proceed exactly as before. The shared enforcement function is renamed `enforceApprovalBypassGrant` → `enforceGatedToolGrant` to reflect that it now gates three tools, not two. Closes rec-20260724-005.

## 1.50.0

### Minor Changes

- 42deb4b: Adds `cadence next`, a read-only command that answers "what now?" deterministically from live loop state at any position — 1-3 ranked legal moves with exact commands, plus a stable `--json` contract (`{schemaVersion: 1, position, remainingTasks, blockedOn, legalMoves[]}`) for agent orchestrators. Sourced from an extended `nextAction()` (`packages/core/src/progress.ts`), which now also computes ranked `legalMoves[]` alongside its existing `{command, reason}` shape — strictly additive; `cadence progress` and `cadence quickstart` are unchanged. Closes rec-20260721-002.

  Registers `/cadence-next` as the 15th Claude Code slash command and the matching Codex prompt command (both host adapters share the `COMMAND_GUIDANCE` catalog in `@manehorizons/cadence-types`).

  Also narrows `cadence status --json` and `cadence quickstart --json`'s `next` field to `{command, reason}` explicitly — both were passing `nextAction()`'s full return through unnarrowed, so the new `legalMoves[]` array would otherwise have silently leaked into those two commands' existing public JSON contracts (mirrors the narrowing `cadence progress` already had).

- 6e774d5: Adds an opt-in `<id>-UI-SPEC.md` artifact, sibling to the existing pre-DRAFT `SPEC.md`, for a phase that touches UI surfaces. `cadence spec new --ui` scaffolds it with a fixed shape — per-component `Layout & Tokens` and `Precedent References` nested under each `### <Component>`, plus a whole-slice `Responsive & Interaction` section — so a design contract can be locked down before DRAFT tasks are written, closing rec-20260711-004.

  `cadence spec approve` runs a new convergent `ui-spec-review` gate after the existing `spec-review` gate, only when a sibling UI-SPEC is present: same `nextConvergence` primitive, its own `<id>-UI-SPEC-REVIEW.json` sidecar, its own unconditional `ui-spec-review-unconverged` anomaly, and its own independent `--allow-ui-spec-review-failure` bypass flag. `cadence draft new` seeds an approved UI-SPEC's content into a new `## UI Contract` DRAFT section (bold-text rendering, no nested headings) between Acceptance Criteria and Tasks.

  No new loop position and no `state.json` schema change — opt-in purely by the UI-SPEC file's own presence, the same pattern the SPEC stage itself uses. The new `uiSpecReview` config key is wired into `cadence config explain` and `cadence activate` alongside the other six provider blocks.

## 1.49.0

### Patch Changes

- `cadence-types` carries a version-alignment bump to stay in lockstep with
  `cadence-core`, `cadence-host-claude-code`, and `cadence-host-codex`; no
  functional change.

## 1.48.0

### Patch Changes

- `cadence-types` carries a version-alignment bump to stay in lockstep with
  `cadence-core`, `cadence-host-claude-code`, and `cadence-host-codex`; no
  functional change.

## 1.47.0

### Patch Changes

- `cadence-types` carries a version-alignment bump to stay in lockstep with
  `cadence-core`, `cadence-host-claude-code`, and `cadence-host-codex`; no
  functional change.

## 1.46.0

### Minor Changes

- 3e9319e: Add `cadence retro`, a read-only cross-phase rollup over every settled phase's post-settle retro artifact (`.cadence/phases/*/*-RETRO.json`). It aggregates gate-bypass names, rough-task statuses, and code-review/security-audit/boundary-scan finding categories across all scanned phases, splitting each dimension into a **recurring** bucket (2+ phases) and a **one-off** bucket (exactly 1 phase) so friction that keeps showing up isn't buried under single-occurrence noise. Supports `--format terminal|json` (default `terminal`), mirroring `cadence intelligence stats`'s format-flag and exit-code conventions; never writes to `state.json`, `STATE.md`, or any phase artifact. `@manehorizons/cadence-types` gains additive `RetroRollupZ`, `PhaseRetroEntryZ`, `RetroFrequencyEntryZ`, and `RetroFrequencyBucketsZ` schemas (and their inferred types) backing the rollup shape. Fulfils rec-20260712-002.

### Patch Changes

- 42dc58f: Fix `--allow-auto-complex` soft-cap overrides being invisible in `SUMMARY.json` and the real-time anomaly-notify transport. Settling a phase under the auto×complex soft cap with `--allow-auto-complex` now records a `{ gate: 'soft-cap', flag: '--allow-auto-complex', severity: 'warn' }` entry in `SUMMARY.json`'s `gateBypasses`, and `cadence draft approve --allow-auto-complex` now emits a new `auto-complex-override` `AnomalyEvent` through the anomaly-notify transport (mirroring `coherence-warn`) when the `anomaly-notify` gate is active. `@manehorizons/cadence-types` gains the additive `'auto-complex-override'` value on `AnomalyTypeZ`.

## 1.45.0

### Minor Changes

- 90364bb: Add an MCP tool-trust envelope constraining `cadence_draft_approve` and `cadence_spec_approve` — the two MCP tools where the tool call itself previously acted as the approval, with no expiry, capability scope, or revoke logic. Each of the 18 registered MCP tools is now tagged with a `capabilityClass` (`READ_ONLY` | `LEDGER_WRITE` | `LOOP_WRITE` | `APPROVAL_BYPASS` | `SETTLE`); the two `APPROVAL_BYPASS` tools now refuse (naming the failing check, before any `state.json` write) unless the caller holds a trust grant that matches the tool's live structural def-hash (name + description + inputSchema), was issued for the running CADENCE version, and has not expired. Grants are issued exclusively via a new CLI-only command family — `cadence mcp trust grant --tool <name> [--ttl-days <n>]`, `cadence mcp trust revoke --tool <name>`, `cadence mcp trust list` — never reachable from any MCP tool call, so an MCP client can never self-grant approval-bypass trust. Grants are stored in a new operator/machine-local `.cadence/mcp-trust.json` ledger (gitignored, not shared repo state like `state.json`). `cadence_settle` is classified `SETTLE` but deliberately left ungated this phase. See `docs/concepts.md`'s new "MCP tool-trust envelope" section and `docs/reference/commands.md`'s `mcp trust` entries for full detail.

## 1.44.1

### Patch Changes

- e38d86a: Add optimistic concurrency to `SimpleStateBackend.commit()` to prevent lost updates when two `cadence` state writers (CLI commands, hooks, or the MCP server) race on `.cadence/state.json` in the same checkout — the actual failure mode behind a recent incident where two concurrent Claude Code sessions in one primary checkout stomped each other's uncommitted work. `CadenceState` gains a `revision: number` field (additive, `.default(0)`, back-compat with pre-existing `state.json` files). `commit()` now compares the current on-disk revision to the caller's in-memory `state.revision` before writing: a match bumps it in place and writes as before; a mismatch refuses with a new `StateConflictError` (naming both revisions) instead of silently overwriting the other writer's change, unless the new `{ force: true }` option is passed (which overwrites unconditionally and warns loudly to stderr). A bootstrap write (no existing `state.json`) skips the check entirely. The in-place revision bump means a caller issuing several sequential `commit()` calls on the same in-memory object — e.g. a hook handler with two independent write branches — stays in sync automatically without re-reading between calls.
- 6fc52bd: Add a post-settle retro artifact and an interactive GitHub issue offer (rec-20260712-001). On every successful `cadence settle`, a friction digest — gate bypasses, tasks whose terminal status wasn't a clean `DONE`, and any code-review/security-audit/boundary-scan findings — is synthesized purely from the SUMMARY data already assembled and written as `<draftId>-RETRO.json`/`.md` alongside `SUMMARY.json`/`.md` (a clean settle writes a "No friction detected this settle." form). `@manehorizons/cadence-types` gains an additive `RetroDigest`/`RetroDigestZ` schema and a `retro: { enabled, offerGithubIssue }` config block (both default `true`, same shape convention as the existing `recommendations` block). When the digest is non-empty and the run is interactive (a real TTY, or the `CADENCE_PROMPTER_SCRIPT` test seam), settle also offers to file a GitHub issue for it via `gh` — resolving and naming the actual target repo before asking (`gh repo view`), creating the issue non-interactively with an explicit `--repo`, then best-effort labeling it `needs-triage` in a separate call so a repo without that label can't fail issue creation outright. The offer runs strictly _after_ the loop's state commit, never before, so an open prompt can never strand the loop mid-`BUILD`. A duplicated prompter-factory closure (previously independent copies in `settle.ts` and `handoff/run-resume.ts`) was consolidated into one shared `createDefaultPrompter()` in `verify/prompter.ts` as part of this work — see that function's doc comment for a documented, narrow known limitation around scripted settle runs that fire both the interactive-verdict gate and a friction-having retro offer in the same process.
- c5cd4b0: Fix a refusing settle gate silently dropping out of `gates` provenance and a refused `settle run` writing no `SUMMARY` at all — previously the only trace of a refusal was an ephemeral stderr line. `GateProvenanceZ.status` gains a `'refused'` value plus an optional `reason` string (additive, back-compat with pre-existing `ran`/`skipped` records); all 9 settle-dispatched gates (`draft-read`, `structural-verifier`, `boundary-scan`, `build-test-must-pass`, `test-coverage`, `interactive-verdict`, `deep-verify`, `code-review`, `security-audit`) now attach `reason` matching their stderr text on refusal, and `runSettleGates` pushes the refusing gate's entry onto `gates` before halting. A refused `cadence settle run` now persists `SUMMARY.{json,md}` (populated `gates` through the refusing entry, real `taskResults`, empty `acResults`/`decisions`/`deferred`) without transitioning `loopPosition`/`activeDraft`, so the loop stays exactly where a human can retry.

## 1.44.0

### Minor Changes

- e3179cf: Add real assertion-mode test-coverage span parsing for Python, Go, Rust, and PHP (previously js/ts only), plus an operator-extensible escape hatch for any other language.
  - A shared, profile-parameterized scanning engine (`packages/core/src/verify/coverage-profiles/`) replaces the old hardcoded JS/TS-only scanner. Four block-boundary strategies — call-expression, brace-delimited, indentation-delimited, and do-end-keyword — cover every built-in profile and remain available to custom ones.
  - Five built-in language profiles ship: js/ts (re-expressed, byte-identical behavior to before), python (pytest-style, including `async def`), go (`func TestX(t *testing.T)`, table-driven tests, testify), rust (`#[test]`/`#[should_panic]`, unbounded raw strings), and php (both Pest closures and PHPUnit methods, including heredoc/nowdoc-safe masking).
  - `verification.coverageProfiles` lets an operator define a custom profile (opener/assertion patterns, comment/string syntax, block strategy) for any language with no built-in support — validated at config-load time with refuse+suggest diagnostics; custom profiles are add-only and cannot override a built-in's extensions.
  - `cadence verify coverage --explain AC-N [--json]` is a new read-only diagnostic: which files matched, which profile scanned each one, every span found, and why each did or didn't satisfy assertion mode.
  - Per-file dispatch is wired into the real `test-coverage` gate (`scanTestCoverage`) — assertion mode now genuinely works end-to-end for all five built-in languages, not just in isolation. The gate's refusal messages are language-neutral and point at the new `--explain` diagnostic. `cadence init`'s default `verification.testGlobs` for rust now also includes `src/**/*.rs`, since idiomatic Rust unit tests commonly live inline in a `#[cfg(test)] mod tests { ... }` block. `cadence doctor`'s coverage-mode language-support check now reflects the live profile registry instead of a hardcoded js-only list.
  - The false-positive-averse invariant holds throughout: an unrecognized shape always yields zero spans, never a partial or fabricated match. This required closing several real gaps found during review — opener-pattern spoofing via comments, strings, and nested parenthesized sub-expressions (go); an unbounded-hash raw-string masking gap (rust); a standalone-heredoc fabricated-span gap (php); and a cross-process custom-profile collision-shadowing gap (`verification.coverageProfiles`).

### Patch Changes

- a5b21ec: Fix `cadence init` defaulting `verification.coverageMode` to `'assertion'` for every project regardless of language, which made the `test-coverage` gate permanently unsatisfiable for non-JS/TS projects (the assertion-mode span-finder only recognizes JS/TS `it()`/`test()` syntax).
  - `cadence init` now detects the project's language from root marker files (`package.json`→js/ts, `pyproject.toml`/`setup.py`/`requirements.txt`→python, `go.mod`→go, `Cargo.toml`→rust, `composer.json`→php) and only defaults `coverageMode` to `'assertion'` when the detected language is js/ts; every other detected or unknown language defaults to `'mention'` instead, with a stderr notice explaining why. Existing `.cadence/config.json` files are never rewritten.
  - Default `verification.testGlobs` are now language-aware too, so `mention`-mode coverage checking can actually discover test files in non-JS projects (python: `**/test_*.py`, `**/*_test.py`; go: `**/*_test.go`; rust: `tests/**/*.rs`, `**/*_test.rs`; php: `**/*Test.php`, `tests/**/*.php`).
  - The `test-coverage` gate's assertion-mode refusal message now distinguishes its causes accurately: no test file matched the configured globs at all, vs. files matched but no test references the AC, vs. files matched and reference the AC but not inside an asserting `it()`/`test()` block — each with its own suggested fix.
  - `cadence doctor` (and the MCP `doctor` tool) now warns when `coverageMode: 'assertion'` is paired with a detected project language that has no assertion-mode parsing support yet, suggesting `cadence config edit coverageMode`.

  This does not add real assertion-mode test-span parsing for Python/Go/Rust/PHP — only js/ts has that today. It closes the "permanently unsatisfiable gate" failure mode for every language by making the defaults and diagnostics honest.

- 8bf3135: Fix `test-coverage` gate in `assertion` coverage mode wrongly treating an AC whose only linked test sits inside a `test.skip`/`.todo`/`.failing` block as fully covered, even when the block contains an intact assertion. Previously `cadence settle run --auto` would settle clean (exit 0) on a skipped test; the gate now refuses with a distinct message ("AC-N's only linked test is skipped") separate from the existing "no linked test" and "mentioned but not asserting" refusals, naming the fix (unskip the test or replace it with a running asserting block) rather than suggesting an unrelated `coverageMode` switch.

  `findTestSpans` now flags `skip`/`todo`/`failing` openers as non-asserting spans (`only`/`concurrent` are unaffected, since those execute normally); `scanTestCoverage` propagates this through a new `skipped` flag on each test reference, and a new `skippedOnlyLinkedAcs` export is mutually exclusive with the existing `weaklyLinkedAcs` — an AC only lands in the new bucket when every one of its non-qualifying references is skip-caused. `mention`-mode coverage is unaffected.

## 1.43.0

### Minor Changes

- Enable `cadence init` to prepare a repo for Codex on the first run, so a new
  user starting Codex can immediately use Cadence commands without manually
  discovering extra adapter setup steps.
  - `cadence init --host codex` (with `--agents-md`) now wires host hooks,
    generates the project-level `AGENTS.md` guidance, and flows through the
    same init path as Claude Code — previously Codex setup only installed
    adapter hooks/prompts and skipped `AGENTS.md` generation.
  - `cadence doctor` gained Codex readiness checks (hooks, prompts,
    `AGENTS.md`, global command availability), each with an opt-in `doctor
--fix` remediation.
  - Codex/quickstart/CLI docs point first-time users at `cadence init --host
codex` instead of adapter-only setup.

- d502562: Harden handoff/resume against two gaps ground-truth discovery didn't cover:
  a handoff that's stale relative to origin, and a handoff whose narrative was
  never finished.
  - `cadence resume` now runs a best-effort origin-freshness probe before
    replaying a doc (config `resume.remoteCheck`, default `true`; `--offline`
    to skip) and warns when origin has commits this clone lacks, since a
    stale handoff can be superseded by work pushed from another machine.
  - `cadence resume` and `cadence handoff --check` (new) both detect
    scaffolded `<!-- … FILL IN … -->` sections left unfilled by a prior
    session and flag them — `resume` as a warning, `handoff --check` as an
    exit-3 completion gate.
  - `cadence handoff --no-fetch` skips the pre-facts `git fetch` for a fully
    offline write; `git-facts` records whether the fetch actually ran.
  - The Claude Code `/cadence-handoff` and `/cadence-resume` slash-command
    guidance text is updated to teach agents the new gate and banner.

- 1351044: Add `host-cli`, a 4th verifier provider that shells out to your already-authenticated `claude`/`codex` CLI in headless mode instead of requiring a separate `ANTHROPIC_API_KEY`.
  - New provider value `'host-cli'` on every provider config slice (`verifier`, `perTaskVerifier`, `codeReview`, `planReview`, `securityAudit`, `specReview`), plus `cadence activate --provider host-cli` and `cadence settle run --verifier host-cli`. Binary discovery defaults to `claude` on PATH, overridable via `CADENCE_HOST_CLI_BIN`.
  - If the configured binary is missing or the CLI reports an auth/exit failure, verification for that call transparently falls back to `mock` with a loud stderr warning — never silent, never a hang waiting on interactive auth.
  - **Current scope**: only the per-task-verify family (the BUILD-phase task verifier) has a real `host-cli`-backed implementation in this release. The other verifier families (deep-verify, code-review, spec-review, plan-review, security-audit) accept the config value but currently fall back to mock with a warning until they're wired in a follow-up. `cadence doctor`/`cadence activate` report `host-cli` readiness from config well-formedness alone (no required credential, by design) — not a live probe of the binary; that's only discovered lazily on the first real verification call. See `docs/providers.md` for the full picture, including a known no-spawn-timeout gap.
  - The JSON-extraction + schema-repair-retry logic previously private to the `local` provider is now a shared, transport-agnostic module (`json-repair.ts`) reused by both `local` and `host-cli`.

- bef364d: Make verifier activation trustworthy: broader key discovery, a real
  activation smoke test, and committed provider config that actually reaches
  every real call site.
  - A verifier API key is now discovered from a `.env` file at the repo root
    when it isn't exported into the process environment (`discoverKey`),
    closing the gap where a legitimately-available key was invisible to
    `cadence activate`/`cadence doctor` unless manually `export`ed.
  - `cadence activate`'s live provider check is no longer coincidentally
    skippable — when a key is discovered and the provider isn't `mock`, the
    smoke test runs and its outcome (not mere key presence) gates whether
    activation is reported as successful. `--no-check` remains the only
    explicit opt-out.
  - The discovered-key path now reaches every real verifier-selection call
    site (`cadence doctor`, `cadence settle run`'s deep-verify/code-review/
    security-audit seams, the draft/build gates, `cadence spec approve`), not
    just the primitives — including `cadence mcp serve --repo <path>`, where
    the server process's own working directory can differ from the repo being
    operated on. A teammate who never ran `cadence activate` locally, but
    whose key is discoverable and whose repo already commits a real provider
    choice, now gets real verification instead of a silent mock fallback.

## 1.42.0

### Minor Changes

- Add `boundaryEnforcement: 'warn' | 'block'` (default `warn`, back-compat), overridable per-phase via DRAFT frontmatter. In `block` mode, `handlePreToolEdit` refuses an out-of-boundary edit at edit time instead of only warning. Fails open (never blocks) when there's no active draft/phase, or when the active draft declares zero `files:` in total.
- Add a `boundary-scan` settle gate — closes the blind spot edit-time `boundaryEnforcement: 'block'` can't see (most notably a subagent-driven edit, invisible to the pre-tool-edit hook). Enumerates every file touched by the whole phase via an unscoped git diff against the integration ref, and refuses settle on a real out-of-boundary offender when `boundaryEnforcement` resolves to `block` — bypassable via `--force`/`--allow-boundary-scan-failure` unless the gate is sealed.
- Catch a subagent (or a human) touching a DRAFT task's declared files after that task is already marked `DONE`/`DONE_WITH_CONCERNS` — live at edit time via a new `redundantWorkEnforcement: 'off' | 'warn' | 'block'` config (default `warn`, DRAFT-frontmatter overridable), plus a `SubagentStart` baseline snapshot + advisory task-board nudge and a `SubagentStop` safety net that diffs an agent's touched files against its baseline.
- Add `cadence dispatch plan [--json]`, a read-only CLI command that computes wave-based subagent dispatch groups from the active BUILD draft's task list (a unified topological-leveling pass over `depends:` edges and `files:`-overlap prerequisite edges, plus cycle/unknown-dependency detection), and a new `/cadence-dispatch` Claude Code slash command that drives the host agent through a parallel Task-tool dispatch loop over the computed waves. `Task` gains an optional `depends: string[]` DRAFT.md field.

### Patch Changes

- Fix `parseSpecMd`/`parseDraftMd` silently truncating a multi-line Objective or a multi-line Given/When/Then clause at the first line break. Both extractors now capture the full wrapped text; single-line parsing is byte-identical to before.

## 1.41.0

### Minor Changes

- Add three MCP tools closing the scout-to-phase dead-end for MCP-only clients:
  `cadence_recommendation_convert`, `cadence_milestone_propose`, and
  `cadence_recommendation_archive`, each a thin wrapper over the existing
  service/store functions. Also expose a per-phase `SUMMARY.json` resource
  (`cadence://phase/{phase}/summary.json`), and fix
  `cadence_recommendation_promote`'s description, which pointed at a CLI-only
  `milestone propose` command an MCP client has no way to invoke.

## 1.40.0

### Minor Changes

- Add `cadence draft set-objective`/`add-ac`/`add-task`: three additive
  subcommands that mutate a PENDING `DRAFT.md`'s Objective, Acceptance
  Criteria, and Tasks sections directly, round-tripping through the existing
  `parseDraftMd` parser so a hand-typed heading typo can no longer silently
  corrupt AC/Task id sequencing. Hand-editing `DRAFT.md` remains fully
  supported. Also fixes a `parseAcceptanceCriteria`/`parseTasks` heading-regex
  bug found via the new round-trip tests where a name-less `### AC-N:` heading
  bled the next line into the parsed name.

## 1.39.0

### Minor Changes

- Two additive features land together in this release:
  - **`settle-pending` recommendation status** (issue #126, part 1/3): when a
    `converted` recommendation's phase settles, it now moves to a new
    non-terminal `settle-pending` status (visible in the active ledger, not
    archived) instead of the old behavior of silently archiving it. A new
    `cadence doctor` `recommendation-shipped-drift` check and an optional
    `cadence progress` `Note:` line surface recommendations awaiting ship
    confirmation (`recommendation promote --status=shipped`).
  - **`/cadence-recommend` slash command + `cadence recommend --top <n>`**: caps
    the displayed ranked recommendation list to the top N entries (totals still
    report the full count).

  `cadence-types` carries the `settle-pending` schema addition; `cadence-core`
  carries both features' logic; the two host adapters are version-alignment
  only (prompt-catalog parity, no functional change).

## 1.38.0

### Minor Changes

- Cross-worktree handoff discovery for `cadence resume` (v1.38 milestone,
  phases 142-144). `cadence resume` now discovers resumable handoff docs
  across all active git worktrees of a repo, not just the current checkout's
  own `.cadence/handoff/` — a live `git worktree list` scan, no cached index.

  Bare `cadence resume` still resumes the local candidate by default; when 2+
  worktrees have resumable handoffs it additionally prints a one-line stderr
  nudge pointing at `--list` (a new `resume.autoList` config field switches
  this to an auto-opening interactive picker instead). New CLI flags —
  `--list`, `--pick <n>`, `--path <p>`, `--local` — surface the full candidate
  set and let you resolve directly to any of them. Picking a sibling
  worktree's candidate is strictly read-only: it never writes into that
  worktree's `.cadence/` and never stamps the local `state.session.lastHandoff`.

  `cadence-core` carries the feature; `cadence-types` carries the additive
  `HandoffCandidate`/`ResumeResult` schema fields and the new `resume` config
  block; both host adapters get a slash-command guidance update (prompt-parity
  only, no functional change).

## 1.37.0

### Minor Changes

- Close the gap between what `cadence tutorial` demonstrates (real enforcement)
  and what a fresh `cadence init` delivers: `verification.coverageMode` now
  defaults to `assertion` for new inits across all three presets (a comment-only
  `AC-N` mention no longer counts as tested; existing `config.json` files are
  untouched), `verification.testCommand` is derived from the target repo's
  `package.json#scripts.test` + detected package manager and wired into both the
  real init write path and `init --dry-run`'s preview, and `build-test-must-pass`
  now writes a loud, non-blocking notice to stderr when no test command is
  configured instead of passing silently.
- Make a settle's PASS verdicts auditable instead of opaque: `SUMMARY.json`
  now records per-gate `ran`/`skipped` (+ reason) provenance for every
  settle-dispatched gate, and each `acResults[]` row carries an optional
  `evidence` class (`ai-verified`, `executed`, `assertion`, `mention`, or
  `unverified`) — the strongest real evidence found for that AC. A
  mock-provider deep-verify never reports `ai-verified` evidence. `SUMMARY.md`
  renders a new "Gate provenance" section plus an evidence tag next to each AC
  line. Pre-existing SUMMARY records without these fields still parse and
  render unchanged.

## 1.36.0

### Minor Changes

- Onboarding-honesty wave 1: six small, high-trust fixes from the 2026-07-01
  audit (phases 133–138).
  - `cadence doctor`'s git-hooks check now verifies `.githooks/` actually exists
    before flagging, and never auto-overwrites a pre-existing custom
    `hooksPath` (e.g. Husky) (phase 133).
  - `cadence progress --json` — mirrors `recommend --json`'s pattern (phase 134).
  - `init --demo` no longer prints the generic "Your first loop"/"Hand it to
    your AI agent" blocks (which immediately refuse in DRAFT) alongside the
    correct demo instructions (phase 135).
  - README's real-phase walkthrough gets an inline `--no-approve` pointer at
    the approve line (phase 136).
  - Refusal trio: BUILD-state `progress` names the real first-pending task (or
    `settle run --auto`) instead of an unrunnable compound command;
    `draft approve` on a missing `DRAFT.md` gives a clean guarded refusal
    instead of a raw `ENOENT`; out-of-position `settle run` also prints a
    `Next:` line (phase 137).
  - Slash-command count reconciled to the code-true count across
    README/quickstart/claude-code.md (fixed a broken TOC anchor), and
    `cadence start`'s menu gained an `activate` option (phase 138).

## 1.35.0

### Minor Changes

- Add `cadence init --dry-run`: a non-destructive fit-check that resolves
  everything init would (project name, gate profile, layout, test globs,
  verification/provider status, host surface, and the exact files it would
  create) and prints a preview without touching the repo. Honors the resolution
  flags (`--gate-profile`, `--activate`, `--demo`), and previews rather than
  refuses on an already-initialized repo (a real init still exits 2). Powered by
  a pure `planInit`/`renderInitPlan` seam; the real write path is unchanged.

## 1.34.0

### Minor Changes

- e8101b8: Add `cadence doctor --fix`: apply safe, deterministic repairs for the fixable
  doctor findings (git-hooks → `core.hooksPath=.githooks`; regenerate a missing
  `STATE.md`), with a `--wire-host` opt-in that re-runs the Claude Code host
  install for host findings and a `--dry-run` preview that writes nothing. Risky
  findings stay manual guidance. Non-interactive and agent/non-TTY-safe.

## 1.33.0

### Minor Changes

- 689249b: Add `cadence agent-prompt` and an `init` output block that hand the user a
  copy-paste prompt to scaffold the first real CADENCE phase with an AI agent
  (testable ACs, stop at approval). Host-agnostic; pure render shared by both
  surfaces.

## 1.32.0

### Minor Changes

- fae3d3e: Rebuild `cadence tutorial` around the catch (refuse → fix → pass)

  The tutorial now stages a lie and lets settle catch it. In a throwaway sandbox it
  drives draft → approve → build, marks task `T1` DONE with a real `sum.mjs` but no
  test, and runs `cadence settle run --auto` — which **refuses**: the `test-coverage`
  gate names `AC-1` and the loop stays open. The tutorial then writes a real
  `sum.test.mjs`; the second `settle run --auto` executes it through
  `build-test-must-pass` (`node --test`, real exit code) and the loop closes with a
  SUMMARY. The previous `--ac AC-1=pass` manual assertion and `allowMissingCoverage`
  bypass are gone — the gates decide on real state alone, so the refusal a newcomer
  needs to see is now the demo's centerpiece. No engine changes; `cadence init --demo`
  and `renderDemoDraft` are untouched. `cadence-core` carries the feature; the other
  three published packages are version-alignment only.

## 1.31.0

### Minor Changes

- 94ade49: Add first-real-task DRAFT templates for `cadence draft new --template`.

  `bugfix`, `feature`, and `refactor` templates now generate editable Objective,
  Acceptance Criteria, Tasks, and Boundaries sections from the supplied title,
  while preserving the legacy scaffold whenever `--template` is omitted. The
  template path works with auto-derived phase ids and explicit phase/task ids, and
  unknown template names refuse before writing a DRAFT.

  The README, quickstart, CLI guide, and command reference now show template
  commands as the first-real-DRAFT path after tutorial/demo onboarding. The host
  adapter and types packages carry version-alignment bumps only.

## 1.30.0

### Minor Changes

- Release v1.30.0: adoption-onboarding ergonomics, settle bypass audit trails, and Codex host parity.
  - `cadence draft new --title "..."` can now derive the next free phase id and task number, making the recommended first-loop command shorter and less error-prone.
  - `cadence settle run` now records and prints explicit gate bypass audit entries for force, coverage, and verifier-failure paths, and SUMMARY artifacts expose those bypasses through the shared summary schema.
  - Codex host prompts now source shared command guidance, install the `cadence-scout` prompt, and carry parity coverage for local hook roundtrips and prompt-catalog drift.

## 1.29.0

### Minor Changes

- Non-TTY auto-bypass for the approve + interactive-verdict gates (phase 116, rec-20260617-005).

  The two interactive loop gates no longer hard-fail in a non-TTY with `StdinPrompter: stdin is not a TTY`. A pure `resolveInteractivity(env, isTTY)` seam drives both: the `approve` gate auto-passes loudly (stderr audit trail), and the `interactive-verdict` gate skips its per-AC walker, passes, and records `interactiveVerifySkipped: "non-tty"` in the SUMMARY — no human verdicts are fabricated, and the other verification gates still decide. Three env controls: `CADENCE_REQUIRE_TTY=1` restores the strict refusal, `CADENCE_NONINTERACTIVE=1` forces bypass under a pseudo-TTY, and a supplied `CADENCE_PROMPTER_SCRIPT` is always honored. Env-driven only — no config knob.

  `cadence-core` carries the feature; `cadence-types` carries the `interactiveVerifySkipped` summary field; the two host adapters are version-alignment only.

## 1.28.0

### Minor Changes

- 401d86c: Coverage-gate assertion mode (phase 108): an opt-in
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

- 3fae956: Onboarding front door + guided Next: rail (phase 113): make `cadence start` the
  single, unambiguous onboarding entry point, with `cadence quickstart` reframed
  as the post-init "where am I / what's next" map.
  - README leads with `cadence start` alone (the co-equal "or quickstart" framing
    is gone; quickstart is now described as the post-init map).
  - `cadence doctor` ends with a `Next:` line — the first problem's remediation
    when any check is non-ok, else `cadence progress` — so doctor joins the same
    guided rail as the other onboarding commands. (`--json` output unchanged.)
  - `docs/quickstart.md` opens with a 3-way driver fork (terminal / Claude Code /
    MCP) so host users branch immediately.

  Copy/UX only except the small `doctor` Next: line; v1.27's
  `init`/`--demo`/`--activate` flows are untouched, and `quickstart` keeps its
  never-throw guarantee. `cadence-types` / the two host adapters carry
  version-alignment bumps only.

- f6182c0: Onboarding papercuts (phase 114): two small fixes.
  - `cadence init` now prints a one-line heads-up when a young repo gets the
    `auto` gate profile from the git-history suggestion — warning that
    `draft approve` will flip to interactive once the repo passes ~20 commits, and
    that pinning `--gate-profile auto` keeps it hands-off. Only fires for derived
    `auto` (not when pinned explicitly, nor for `standard`/`strict`).
    (rec-20260617-009, scoped down — the preset/profile terminology already
    carries inline clarifiers.)
  - `cadence handoff` honors a `CADENCE_NOW` env override (a date string) for the
    SESSION-doc date, via a pure `resolveNow(env)` seam — making handoff runs
    reproducible and closing a UTC-midnight flake in the clobber-refusal test
    (two runs straddling midnight got different dates and never collided). No
    behavior change when unset. (rec-20260618-001.)

  `cadence-types` / the two host adapters carry version-alignment bumps only.

## 1.27.0

### Minor Changes

- v1.27.0 — onboarding breeze: make `cadence init` a zero-friction front door.
  - **Zero-prompt init** (phase 108): `cadence init` derives the project name
    (`package.json#name`, scope-stripped, else the directory name) and the gate
    profile (git-history heuristic) — it asks nothing.
  - **Auto-wire the host** (phase 108): when a `.claude/` workspace is present,
    `--wire-host` runs the Claude Code adapter install in the same step via a
    subprocess spawn (core never imports host code); a TTY offers it, non-TTY
    skips with a pointer. `--skip-host-wire` opts out.
  - **`init --demo`** (phase 109): seed a ready-to-approve demo phase (objective +
    AC-1 + T1, shared with the `tutorial` toy template) so a newcomer runs a full
    `approve → done → settle` loop in their own repo with no hand-edit.
  - **`init --activate`** (phase 110): when `ANTHROPIC_API_KEY` is present, turn on
    real verification (`verifier.provider=anthropic`, deep-verify seam) in the same
    step via the shared activate seam — the key is never persisted, and no live
    check runs (that stays in `cadence activate`).

  `cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
  version-alignment bumps only (the feature lands in `cadence-core`).

## 1.26.0

### Minor Changes

- Add `cadence start`, an interactive onboarding front door: "What are you doing?"
  → numbered pick → confirm → runs the matching setup command (tutorial, init,
  Claude Code / Codex host install, MCP install, or doctor). Sibling to the
  read-only `cadence quickstart`. Dispatch is a uniform subprocess spawn (the
  `cadence` binary for core routes, `npx` for the two host packages). Scriptable
  via `--pick`/`--yes`/`--json`; a non-interactive shell prints the menu and exits 0.

  cadence-core carries the feature; the other three are version-alignment bumps.

## 1.25.0

### Minor Changes

- v1.25.0 — real-verification-default: name mock honestly as a placeholder

  The `mock` verifier is now explicitly named a non-verifier placeholder across
  every surface, closing the gap between the "real verification gate" pitch and
  the out-of-box mock default (the #1 finding of the 2026-06-11 competitive
  assessment; rec-20260611-003).

  A single source-of-truth `MOCK_VERIFIER_NOTICE` constant in `cadence-types`
  feeds: the settle mock-fallback banner, the `cadence doctor`
  verification-readiness check, `cadence init`'s new "Turn on real verification"
  block, the `cadence quickstart` / `config explain` all-mock warning, and the
  docs (README, concepts, providers, config). Warning-only — mock stays the
  zero-config offline default; nothing is blocked. `cadence-types` carries the
  new constant; the host adapters carry version-alignment bumps only.

## 1.24.0

### Minor Changes

- 9d6684e: Recommendation retention (v1.24): manual + automatic soft-archival of
  recommendations. Terminal recs already drop out of the active `cadence recommend`
  surface but the ledger was append-only — v1.24 adds recoverable move-aside archival.
  - `cadence recommendation archive <id>` / `unarchive <id>` and `recommendation list
--archived` — manual soft-archive (moves a rec into the ledger's new `archived`
    array; recoverable, never deleted; `recommendation show` is archive-aware).
  - `recommendations.autoArchive` config (default **on**, recoverable): a rec is
    auto-archived when it goes terminal — `shipped`/`rejected` immediately on `promote`,
    and a `converted` rec when its phase completes SETTLE (best-effort, never blocks
    settle). Set `false` to keep terminal recs in the active ledger.

  Backward-compatible: a pre-v1.24 `recommendations.json` (no `archived` key) loads
  unchanged. `host-claude-code` / `host-codex` carry version-alignment bumps only.

## 1.23.0

### Minor Changes

- 14aadd0: Add a `shipped` terminal status to the recommendation lifecycle (phase 100,
  from rec-20260611-001). A rec whose work has landed — directly via a PR, or
  after a formal `convert` — can now reach a truthful positive-terminal state via
  `cadence recommendation promote <id> --status=shipped [--ref "PR #70 / v1.22.1"]`,
  instead of being stuck at `candidate`. `shipped` recs drop out of the active
  `cadence recommend` surface (like `converted`/`rejected`); the optional freeform
  `shippedRef` is rendered as a `- shipped:` provenance line. The one sanctioned
  transition out of an otherwise-terminal status is `converted → shipped`.

## 1.22.1

### Patch Changes

- 9a23c60: Fix the phase-id ceiling (rec-20260610-001): widen the id schema from
  `^\d{2}-\d{2}$` to `^\d{2,}-\d{2,}$` and derive ids through a single
  `derivePhaseTaskId` helper, so phases >= 100 are representable end-to-end
  instead of being mangled into `10-100`. Existing 01-99 ids are unchanged.

## 1.22.0

### Minor Changes

- Verification-activation (v1.22.0): `cadence activate` — a guided command that takes
  a project from all-mock verifiers to one real-verification loop.
  - **`cadence activate`** picks a provider and writes `verifier.provider` (the
    deep-verify seam by default; `--all` sets every seam), validates the key with a
    minimal live anthropic ping (`--no-check` to skip; `local`/`mock` skip the ping),
    and never persists the key — only the provider name is written. Key-missing still
    records the selection and prints the exact `export …` line (set-up-now-key-later);
    a failed live check exits non-zero without losing the selection. `--print` previews
    the plan without writing; non-interactive runs require `--provider`.
  - **`cadence doctor`** gains a `verification-readiness` check (reusing the same pure
    readiness assessment): `warning` on all-mock (remedy: `cadence activate`) or a real
    provider missing its key; `ok` otherwise; best-effort, never throws.
  - **Discoverability:** `cadence quickstart`, `cadence config explain` (a new
    `all-mock` warning), and `cadence init` now point at `cadence activate`.

  `cadence-host-claude-code` and `cadence-host-codex` carry version-alignment bumps
  only (no functional change).

## 1.21.0

### Minor Changes

- Quickstart-onboarding milestone (v1.21.0): a four-slice arc that lowers the
  barrier to a first CADENCE loop and makes config self-explanatory.
  - **Slice A — `cadence config explain`**: terminal-sized, in-CLI explanation of
    the _active_ config in plain language — resolved gates, providers, and
    warnings — so operators don't have to cross-reference `docs/reference/config.md`.
  - **Slice B — deepen `config explain`**: richer per-field guidance and an
    optional `[field]` focus, extending the embedded help so it works from any
    install.
  - **Slice C — `cadence config edit`**: a guided edit wizard that writes
    validated changes back to `.cadence/config.json` without hand-editing JSON.
  - **Slice D — `cadence quickstart`**: a state-aware onboarding front door that
    orients a new user from any loop position (uninitialized, IDLE, mid-phase),
    reusing `nextAction`; never throws, with a corrupt-state fallback and `--json`.

  `cadence-host-claude-code` and `cadence-host-codex` carry version-alignment bumps
  only (no functional change).

## 1.20.0

### Minor Changes

- Handoff retention (v1.20): opt-in, count-based pruning of dated `SESSION-*.md`
  handoff docs. A new `handoff.retain` config field keeps the N most-recent
  session handoffs and hard-deletes the rest at handoff-write time
  (deterministic, offline, best-effort — never fails a handoff, never silently
  destroys the dated archive `resume` relies on). Unset = no pruning (current
  behavior). A read-only `cadence doctor` `handoff-retention` check makes
  unmanaged accumulation visible. `host-claude-code`/`host-codex` carry
  version-alignment bumps only.

## 1.19.0

### Minor Changes

- v1.19 worktree-safety polish: surface cross-worktree phase usage proactively on the v1.18
  collision primitive. `cadence doctor` gains a read-only `worktree-phases` check (warns when a
  sibling worktree claims a local phase number, naming the conflict + next free number; best-effort,
  sibling-vs-local only), and the IDLE `cadence draft new …` suggestion in `progress`/`recommend`
  now fills in the next free number (`max(observed)+1` over local + sibling + upstream) instead of a
  bare placeholder, so the first pick clears claims the guard would refuse. Lowest-gap numbering was
  evaluated and dropped — `nextFree` stays monotonic `max+1`. `cadence-types`,
  `cadence-host-claude-code`, and `cadence-host-codex` carry version-alignment bumps only.

## 1.18.0

### Minor Changes

- v1.18 — worktree-safety: phase-collision guard.

  CADENCE's loop state lives in the working tree and each git worktree holds a private `.cadence/`, so
  two worktrees branched from the same commit can both scaffold "phase N" — and with different slugs
  git silently merges both in. The new phase-collision guard observes ground truth (`git worktree list`
  - `origin/<integrationRef>`) and refuses to scaffold a phase number already claimed by a sibling
    worktree or upstream, naming the conflict and suggesting the next free number, so the collision fails
    loud before wasted work.
  * Fires at scaffold time (`cadence spec new` / `cadence draft new`) and as a `cadence settle run`
    backstop. `--allow-phase-collision` bypasses per run (never bypasses the local same-dir refusal).
  * New `phaseGuard { enabled (default true), integrationRef (default "main") }` config block.
  * Best-effort: a non-git / offline / single-worktree checkout behaves exactly as before — the only
    hard failure is an actual detected collision.

  `cadence-types` adds the `phaseGuard` schema; `cadence-host-claude-code` and `cadence-host-codex`
  carry version-alignment bumps only (no functional change).

## 1.17.0

### Minor Changes

- Observability: structured operator-debugging logger (v1.17)

  Add a zero-dependency, additive, default-off structured logger for diagnosing CADENCE itself.
  Writes only to stderr (never stdout — safe for `--json` and the `cadence mcp serve` protocol
  channel), gated by `CADENCE_LOG_LEVEL`/`CADENCE_LOG_FORMAT` env vars and an optional
  `config.logging { level, format }` block (precedence env > config > default `silent`).

  Three seams are instrumented via context-bound child loggers: `gate` (settle gate
  skipped/passed/refused decisions), `hook` (host lifecycle event dispatch), and `verify` (AI
  verifier provider request/response/error, including token usage). Verifier auth headers and API
  keys are never logged. `cadence-types` gains the pure `LogLevel`/`LogFormat`/`LogRecord` types;
  `cadence-host-*` carry version-alignment bumps only (no functional change).

## 1.16.0

### Minor Changes

- MCP surface deepening (v1.16.0): grow the `cadence mcp serve` surface from a
  thin tools-only slice into a full MCP integration, along four dimensions.
  - **Resources (phase 75).** `.cadence/` artifacts are exposed read-on-demand
    under a `cadence://` scheme — `state`, `state.json`, `roadmap`, `project`,
    `recommendations`, plus templated `phase/{phase}/draft|summary`. No
    subscriptions / file-watching; readers reuse the same bytes the CLI reads.
  - **Tool parity (phase 76).** Five proven-out commands join the tool set:
    `cadence_handoff`, `cadence_resume`, `cadence_recommendation_add`,
    `cadence_recommendation_promote`, `cadence_doctor` — enabling session
    continuity and the full scout → rec → promote path over MCP (15 tools total).
  - **Prompts + shared guidance (phase 77).** The canonical command guidance and
    the `cadence-scout` dialogue move into a shared `cadence-types` module
    (`COMMAND_GUIDANCE` + `SCOUT_DIALOGUE`) — one source of truth for both the
    Claude Code slash commands (rendered output byte-identical) and the new MCP
    prompts (`cadence_scout`, `cadence_next`, `cadence_draft`, `cadence_settle`).
  - **Zero-config (phase 78).** New `cadence mcp install [--print] [--client <c>]`
    non-destructively writes/merges a project `.mcp.json` (idempotent; refuses to
    clobber a malformed file); `--print` emits a snippet for other hosts.

  `cadence-types` carries the shared guidance module; `cadence-host-claude-code`
  re-sources its slash-command prose from it (byte-identical); `cadence-host-codex`
  carries a version-alignment bump only. stdio-only and imperative-surface-only
  still hold — ambient edit-time gates remain host-hook-only (DESIGN.md D11,
  deepened additively, no new D-number).

## 1.15.0

### Minor Changes

- f501588: Verifier robustness (v1.15.0): make the real verifier providers dependable in a
  settle gate, let the operator pick one at the command line, and make every
  verifier run's token usage auditable. Provider hardening + ergonomics around
  unchanged verdict logic — not a verifier rewrite.
  - **Provider hardening (Phase 72).** `anthropic` gains configurable
    `verifier.timeoutMs` + `verifier.maxRetries` (threaded via a pure
    `buildAnthropicClientConfig` seam), so a transient 429/5xx/network blip in a
    settle gate retries before failing loud. `local` gains auth: a bearer
    `Authorization` header from `CADENCE_LOCAL_API_KEY` plus arbitrary
    `verifier.localHeaders`, so token-gated OpenAI-compatible proxies work. Header
    values are never logged. Three new backward-compatible `verifier.*` config
    fields.
  - **Verifier selection + cost visibility (Phase 73).** `cadence settle run
--verifier <mock|anthropic|local>` overrides the config-only provider
    selection (precedence flag > config > default `mock`; invalid values rejected
    at parse time). The override flows into the v1.14 mock-fallback banner so it
    reflects the effective provider. `VerifyResult` and the SUMMARY's
    `deepVerifyMeta` gain optional token usage (`inputTokens` / `outputTokens`),
    captured from Anthropic's `usage` and from `local` endpoints that return one.
    Dollar cost is not derived (no price table to rot).

  `cadence-types`, `cadence-host-claude-code`, and `cadence-host-codex` carry
  version-alignment bumps only (the token-usage field on `deepVerifyMeta` lives in
  `cadence-types`; the host adapters are unchanged).

## 1.14.0

### Minor Changes

- b8861dc: Verifier correctness (v1.14.0): the `deep-verify` gate now sends the AI verifier
  the actual phase diff instead of an empty string, so deep verification judges the
  implementation rather than test-linkage alone.
  - `deep-verify` wires the memoized `git diff HEAD` (shared with `code-review`) into
    the verifier input, bounded by the new `verifier.diffCapBytes` config (default
    256KB) and truncated with an explicit `[diff truncated: N of M bytes]` marker.
  - A run-level `deepVerifyMeta` provenance record (`diffProvided`, `diffBytes`,
    `truncated`, `filesCount`, `provider`, `model`) is written to the SUMMARY so a
    verdict is auditable.
  - The mock-fallback banner now fires whenever the gate runs in mock — on `--deep`
    **or** gate-set membership (e.g. `standard × complex`) — so a settle never runs
    mock verification silently.

  `cadence-host-claude-code` and `cadence-host-codex` carry version-alignment bumps
  only (no functional change).

## 1.13.0

### Minor Changes

- **Multi-host reach: the OpenAI Codex adapter** — a new published package
  `@manehorizons/cadence-host-codex`, the second consumer of the phase-60
  host-adapter contract (`ADAPTER_CONTRACT_VERSION = 1`, unchanged). It proves the
  contract is not Claude-Code-shaped: a genuinely differently-shaped host conforms
  without a contract bump.
  - `codexAdapter satisfies HostAdapter`: capabilities, `mapEvent` (Codex's
    near-1:1 lifecycle → cadence abstract events), and `extractPayload` parsing
    Codex's multi-file `apply_patch` envelope into `ExtractedPayload.files`.
  - `cadence-host-codex install`: project-level `.codex/hooks.json` + global
    `$CODEX_HOME/prompts/cadence-*.md` slash-command prompts (with a global-scope
    warning), `--local`/`CODEX_HOME` aware.
  - `cadence-host-codex hook`: the runtime shim — translates Codex stdin-JSON and
    spawns the core dispatcher; proven end-to-end against real loop state.

  `cadence-core`, `cadence-types`, and `cadence-host-claude-code` carry
  version-alignment bumps to stay in lockstep; no functional change.

## 1.12.0

### Minor Changes

- Two adoption-layer CLI features land in `cadence-core`:
  - **`cadence tutorial`** (phase 63) runs one real DRAFT→BUILD→SETTLE loop inside
    a throwaway sandbox, printing each step's command and the engine's actual
    output before cleaning up — the executable companion to the "Your first loop"
    block in `cadence init`. Fully offline and side-effect free.
  - **`cadence explain [concept]`** (phase 64) prints curated, terminal-sized
    explanations of the core concepts (loop, gates, tiers, profiles) from content
    embedded in the binary, so the model is self-teaching without leaving the
    terminal or depending on the `docs/` tree being shipped. Bare invocation lists
    the concepts; unknown names get a nearest-match did-you-mean nudge.

  `cadence-types` and `cadence-host-claude-code` carry version-alignment bumps to
  stay in lockstep with `cadence-core`; neither has a functional change in this
  release.

## 1.11.0

### Minor Changes

- First-class scout-session grouping + guided first-loop onboarding nudge.
  - **Phase 61 — scout-session grouping (`scoutId`).** An optional `scoutId` on
    recommendations groups the N recs landed by one `/cadence-scout` session so
    they are queryable as a set: a `--scout-id` flag on `cadence recommendation
add`, a `recommend --scout-id <id>` cluster filter (scopes the report +
    totals), a `- scout: <id>` render line, and `/cadence-scout` auto-minting a
    `scout-YYYYMMDD-HHMM` session id. Additive — reports for recs without a
    `scoutId` are unchanged. (`cadence-types`: optional `scoutId` on
    `RecommendationZ` + `RecommendationRankZ`.)
  - **Phase 62 — guided first-loop nudge in `cadence init`.** The end of `cadence
init` now prints a numbered "Your first loop" block (draft new → edit →
    approve → done → settle) plus a `cadence progress` escape hatch, replacing the
    thin `Next: edit ROADMAP.md` line. Output-text only.

## 1.10.0

### Minor Changes

- Explicit, versioned host-adapter contract. `@manehorizons/cadence-types` now
  exports a first-class `HostAdapter` interface plus `HostCapabilitiesZ`,
  `ADAPTER_CONTRACT_VERSION`, and `ExtractedPayload`, formalising what a host
  integration must implement. `claudeCodeAdapter` in
  `@manehorizons/cadence-host-claude-code` conforms to the contract, and the docs
  portal gains a "write your own adapter" guide. Also bumps `commander` 13 → 14 in
  `@manehorizons/cadence-core` (the engine floor stays Node `>=20`; commander is
  pinned to `^14` deliberately).

## 1.9.0

### Minor Changes

- e95def0: `cadence resume` now defaults to brief output when live state matches the
  handoff doc, and auto-promotes to full output (whole doc + live-context replay)
  on drift. New `--full` / `--brief` flags force a mode; `--json` gains a `mode`
  field and `context` is now nullable (null in brief mode, since the live-context
  recompute is skipped).

## 1.8.0

### Minor Changes

- 7cb7695: Add `cadence mcp serve` — an MCP server surface (phase 58).

  CADENCE can now run as a local Model Context Protocol server over stdio, so any
  MCP-capable host (Claude Desktop, Cursor, other agents) can drive the
  DRAFT→BUILD→SETTLE loop with no bespoke adapter. It's a third surface on the
  single engine (CLI · Claude-Code hooks · MCP), not multi-host adapter pluralism
  (DESIGN.md D11).

  The server exposes 10 curated tools wrapping the same engine the CLI uses —
  `cadence_progress`/`status`/`recommend` (read) and `draft_new`/`draft_check`/
  `draft_approve`/`build_task`/`settle`/`spec_new`/`spec_approve` (write). The
  curated command logic was factored into shared `*Service(repoRoot, args, io)`
  functions so the CLI and MCP call one implementation (CLI output unchanged).
  Command-boundary gates (coherence, the settle gate stack, spec-review) run
  exactly as on the CLI; ambient edit-time gates require host hooks and are not
  available over MCP. The `@modelcontextprotocol/sdk` dependency is lazy-loaded,
  so ordinary CLI commands never pay its load cost. stdio only — no
  HTTP/remote/auth. See `docs/mcp.md`.

## 1.7.0

### Minor Changes

- d478355: Add `cadence doctor` — diagnose a project's CADENCE setup (phase 56).

  A new deterministic, offline, report-only command that health-checks a project
  and reports each finding as `ok`/`warning`/`error` with a remediation hint:
  Node floor, `.cadence/` + config validity, state-file integrity, the
  `.githooks` pre-push gate (`core.hooksPath`), Claude Code managed hooks, and —
  the check this directly earned — slash-command run-line portability (no
  machine-absolute paths). Human output by default, `--json` for scripting/CI;
  exits non-zero only on `error`-severity findings so it is usable as a CI gate.
  `cadence-types` and `cadence-host-claude-code` are bumped only to keep the three
  public packages in lockstep; neither changed.

- 05d6ea4: Add `cadence recommendation promote` — advance a recommendation's status and/or
  readiness (phase 57).

  Closes the gap where `milestone propose` (which requires `status=accepted` +
  `readiness∈{ready-for-milestone,ready-for-cadence-spec}`) was unreachable for
  manually-added recommendations: `convert` was the only status transition and
  `readiness` was write-once at `add`. `recommendation promote <id>
[--status <s>] [--readiness <r>]` sets either/both, validated against the
  status/readiness enums. It is independent of `convert` — it never sets
  `convertedToPhaseId` and refuses `--status converted` and terminal
  (`converted`/`rejected`) recs. `cadence-types` and `cadence-host-claude-code`
  are bumped only to keep the three public packages in lockstep; neither changed.

### Patch Changes

- b3c4008: Fix the `install --local` warning so it names **every** surface it wrote
  machine-absolute paths into — not just `settings.json`.

  Previously the warning mentioned only `.claude/settings.json`, so the slash
  commands written to `.claude/commands/cadence-*.md` under `--local` were a
  silent offender: their absolute `node <abs>/cli/index.js` paths could be
  committed unflagged and then failed to resolve on every other clone or machine.
  The warning now enumerates each surface actually written (settings file and/or
  command files, narrowed by `--no-hooks` / `--no-commands`) and points at the
  portable plain-`install` form that is safe to commit. Docs (`docs/claude-code.md`)
  updated to match. `cadence-core` and `cadence-types` are bumped only to keep the
  three public packages in lockstep; neither changed.

## 1.6.1

### Patch Changes

- f0d2e4a: Internal refactor (phase 54): split the `intelligence/store` module.

  No user-facing or API change — the published packages' public surface is
  unchanged and all behavior is identical (the full test suite passes unmodified).
  This is a maintainability deepening: the 985-LOC `intelligence/store.ts`
  god-module was decomposed into ten single-responsibility modules under
  `intelligence/store/` (paths, ids, io, recommendations, assumptions, decisions,
  stats, audit, reconcile, milestones), with `store.ts` kept as a thin re-export
  barrel so every existing import site resolves unchanged. `cadence-types` and
  `cadence-host-claude-code` are bumped only to keep the three public packages in
  lockstep; neither changed.

## 1.6.0

### Minor Changes

- v1.6.0 — preset flag rename + `/cadence-scout`
  - **`cadence init --preset`** is the new primary flag for selecting a config
    preset (`solo | team | production`); `--profile` lives on as a deprecated,
    still-working alias that emits a one-line stderr notice. The old name was a
    misnomer — it set a preset, not a gate profile (`--gate-profile`). (Phase
    `52-preset-flag-rename`.)
  - **`/cadence-scout`** — a twelfth Claude Code slash command installed by
    `cadence-host-claude-code`: a divergent→convergent ideation dialogue that
    lands survivors as Praxis recommendations via `cadence recommendation add`.
    Host-side only; zero core-engine change, no new gate / loop position / record
    type. (Phase `53-cadence-scout`.)

## 1.5.1

### Patch Changes

- 9fe4780: Onboarding hardening (phase 48): clearer first-run experience.
  - A distinct `NotInitializedError` — running a command before `cadence init`
    now says "CADENCE not initialized here — run `cadence init`" instead of a
    misleading `StateCorruptError`.
  - Enforce the Node ≥20 floor: `engines.node` on the published packages plus a
    runtime guard that fails fast with a readable message instead of a cryptic
    ESM error.
  - `cadence settle run --deep` prints a prominent banner when the effective
    verifier provider is `mock` (the shipped default), so deep verification can't
    silently hand back fake verdicts.
  - The scaffolded `CLAUDE.md` no longer links to a `DESIGN.md` that consumer
    repos never receive; it points at the published concepts doc instead.
  - README explains all three gate profiles' `approve` behavior and the
    commit-count suggestion heuristic.

## 1.5.0

### Minor Changes

- Add session-continuity commands `cadence handoff` (scaffold a SESSION doc with loop state, read-only git facts, and the context-handoff packet pre-filled) and `cadence resume` (read-only replay of the freshest handoff + live context), plus `/cadence-handoff` and `/cadence-resume` host slash commands. Also fixes a `files-outside-boundary` false positive where absolute touched paths were compared against relative DRAFT `files:` declarations.
