import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CadenceConfigZ, defaultConfig } from '@thomas-powers-jr/cadence-types';

// Resolve repo-root assets from this test file's location:
// packages/core/tests/docs → ../../../../<asset>
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function read(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

/**
 * Slice `text` from the first line containing `startNeedle` up to (but not
 * including) the next line matching `endPattern`, or to EOF if none is
 * found. Mirrors the anchor+slice scoping used by
 * gates-sealed-doc-sync.test.ts, so an assertion below can never be
 * satisfied by a stray mention elsewhere in the doc.
 */
function sliceSection(text: string, startNeedle: string, endPattern: RegExp): string {
  const start = text.indexOf(startNeedle);
  if (start === -1) {
    throw new Error(`anchor not found: ${startNeedle}`);
  }
  const rest = text.slice(start + startNeedle.length);
  const endMatch = rest.match(endPattern);
  const end = endMatch?.index ?? rest.length;
  return text.slice(start, start + startNeedle.length + end);
}

/**
 * Build a regex matching `phrase`'s words in order with `\s+` between them,
 * so a markdown paragraph that hard-wraps a phrase across a line break still
 * satisfies the assertion — the raw file has a literal newline there, not a
 * space, even though it renders as one continuous sentence.
 */
function phraseRe(phrase: string): RegExp {
  const words = phrase.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(words.join('\\s+'));
}

/**
 * Extract top-level field names from a TypeScript `interface Name { ... }`
 * block by brace-depth counting (not a full parser, but enough for a single
 * flat interface with no nested object-literal types) — code-true, not a
 * hand-copied field list, so a future field add/remove/rename here is what
 * actually drives the doc assertions below rather than a second guess of it.
 */
function extractInterfaceFields(source: string, interfaceName: string): string[] {
  const startMarker = `interface ${interfaceName} {`;
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`interface ${interfaceName} not found in source`);
  }
  const bodyStart = start + startMarker.length;
  let depth = 1;
  let i = bodyStart;
  for (; i < source.length && depth > 0; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
  }
  const body = source.slice(bodyStart, i - 1);
  const fields: string[] = [];
  for (const line of body.split('\n')) {
    const m = /^\s*(\w+)\??:/.exec(line);
    if (m?.[1] !== undefined) fields.push(m[1]);
  }
  return fields;
}

describe('coverageScheme config schema ↔ docs pairing (see each it() title for its AC token)', () => {
  it('239-01/AC-10: CadenceConfigZ accepts both coverageScheme values and rejects a third (code truth)', () => {
    expect(
      CadenceConfigZ.safeParse({ ...defaultConfig, verification: { coverageScheme: 'bare' } })
        .success,
    ).toBe(true);
    expect(
      CadenceConfigZ.safeParse({
        ...defaultConfig,
        verification: { coverageScheme: 'phase-qualified' },
      }).success,
    ).toBe(true);
    expect(
      CadenceConfigZ.safeParse({ ...defaultConfig, verification: { coverageScheme: 'strict' } })
        .success,
    ).toBe(false);
  });

  it('239-01/AC-10: CadenceConfigZ resolves an absent coverageScheme to "bare" (code truth for the back-compat claim)', () => {
    const parsed = CadenceConfigZ.parse({
      ...defaultConfig,
      verification: { testGlobs: ['packages/**/*.test.ts'], coverageMode: 'assertion' },
    });
    expect(parsed.verification.coverageScheme).toBe('bare');
    // Dropping `verification` entirely exercises the object-level
    // `.default({...})` literal (Zod 4 returns it as-is, not re-parsed
    // through the inner field defaults) rather than the field-level default.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { verification: _drop, ...withoutVerification } = defaultConfig;
    const parsedNoVerification = CadenceConfigZ.parse(withoutVerification);
    expect(parsedNoVerification.verification.coverageScheme).toBe('bare');
  });

  it('239-01/AC-10: docs/concepts.md\'s test-coverage gate row describes coverageScheme (bare/phase-qualified)', () => {
    const concepts = read('docs', 'concepts.md');
    // Anchored on the gate-description table's row specifically (`| \`test-coverage\` |`
    // alone also appears, coincidentally, inside the "standard" row of the
    // profiles × tiers matrix a few dozen lines earlier — this longer anchor
    // is unique to the Delta gates description table).
    const row = sliceSection(concepts, '| `test-coverage` | Each AC must have', /\n/);
    expect(row).toContain('coverageScheme');
    expect(row).toContain('"bare"');
    expect(row).toContain('"phase-qualified"');
    expect(row).toContain('cadence config edit coverageScheme');
  });

  it('239-01/AC-10: docs/reference/config.md\'s field table has a verification.coverageScheme row', () => {
    const config = read('docs', 'reference', 'config.md');
    const row = sliceSection(config, '| `verification.coverageScheme` |', /\n/);
    expect(row).toContain('"bare"');
    expect(row).toContain('"phase-qualified"');
    // The default and what a fresh `cadence init` writes must both be named,
    // per AC-5's end-to-end load-path claim.
    expect(row.toLowerCase()).toContain('bare');
    expect(row).toContain('cadence init');
    expect(row).toContain('cadence config edit coverageScheme');
  });

  it('239-01/AC-10: docs/reference/config.md documents the loadConfig two-layer default (AC-5\'s as-built restatement)', () => {
    const config = read('docs', 'reference', 'config.md');
    const section = sliceSection(
      config,
      '### `verification.coverageScheme` (Phase 239)',
      /\n## /,
    );
    expect(section).toContain('loadConfig');
    expect(section).toContain('defaultConfig');
    expect(section).toContain('phase-qualified');
  });
});

describe('phase 239 T7/T8 drifts: docs/reference/commands.md "verify phase" prose matches shipped replay behavior (see each it() title for its AC token)', () => {
  const commands = read('docs', 'reference', 'commands.md');
  // Scope to the `phase` subcommand's prose within the `### verify` section —
  // from its options table through the next `### ` heading (`### retro`).
  const phaseSection = sliceSection(commands, '**`phase` options**', /\n### /);

  it('239-01/AC-10: sanity: the section anchor actually captures the Exit codes paragraph', () => {
    expect(phaseSection).toContain('**Exit codes**');
  });

  it('239-01/AC-10: describes scanning as scheme-dependent, not a single unconditional file-scoped rule (drift 1)', () => {
    // Pre-239 phrasing asserted an unconditional "never a whole-repo scan"
    // rule with no scheme qualifier at all — this must now be conditioned.
    expect(phaseSection).toContain('coverageScheme');
    expect(phaseSection).toContain('"bare"');
    expect(phaseSection).toContain('"phase-qualified"');
    expect(phaseSection).toMatch(phraseRe("never scoped to the DRAFT's declared"));
  });

  it('239-01/AC-10: the no-task-files refusal is scoped to the bare scheme only (drift 2)', () => {
    const bareBullet = sliceSection(phaseSection, '**`coverageScheme: "bare"`**', /\n- \*\*/);
    expect(bareBullet).toContain('no-scoped-files');
    expect(bareBullet).toContain('declares no task files');
  });

  it('239-01/AC-10: names the exact source condition that makes no-scoped-files bare-only (code truth)', () => {
    // replayPhaseCoverage's real gating condition: reachable only when NOT
    // qualified, and only after the indeterminate (no-scheme) branch has
    // already returned above it.
    const replaySource = read('packages', 'core', 'src', 'verify', 'phase-replay.ts');
    expect(replaySource).toContain('!qualified && taskFiles.length === 0');
    expect(replaySource.indexOf('coverageScheme === undefined')).toBeLessThan(
      replaySource.indexOf('!qualified && taskFiles.length === 0'),
    );
  });

  it('239-01/AC-10: the Exit codes paragraph states no-scoped-files cannot fire under phase-qualified or pre-scheme (drift 3 / drift 6)', () => {
    const exitSection = sliceSection(phaseSection, '**Exit codes**', /\n---/);
    expect(exitSection).toContain('no-scoped-files');
    expect(exitSection).toMatch(phraseRe('cannot fire for a `phase-qualified`'));
    expect(exitSection).toMatch(phraseRe('pre-scheme SUMMARY'));
  });

  it('239-01/AC-10: the --json shape names every field PhaseReplayResult actually carries (drift 4, code-derived)', () => {
    const replaySource = read('packages', 'core', 'src', 'verify', 'phase-replay.ts');
    const fields = extractInterfaceFields(replaySource, 'PhaseReplayResult');
    // Sanity pin, mirroring gates-sealed-doc-sync.test.ts's pattern: locks
    // the derivation itself so a future field add/remove is caught here
    // first, rather than silently changing the loop below.
    expect(fields).toEqual(['phase', 'id', 'perAc', 'driftCount', 'indeterminate', 'note']);

    const jsonShapeSentence = sliceSection(phaseSection, '`--json` emits', /\n\n/);
    for (const field of fields) {
      expect(jsonShapeSentence).toContain(field);
    }
  });

  it('239-01/AC-10: the Exit codes paragraph documents both meanings of exit 0 (drift 5)', () => {
    const exitSection = sliceSection(phaseSection, '**Exit codes**', /\n---/);
    expect(exitSection).toContain('indeterminate');
    expect(exitSection).toMatch(phraseRe('clean replay'));
    expect(exitSection).toMatch(phraseRe('verdict could be computed'));
  });

  it('239-01/AC-10: exit-code 0 vs 1 decision in services/verify.ts matches the documented "0 covers two outcomes" claim (code truth)', () => {
    const verifySource = read('packages', 'core', 'src', 'services', 'verify.ts');
    // driftFound is derived purely from driftCount > 0, and an indeterminate
    // result always carries driftCount 0 (see phase-replay.ts) — so an
    // indeterminate replay and a genuinely clean replay both land on the
    // same `exitCode: 0` branch below, which is exactly the "two outcomes,
    // one code" claim the docs make.
    expect(verifySource).toContain('results.some((r) => r.driftCount > 0)');
    expect(verifySource).toContain('driftFound || testFailed ? 1 : 0');
  });
});

describe('docs/reference/commands.md "verify coverage --explain" prose is scheme-aware (see each it() title for its AC token)', () => {
  const commands = read('docs', 'reference', 'commands.md');
  // Scope to the `coverage` subcommand's Behavior prose, from its options
  // table through the `phase` options table that starts the next subcommand.
  const explainSection = sliceSection(
    commands,
    "**`coverage` options**",
    /\n\*\*`phase` options\*\*/,
  );

  it('239-01/AC-6: names expectedQualifier as a real field on CoverageExplainResult (code truth)', () => {
    const coverageSource = read('packages', 'core', 'src', 'verify', 'coverage.ts');
    const fields = extractInterfaceFields(coverageSource, 'CoverageExplainResult');
    expect(fields).toContain('expectedQualifier');
    expect(explainSection).toContain('expectedQualifier');
  });

  it('239-01/AC-6: documents that --explain reads .cadence/state.json only under phase-qualified, never writes it', () => {
    expect(explainSection).toMatch(phraseRe('reads (never writes)'));
    expect(explainSection).toMatch(phraseRe('the `"bare"` scheme'));
    expect(explainSection).toMatch(phraseRe('state is never read'));
  });

  it('239-01/AC-6: documents the per-occurrence scheme-satisfaction reporting AC-6 requires', () => {
    expect(explainSection).toContain('coverageScheme');
    expect(explainSection).toContain('"phase-qualified"');
    expect(explainSection).toMatch(phraseRe('satisfies the active'));
  });
});

describe('docs/reference/commands.md "verify coverage --explain" Behavior paragraph documents the bare-form contract (285-01/AC-5)', () => {
  const commands = read('docs', 'reference', 'commands.md');
  // Scope tightly to the `coverage --explain` Behavior paragraph specifically
  // -- from its own heading through (but not including) the Exit codes
  // heading that closes the `coverage` subcommand's prose -- so this can
  // never be satisfied by a stray mention elsewhere in the doc.
  const behaviorSection = sliceSection(
    commands,
    '**Behavior** (phase 167, T8)',
    /\n\*\*Exit codes\*\*/,
  );

  it('285-01/AC-5: sanity: the anchor actually captures the qualified-scheme prose', () => {
    expect(behaviorSection).toContain('phase-qualified');
  });

  it('285-01/AC-5: states --explain takes the bare AC-N form under both schemes, not a caller-supplied qualified form', () => {
    expect(behaviorSection).toMatch(phraseRe('always takes the bare `AC-N` form under either scheme'));
    expect(behaviorSection).toMatch(phraseRe('never a caller-supplied `<phase>/AC-N` qualified form'));
    expect(behaviorSection).toMatch(phraseRe('the qualifier is resolved automatically from the active draft'));
  });

  it('285-01/AC-5: documents that an already-qualified argument is normalized to its bare form with a stderr notice', () => {
    expect(behaviorSection).toMatch(phraseRe('does not silently prepend the qualifier a second time'));
    expect(behaviorSection).toMatch(phraseRe('an unmatchable double-qualified token'));
    expect(behaviorSection).toMatch(phraseRe('prints a stderr notice'));
    expect(behaviorSection).toMatch(phraseRe('naming both the original argument and the bare form actually used'));
  });

  it('285-01/AC-5: documents that a qualifier-only argument (nothing after the slash) is refused, not searched as an empty token', () => {
    expect(behaviorSection).toMatch(phraseRe('qualifier-only argument with nothing after the slash'));
    expect(behaviorSection).toMatch(phraseRe('is refused outright'));
    expect(behaviorSection).toMatch(phraseRe('rather than searched as'));
  });
});
