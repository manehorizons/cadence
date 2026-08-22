# CADENCE Packs — Design (v1, internal-first)

> **Status: design draft, zero consumers.** `config.packs` exists in the
> schema (`packages/types/src/config.ts`) but nothing in `packages/core/src`
> reads it. Nothing described below is enforced, resolved, or even parsed
> yet. This document is the record of the design decisions made before any
> of the slices in §7 are built — not user-facing documentation of a shipped
> feature. It is intentionally **not** indexed in `docs/README.md`.

Scout: `scout-20260822-packs-design`. Precedes any implementation.

## 1. What a pack is

Superpowers' product is not any one skill — it's the installable bundle.
CADENCE's differentiator, earned over eight releases of defect-driven gate
work, is that a pack can carry a claim past *"here is some advice"*: **a
pack declares what it enforces, and that declaration composes with the
gates that already can't lie about themselves.**

Scope for this design: **internal-first**. A pack is the mechanism CADENCE
uses to distribute *its own* skills, commands, and gate-profile deltas as one
installable unit, on the operator's explicit condition that moving to a
third-party ecosystem later is *additive* — new capability bolted on, not a
rework of what internal packs already assume. §8 states that argument
explicitly, invariant by invariant, because that is the condition under
which internal-first was approved.

## 2. What a pack is not

- **Not a content-delivery mechanism for skills.** CADENCE never reads
  `.claude/skills/` or any `SKILL.md` — confirmed by
  `grep -rn "skills/\|SKILL\.md" --include=*.ts packages/core/src`
  returning nothing. `runSkillAuditCheck` (`packages/core/src/checks/
  skill-audit.ts`) only ever asks *"was this skill name invoked?"* against
  telemetry (`ctx.state.skillAudit.invoked`). A pack **declares skills by
  name**; the host supplies the content. This is §5's invariant I-6, and it
  is the reason a pack — even a third-party one, later — cannot inject
  agent-facing prose through CADENCE's own surfaces. It genuinely shrinks
  the trust surface versus what a naive "packs ship skill bodies" design
  would have.
- **Not a config bypass.** A pack cannot set arbitrary `config.*` values.
  See §6 D-AP.
- **Not a dependency graph.** No pack-on-pack dependencies in v1. See §6
  D-AQ.
- **Not (yet) anything from a registry.** Every pack in v1 resolves from
  the local filesystem. See §5 I-4.

## 3. Manifest schema (new type — not a `config.packs` schema change)

`config.packs` stays exactly as it is today —
`{ enabled: string[], disabled: string[] }` — a list of pack ids. What's new
is the manifest each id resolves to:

```ts
interface PackManifest {
  id: string;            // must match the <scope>/<name> grammar (I-1)
  version: string;       // semver
  integrity?: string;    // e.g. "sha256-..."; optional now, see I-2
  skillAudit?: {
    required?: string[]; // skill names to union into effectiveRequired
  };
  gates?: Array<{
    profile: Profile;
    tier: Tier;
    add: Gate[];          // additive only — see I-3
  }>;
  commands?: string[];    // declared slash-command names; doctor-checked,
                           // never enforced (see D-AP)
}
```

No field here lets a pack remove, replace, or weaken anything. That is not
a policy statement layered on top of the schema — it's the schema. There is
no `remove`, `override`, or `set` key to leave unenforced by mistake.

## 4. Where a pack applies (the resolution and application chokepoints)

Two separate questions, two separate answers, both grounded in code read
during this design pass rather than assumed:

### 4a. Resolution — where a pack id becomes a manifest

`gatesFor(tier, profile)` (`packages/core/src/gates/engine.ts:213`) is
documented and verified as **pure, no I/O** — `[...ALWAYS_FIRE,
...DELTAS[profile][tier]]`, deduped. That purity is load-bearing (it's what
lets `config-explain` and the doctor reachability scan call it freely for
whole-matrix introspection) and packs must not break it. So pack resolution
— reading `.cadence/packs/<id>/pack.json` off disk, validating it, checking
`integrity` when relevant — happens in a new impure-shell function,
`resolvePacks(repoRoot, config): ResolvedPack[]`, called once per command
invocation, at the same point config is already loaded. `gatesFor` itself
never changes signature or gains I/O.

`source` (`'local' | 'registry' | 'remote'`) is **not self-declared by the
manifest.** The resolver classifies it by *how it found the pack* —
filesystem path under `.cadence/packs/` → `'local'`; a future registry fetch
→ `'registry'`; a future URL → `'remote'`. A manifest asserting its own
trust level would be exactly the kind of self-authorizing claim I-6 exists
to rule out for skill content — the same logic applies to trust
classification.

### 4b. Application — where a resolved pack's gates actually take effect

This is the question the first draft of this design got wrong by
under-specifying, and it matters more than resolution: **if the union of
pack gates happens at every call site that wants an effective gate set,
then a missed call site silently drops a pack's declared enforcement** —
which is precisely phase 289's lesson (the obvious chokepoint can be the
wrong one) and precisely the failure I-3 exists to prevent.

Checked before deciding: `gatesFor` has exactly three direct, non-test
callers — `engine.ts`'s own `effectiveGateSet` wrapper, `doctor/run.ts`'s
per-gate reachability scan (`assessGateReachability`, which quantifies over
*all* tiers to answer "is this gate reachable at any tier for this
profile," a matrix-wide question independent of any single phase's active
packs), and `config-explain/build.ts`'s per-tier matrix builder (same
whole-matrix shape). Neither of those two exists to answer "what applies to
my phase right now" — they exist to describe the tier×profile matrix
itself, and both are correct to keep working from raw `gatesFor` for that
purpose. `config-explain` does need a follow-up (§7 Slice 3) so that its
*current-tier* row also reflects packs — otherwise `cadence config explain`
would describe gates that don't match runtime reality — but the matrix
table stays raw.

The actual "what applies to my phase" chokepoint already exists:
`effectiveGateSet(state, config, draft)` (`engine.ts:233`), which resolves
tier and profile and then calls `gatesFor`. Every command-boundary and hook
consumer already goes through it — `draft-check`, `draft-approve`,
`build-task` (twice), `settle`, `hooks/handlers.ts` (three call sites), and
`notify/loop-violation.ts`. **Nine call sites, one function.** Pack-gate
union belongs inside `effectiveGateSet`, not repeated at each of its nine
callers. This is the "single resolution chokepoint" I-4 asks for, applied
to enforcement rather than just id resolution — and it costs a one-function
change, not a nine-site audit, because the chokepoint already existed in
the code before this design pass looked for it.

### 4c. `softCap` is orthogonal, not a loosening path — verified, not assumed

`gatesFor` also returns `softCap: profile === 'auto' && tier === 'complex'`.
Before writing I-3/I-5 below, this was checked directly rather than
assumed benign, because `auto` is the *default* profile
(`ProfileZ.default('auto')`) — `auto × complex` is a mainstream cell, not a
corner case, and if `softCap` silently excluded gates from enforcement it
would falsify this design's central claim in its most common cell.

It doesn't. Every `softCap` consumer (`draft-approve.ts:81`,
`settle.ts:558`) uses it identically: refuse the *entire command* unless
`--allow-auto-complex` is passed, then proceed with the **full** gate list
— nothing in it is skipped, downgraded, or made advisory. `softCap` is a
one-time human confirmation checkpoint for the auto×complex cell as a
whole, orthogonal to which gates are in the set. A pack-contributed gate
that lands in an auto×complex `effectiveGateSet` enforces exactly as
strictly as `ALWAYS_FIRE` does, once past the cap. No exemption or special
case is needed for pack gates here — recorded as `dec-<id>` precisely so a
future reader doesn't have to re-derive this from the source a second time.

## 5. The six invariants

### I-1 — Namespaced pack ids

Grammar: `<scope>/<name>`, mirroring npm scoping. Internal packs use the
`cadence` scope now (e.g. `cadence/core-skills`) even though nothing
collides yet. This costs nothing today: `config.packs.{enabled,disabled}`
is already `string[]`; namespacing is a resolver-side validation rule
against that existing type, not a schema change.

### I-2 — Manifest carries identity, version, and an integrity slot from day one

`id`, `version`, and `integrity` all exist in the manifest type in §3 even
though v1's only `source` is `'local'`, where `integrity` stays optional and
unused. The load-bearing claim (checkable, per the operator's condition in
§8): making `integrity` *required* is additive because it only becomes
required for `source !== 'local'`, and **no pack of that source exists
yet** — there is nothing today that a required-integrity rule could break.

### I-3 — Gate deltas are monotonically tightening, enforced for internal packs too

Two independent things make this hold, not one:

1. **Structural**: §3's schema has no `remove`/`override` key. A pack
   cannot express a loosening even if it wanted to.
2. **Behavioral**: `gatesFor`'s own contract (verified, §4a) already has no
   removal path — `[...ALWAYS_FIRE, ...deltas]`, additive by construction.
   Packs compose into a shape the code already had.

Applying this to internal packs from day one, with no self-exemption, is
the operator's explicit condition — a pack allowed to loosen its own
author's gates is a pack whose "declares what it enforces" claim is already
false for the packs shipping first.

### I-4 — One resolution chokepoint, with a source-classification field

Covered in §4a/§4b: resolution (`resolvePacks`) and application
(`effectiveGateSet`) are each a single point, not scattered. `source` is
resolver-assigned, never self-declared.

### I-5 — Precedence is trivial by construction, not by a resolution rule

This is the one place this design differs from a "pick a precedence
policy" framing. Because §6 D-AP restricts a pack's payload to purely
additive fields (`gates.add`, `skillAudit.required`), the union across *N*
packs is associative, commutative, and idempotent — adding a second pack
can never conflict with the first, because nothing in the allowed payload
is capable of expressing a conflict. "Strictest wins" is not a rule that
needs enforcing at merge time; it's the only possible outcome once the
payload shape rules out everything else. Local config's own profile/tier
resolution (`effectiveProfile`: DRAFT override > config > `'auto'`) is
untouched by any of this — pack gates union onto
`gatesFor(tier, effectiveProfile(...))`'s output *after* profile resolution
happens, never interacting with how the profile itself is chosen. That
sidesteps the "does a pack's delta interact with lenient vs. strict
profile" question rather than answering it, which is the same trick I-3
plays with removal: rule out the payload shape that would need a coherence
policy.

### I-6 — Packs declare skills by name; they never ship skill bodies through CADENCE

Verified live against the code, not assumed (§2, and the exact commands are
in the report-back). This is the invariant that makes third-party packs
tractable at all: an installed pack cannot inject prompt text into the
agent through any CADENCE surface, because CADENCE never reads skill
content in the first place — there is no channel to inject through. If a
pack ever needs to *deliver* skill files (not just name them), that is a
separate, later, host-adapter-layer concern with its own trust model — out
of scope for the core pack contract entirely, not deferred within it.

## 6. Design questions

### D-AP — A pack's payload is an explicit allowlist

`skillAudit.required` additions, `gates[].add` (tighten-only), and declared
`commands` (doctor-checked only, never enforced — see Slice 4). **Excluded,
explicitly:**

- **Arbitrary config defaults.** A pack that could set `config.*` could set
  `config.profile` or otherwise indirectly disable a check — this would
  make I-3 unenforceable in practice regardless of what the gate schema
  itself allows.
- **`requiredSkills`-as-pack-payload.** This is not redundant with
  `skillAudit.required` — it's a real, deliberately declined capability.
  `config.skillAudit.required` is project-global; `draft.requiredSkills` is
  per-phase (`effectiveRequired` unions both today). A pack contributing
  per-phase-scoped requirements would need to know which phase it's
  targeting, which packs don't. Excluding it means packs can only ever add
  *global* skill requirements in v1, not phase-scoped ones — a real
  narrowing of scope, stated honestly rather than waved away as duplication.
- **Pack dependencies.** See D-AQ.

### D-AQ — `enabled`/`disabled`, no pack dependencies in v1

No dependency resolution between packs in v1 — real problem, cheap to
defer, expensive to build speculatively. On an id appearing in both
`enabled` and `disabled`, **`disabled` wins** — when ambiguous, exclude
rather than include, matching the tighten-only spirit: the safe direction
on a config contradiction is always toward less surface, never more.

### D-AR — Discovery: `.cadence/packs/<id>/pack.json`, filesystem-local, git-tracked

The simplest thing that satisfies I-4's `'local'` branch: project-local,
versioned with the repo, zero network. npm-package-based resolution is
deferred to when the `'registry'` source is actually implemented — no
reason to build the harder path before the easier one has a single real
consumer.

`cadence doctor` behavior is two-phase, recorded as one decision so the
switchover isn't lost:

- **Now (Slice 1, no behavioral effect anywhere else):** an enabled pack
  that doesn't resolve is a **warning**. Nothing consumes packs
  behaviorally yet, so there is nothing to fail loud about.
- **Once a later slice makes packs behaviorally consumed** (Slice 2/3
  below): an enabled-but-unresolvable pack becomes a **hard refusal** at
  settle time, not a silent no-op. This follows the same precedent as
  v1.64.0's zero-AC-drafts fix — "fail loud instead of passing every gate
  vacuously." A silently-unresolvable pack is exactly "quietly disable what
  the user installed it to get," the failure mode I-3 exists to prevent.

### D-AS — `skillAudit` provenance is recorded, not just the union

Once packs can contribute to `effectiveRequired`, `SUMMARY.json`'s
skill-audit section should be able to say *which* requirement came from
where — `{ skill, source: 'config' | 'draft' | 'pack:<id>' }[]` — rather
than a flattened list that erases it. Same class of decision as
`providerSelection`'s provenance field (`dec-20260808-007`): cheap as an
additive field now, expensive to retrofit once artifacts without it exist
in the wild.

### D-AT — Naming is deferred, not decided

`packs` stays the config/internal term — it's already public API
(`config.packs`) and this design doesn't touch its shape. No public
product name is chosen in this document. The standing naming discipline
(full npm/GitHub/trademark/SEO collision check) is only meaningful
immediately before a public identifier ships, and nothing in this design
phase ships publicly. This is a recorded deferral, not an open gap.

### D-AU — see §7, the slice plan

## 7. Slice plan

Each slice is independently shippable with its own hard acceptance bar.
Nothing before Slice 2 has any runtime effect.

**Slice 1 — Resolve and validate, zero behavioral effect.**
Manifest schema (§3), `resolvePacks()` (§4a), and a new `cadence doctor`
check reporting each enabled pack resolved/unresolved with a reason.
Proves I-1, I-2, I-4a.
*Acceptance:* `gatesFor` and `effectiveGateSet` output byte-identical
before/after for every existing fixture; no schema change to
`CadenceConfigZ`; the new doctor check ships **with** its paired row in
`docs/reference/commands.md`'s doctor-check table (the doc-drift rule
applies to this exactly the way it applies to CLI flags — decided now so
it isn't discovered mid-implementation); full suite green.

**Slice 2 — `skillAudit` contribution.**
A pack's `skillAudit.required` unions into `effectiveRequired`
(`runSkillAuditCheck`), with provenance (D-AS). First real behavioral
consumer.
*Acceptance:* a pack-declared required skill refuses settle exactly like a
config-declared one on missing telemetry; `SUMMARY.json` attributes the
requirement to the pack, not just the skill name. Doctor's unresolved-pack
check (D-AR) escalates from warning to refusal for enabled-but-unresolvable
packs, since behavioral consumption now exists.

**Slice 3 — Gate-profile deltas.**
A pack's `gates[].add` unions into `effectiveGateSet`'s output (§4b), never
into raw `gatesFor`. Manifest validation rejects any non-additive shape at
parse time — not silently ignored, not silently dropped.
*Acceptance:* a pack adding `code-review` to `quick-fix`×`lenient` causes it
to actually fire on the next affected build/settle; a malformed or
loosening-shaped manifest is refused with a specific reason at resolve
time; `cadence config explain`'s current-tier row (not the whole-matrix
table) reflects enabled packs' contribution, so the command that exists to
answer "what's actually enforced" stays honest once packs are real.

**Slice 4 (stretch — may land after this arc closes).**
`commands` declaration checking via `cadence doctor` only — never enforced,
matching D-AP's exclusion of commands from anything gate-shaped.

**Explicit non-goals for the whole arc**, not just this document: registry
or remote source resolution, pack-on-pack dependencies, a public product
name or ecosystem launch, and any config-default payload field.

## 8. Ecosystem-migration argument

The operator's condition for approving internal-first: moving to
third-party packs later must be *additive*, checkable invariant by
invariant.

- **I-1**: new `@scope/name` values arrive alongside `cadence/name`; the
  grammar itself doesn't change.
- **I-2**: `integrity` graduates from optional to conditionally-required by
  `source`. Existing `local` manifests (no `integrity`, `source: 'local'`)
  keep parsing forever — the required-ness only ever applies to a `source`
  value that has zero instances today.
- **I-3**: enforcement is identical regardless of `source` — nothing
  changes when a new source arrives, because tighten-only was never
  source-conditional to begin with.
- **I-4**: `resolvePacks` gains `'registry'`/`'remote'` branches; the
  `'local'` branch, and everything built on it (Slices 1–4), is untouched.
- **I-5**: union-of-monotonic-payload precedence doesn't reference `source`
  or pack count anywhere in its reasoning — adding a new source doesn't
  change the rule, because the rule was never about *where* a pack came
  from.
- **I-6**: skill-by-name-only holds regardless of `source` — a third-party
  pack still cannot inject prose through CADENCE, because the channel that
  would let it doesn't exist for any pack, internal or not.

Nothing on this list requires touching a Slice-1-through-4 consumer to add
a new source. That is the additive claim, made checkable rather than
asserted.
