# Phase 29.4 — Shakedown remediation ledger

Consolidated disposition of every Phase 29.1 foreign-repo shakedown finding
(`.cadence/shakedown/29-01-FOREIGN.md`). Spans the F2 fast-track phase
(`29-f2-testglobs/29-04`) and the doc/ux remediation phase
(`29-shakedown-docs/29-06`). ROADMAP contract filename retained.

## Finding → disposition

| ID | Tag | Sev | Disposition | Where |
|----|-----|-----|-------------|-------|
| **F2** | `bug` | HIGH | **Fixed** — `init` detects layout: `packages/` → workspace glob (unchanged for cadence's monorepo), else depth-agnostic `**/*.test.ts(x)`; summary reports layout. Coverage gate now satisfiable on single-package repos. Test: `init.test.ts` AC-1/AC-2 (incl. live `scanTestCoverage` proof). | Phase 29.4 — commits `ccdbba0` (feat) / `2e9be26` (settle) |
| **F1** | `docs` | MED | **Fixed** — `host install --local` now prints a stderr warning that the settings file holds machine-absolute paths and must not be committed (gitignore; re-run per machine). README "Use with Claude Code" documents it. Boundary: installer does **not** auto-edit `.gitignore` (warn-only; revisit if it recurs). Test: `host cli.test.ts` AC-1. | Phase 29.6 |
| **F6** | `docs` | MED | **Fixed** — `init` post-init summary prints a non-TTY `draft approve` / `--no-approve` hint when the resolved gate profile is `standard`/`strict`; README quickstart adds a ≥20-commits→`standard`→non-TTY heads-up. Test: `init.test.ts` AC-2 + README-guard AC-4. | Phase 29.6 |
| **F4** | `ux` | LOW | **Fixed** — `init` summary rows now qualified: preset → "config preset — workflow defaults: solo\|team\|production", gate profile → "gate strictness: strict\|standard\|auto", removing the overlapping "profile" vocabulary. Test: `init.test.ts` AC-3. | Phase 29.6 |
| **F3** | `works-as-designed` | — | **No action.** Gate-profile suggestion (75 commits → `standard`) behaved exactly as documented. | — |
| **F5** | `works-as-designed` | — | **No action.** Non-TTY init defaulting + `.cadence/`/`.planning/` coexistence — clean, no collision. | — |

## Phases not run (resource-blocked, carried to v1.1 remainder)

| Phase | Why not run here | Unblock requires |
|-------|------------------|------------------|
| 29.2 — expensive-gate live exercise | Needs a live `ANTHROPIC_API_KEY` and real token spend against `anthropic` providers; not exercisable in this autonomous session without authorized cost. | User-provided key + explicit spend authorization. |
| 29.3 — interactive/approve TTY exercise | Requires a real human-driven TTY; the agent runs non-TTY by construction. | Human operator at a terminal. |

No 29.2/29.3 findings exist yet, so none are undispositioned. They remain
ROADMAP phases before the 30.1 publish gate.

## Status

Every actionable Phase 29.1 finding (`bug`/`docs`/`ux`) is **closed** — F2
fixed in 29.4; F1/F4/F6 fixed in 29.6; F3/F5 are `works-as-designed`. No open
29.1 `bug`-tagged finding remains. 30.1 publish stays gated on 29.2 + 29.3
(resource-blocked, not on any open 29.1 defect).
