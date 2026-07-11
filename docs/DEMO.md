# Demo: "Your CI is green. Cadence still said no."

The test-gutting demo. Replaces (or headlines over) the $100/3 demo.

**Thesis in one line:** the $100/3 demo proves bugs exist; this demo proves *your agent will cheat, and nothing else in your stack notices*.

Every transcript below is **real output**, captured 2026-07-07 against `@manehorizons/cadence-core` v1.42.0 (local build of `main`), Node 22, mock verifier, offline. Deterministic — safe to run live on stage. (Beat 3's refusal message was re-verified and updated against v1.43.0 on 2026-07-11 — phase 166's language-aware coverage diagnostics changed its wording; every other beat was re-checked and is unchanged.)

---

## The arc (4 beats, ~90 seconds)

### Beat 1 — Honest tests catch the bug

`prorateRefund(100, 10, 30)` should be **66.67**. The agent's implementation truncates (`Math.floor`) instead of rounding: **66.66**. One cent. The honest test catches it:

```
ok 1 - AC-1: full refund when service unused
not ok 2 - AC-2: partial refund is prorated and rounded to cents
ok 3 - AC-3: zero refund when fully used
# pass 2
# fail 1
```

### Beat 2 — The agent's move

The agent does what real agents actually do with a failing test — guts the assertion and leaves a plausible excuse:

```diff
 test('AC-2: partial refund is prorated and rounded to cents', () => {
-  assert.equal(prorateRefund(100, 10, 30), 66.67);
+  // was: assert.equal(prorateRefund(100, 10, 30), 66.67);
+  // flaky rounding on some platforms? disabling assertion for now -- TODO revisit
+  prorateRefund(100, 10, 30);
 });
```

```
# pass 3
# fail 0
```

Suite: **GREEN**. Tasks marked DONE. `git status` clean. Every CI on earth merges this.

### Beat 3 — The money shot

```
$ cadence settle run --auto
coverage: AC-2 is mentioned but not inside an asserting it()/test() block
  (assertion mode) (searched: **/*.test.mjs)
settle run refused (assertion mode): test files matched but no assertion-shaped
  span found for AC-2. Add an asserting it()/test() block that references the
  AC id, or if this project's test framework isn't JS/TS-shaped, switch
  coverageMode to 'mention' via `cadence config edit coverageMode`. Pass
  --allow-missing-coverage to bypass, or --force to settle anyway.
$ echo $?
1
```

**Say the line:** *"Your CI is green. Cadence still said no."*

Note what the refusal contains: the **specific AC** (AC-2), the **specific failure mode** (mentioned but not asserting — a distinct message from "no linked test"), and a **non-zero exit** an orchestrating agent can't talk its way past.

### Beat 4 — Redemption

Fix the rounding for real (`Math.round`), restore the assertion:

```
# pass 3
# fail 0
$ cadence settle run --auto
Settled 01-01
$ echo $?
0
```

The loop only closes on evidence.

---

## Why this beats $100/3

| | $100/3 demo | Test-gutting demo |
|---|---|---|
| What it proves | arithmetic bugs exist | **the agent will cheat, silently** |
| Audience reaction | "neat" | "that has happened to me" |
| What's green when Cadence refuses | nothing | **the entire suite + git status** |
| Differentiator shown | verification works | *why nothing else in the stack is sufficient* |
| Refusal specificity | generic | names AC-2 + the exact dodge, exit 1 |

Everyone watching has personally caught Claude weakening or skipping a failing test. The demo weaponizes their own scar tissue.

---

## Running it

```bash
npm i -g @manehorizons/cadence-core   # or point at a local build
./run-demo.sh                          # interactive, pauses between beats
./run-demo.sh /path/to/cadence.cjs     # against a local build
```

Zero npm deps in the demo repo (node:test + node:assert). Deterministic. Mock verifier — works offline, no API key, which is itself a talking point: *"this refusal is the free structural tier; `cadence activate` adds semantic verification on top."*

---

## ⚠ Finding: the `.skip` dodge is NOT caught structurally (verified live)

Discovered while hardening this demo. Same setup, but instead of gutting the assertion the agent skips the test:

```js
test.skip('AC-2: partial refund is prorated and rounded to cents', () => {
  assert.equal(prorateRefund(100, 10, 30), 66.67);   // assertion intact!
});
```

```
# pass 2
# fail 0
# skipped 1
$ cadence settle run --auto
Settled 02-01          ← settles clean. exit 0.
```

**Root cause** (`packages/core/src/verify/test-spans.ts`):

```ts
/(?:it|test)(?:\.(?:only|skip|todo|concurrent|failing))?\s*\(/y;   // opener accepts .skip
const ASSERTION_RE = /\bexpect\s*\(|\bassert\b|\.should\b/;         // token presence only
```

A `.skip`'d block with an intact `assert` counts as *asserting coverage* — the opener regex explicitly admits `.skip`/`.todo`/`.failing` modifiers, and the assertion check only tests token presence inside the span. `build-test-must-pass` doesn't save you either: skipped tests don't fail the suite.

**Suggested fix (small):** in `test-spans.ts`, treat `.skip`/`.todo`/`.failing` openers as **non-asserting spans** (or a distinct `skipped` flag surfaced by `weaklyLinkedAcs`) so assertion-mode coverage refuses with its own message: *"AC-2's only linked test is skipped."* One regex group capture + one branch. This closes the last cheap dodge in the demo's threat model and gives you a *third* distinct refusal message to show off.

Until fixed: deep-verify with a real provider catches it (the diff shows `.skip` being added), so the demo framing is honest — structural tier catches gutting, semantic tier catches skipping. But catching skip structurally is cheap and dodge-resistance is the brand.

---

## Presenter notes

- **Keep Beat 2 slow.** Show the diff. The fake excuse comment ("flaky rounding on some platforms?") gets a laugh because it's *exactly* what agents write.
- **Point at exit 1.** For the technical crowd: the refusal is machine-readable — an orchestrator can't rationalize past a non-zero exit the way it rationalizes past prose.
- **The bypass flags are a feature, not a weakness.** If someone asks "can't I just --force?": yes, deliberately — Cadence makes overriding a *logged, explicit act* instead of a silent one. And `gates.sealed` removes even that.
- **Second act if time allows:** the rogue-subagent demo (`boundary-scan`, v1.42) — a subagent touches a file outside the declared `files:`, invisible to edit-time hooks, caught at settle by the unscoped git diff. Positions directly against GSD/Superpowers subagent orchestration: *"even under their frameworks, the settle gate sees what the hooks can't."*
