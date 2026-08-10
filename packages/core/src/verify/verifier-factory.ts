import { MOCK_VERIFIER_NOTICE, MOCK_VERIFIER_CAPABILITY } from '@thomas-powers-jr/cadence-types';
import { discoverKey } from '../activate/key-discovery.js';
import { HostCliError } from './host-cli-client.js';

export type VerifierProvider = 'mock' | 'anthropic' | 'local' | 'host-cli';

/** Shared options for every `select…Verifier` factory (Phase 40.1). */
export interface VerifierSelectOptions {
  /** Overrides the configured provider. */
  override?: VerifierProvider;
  /** Test seam: stand in for `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Test seam: emit warnings somewhere other than `process.stderr`. */
  warn?: (message: string) => void;
  /** Where a `.env` file is discovered (default `process.cwd()`) — a key found
   *  there is treated the same as one exported into the env (AC-1). */
  cwd?: string;
}

/**
 * Describes one verifier family: how to read its `{ provider, model }` config
 * slice and how to build each of its three providers. `C` is the (Pick) config
 * param the binding accepts; `V` is the verifier type produced.
 */
export interface VerifierFactorySpec<C, V> {
  /** Warning-prefix label, e.g. `'code-review'`. */
  label: string;
  /** Read this family's config slice. `model` and the Phase-72 hardening fields
   *  admit `| undefined` so the (exactOptionalPropertyTypes) config slices
   *  assign directly. Families without the hardening fields (everything but the
   *  top-level `verifier` slice) simply return them as `undefined`. */
  read(config: C | null):
    | {
        provider?: VerifierProvider;
        model?: string | undefined;
        /** Phase 72: anthropic request timeout (ms). */
        timeoutMs?: number | undefined;
        /** Phase 72: anthropic retry budget. */
        maxRetries?: number | undefined;
        /** Phase 72: extra headers for the local provider. */
        localHeaders?: Record<string, string> | undefined;
      }
    | undefined;
  mock(): V;
  anthropic(opts: {
    apiKey: string;
    model?: string;
    timeout?: number;
    maxRetries?: number;
  }): V;
  local(opts: {
    baseURL: string;
    model: string;
    headers?: Record<string, string>;
  }): V;
  /**
   * Phase 165: `host-cli` provider builder — spawns the user's already-
   * installed, already-authenticated host CLI (`claude`/`codex`) in headless
   * mode instead of calling an HTTP endpoint. Optional (unlike `mock` /
   * `anthropic` / `local`): a verifier family that hasn't wired a
   * `host-cli`-backed verifier class yet simply falls back to `mock` with a
   * warning (see `createVerifierFactory`) rather than failing to compile —
   * this lets `host-cli` land as a provider without forcing every family's
   * factory file to change in lockstep.
   */
  hostCli?(opts: { bin: string; model?: string }): V;
}

/**
 * Phase 72: pure builder for the `local` provider's extra headers. Returns a
 * bearer `Authorization` from `apiKey` merged under any `custom` headers (custom
 * wins), or `undefined` when there is nothing to send so the caller can omit the
 * key entirely. Header values are secrets — never log the result.
 */
export function buildLocalHeaders(
  apiKey: string | undefined,
  custom: Record<string, string> | undefined,
): Record<string, string> | undefined {
  const merged: Record<string, string> = {};
  if (apiKey) merged.Authorization = `Bearer ${apiKey}`;
  if (custom) Object.assign(merged, custom);
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * Build a `select…Verifier(config, opts)` function (Phase 40.1 consolidation of
 * six byte-identical factories). One selection algorithm:
 * `provider = override ?? slice.provider ?? 'mock'`; the `anthropic` provider
 * needs `ANTHROPIC_API_KEY`; the `local` provider needs `CADENCE_LOCAL_BASE_URL`
 * and a model (`slice.model ?? CADENCE_LOCAL_MODEL`); a missing prerequisite
 * falls back to `mock` with one stderr warning so the caller knows it downgraded.
 */
/**
 * Mirrors the selection algorithm's first line without building a verifier or
 * touching env: `provider = override ?? slice.provider ?? 'mock'`. `defaulted`
 * is true only when the provider fell through to `'mock'` with no explicit
 * choice — that is the silent-false-confidence case worth warning about. An
 * explicit `mock` (config or override) is NOT defaulted.
 */
export function resolveEffectiveProvider(
  slice: { provider?: VerifierProvider } | undefined,
  opts: { override?: VerifierProvider } = {},
): { provider: VerifierProvider; defaulted: boolean } {
  const provider = opts.override ?? slice?.provider ?? 'mock';
  const defaulted =
    opts.override === undefined && slice?.provider === undefined;
  return { provider, defaulted };
}

const PROVIDERS_DOC =
  'https://github.com/thomas-powers-jr/cadence/blob/main/docs/providers.md';

/**
 * Prominent stderr banner for the mock case under a verification gate.
 * Phase 104: rendered from the single source-of-truth `MOCK_VERIFIER_NOTICE`
 * so the "mock = not real verification" wording stays identical to `doctor`,
 * `init`, and `config explain` (no duplicated honesty literal).
 */
export const MOCK_FALLBACK_BANNER = [
  '',
  `  ⚠  ${MOCK_VERIFIER_NOTICE.label.toUpperCase()}`,
  `     ${MOCK_VERIFIER_NOTICE.message}`,
  `     ${MOCK_VERIFIER_CAPABILITY.message}`,
  `     ${PROVIDERS_DOC}`,
  '',
].join('\n');

/**
 * Phase 243: same loud framing as `MOCK_FALLBACK_BANNER`, parameterized with
 * the seam label and the specific missing prerequisite — for
 * `createVerifierFactory`'s three selection-time degrade branches (an
 * explicitly-requested real provider that can't be used), as opposed to
 * `MOCK_FALLBACK_BANNER` itself, which settle.ts fires on a disjoint
 * condition (the *configured* provider resolving to `mock` at all, default
 * or explicit — never on a credential/prerequisite-missing downgrade).
 */
function buildDowngradeBanner(reason: string): string {
  return [
    '',
    `  ⚠  ${MOCK_VERIFIER_NOTICE.label.toUpperCase()}`,
    `     ${reason}`,
    `     ${MOCK_VERIFIER_NOTICE.message}`,
    `     ${MOCK_VERIFIER_CAPABILITY.message}`,
    `     ${PROVIDERS_DOC}`,
    '',
  ].join('\n');
}

/**
 * Phase 244 (T2, rec-20260729-001): prominent stderr banner for a settle
 * that is actually executing through a `cadence` binary whose realpath
 * resolves OUTSIDE this repo's own checkout, despite the repo having its
 * own local build — e.g. a stale globally-installed binary silently
 * shadowing this checkout's `packages/core/bin/cadence.cjs` (confirmed on
 * phases 233/234: the written SUMMARY silently downgraded to
 * `schemaVersion: 1` with no `assurance` record). See
 * `detectForeignCadenceBinary` in `services/settle.ts` for the detection
 * logic. Unlike `MOCK_FALLBACK_BANNER` above, this has no fixed text — the
 * mismatch is only actionable if the operator can see exactly which two
 * paths disagree — so it is a builder function, not a static constant,
 * following the same multi-line array-join shape.
 */
export function buildForeignBinaryBanner(runningBinaryPath: string, repoToplevel: string): string {
  return [
    '',
    '  ⚠  SETTLING VIA A FOREIGN CADENCE BINARY',
    '     This repo has its own local build, but the binary executing this',
    '     settle resolves OUTSIDE this checkout — the written SUMMARY may',
    '     silently downgrade (missing schemaVersion 2 fields, no assurance).',
    `     running binary: ${runningBinaryPath}`,
    `     repo toplevel:  ${repoToplevel}`,
    '     Re-run via the local build in this checkout, e.g.:',
    '       node packages/core/bin/cadence.cjs settle run --auto',
    '',
  ].join('\n');
}

/**
 * Phase 263 (T3): the two epistemically distinct states `verifier-factory.ts`
 * itself can determine about a verify()-family result — a
 * deliberately-configured provider, or one that silently fell back to mock
 * (at selection time in `createVerifierFactory`'s three synchronous branches,
 * or at call time in `wrapWithFallback`'s Proxy catch below). The third state
 * `GateProvenanceZ.providerSelection` accepts, `'empty-diff'`, is gate-level,
 * diff-scoped knowledge (touchedFiles non-empty but the diff is empty) that
 * only `code-review`/`security-audit` can compute (263-01 T4) — this module
 * never produces it.
 */
type ProviderSelectionTag = 'configured' | 'fallback';

/**
 * Phase 263 (T3): tags a verify()-family result with `providerSelection`,
 * additively and invisibly to structural equality. `V` (and therefore the
 * shape of a verify() result) is generic and unknown to this module — every
 * verifier family publishes its own result interface — so rather than widen
 * all seven, this defines the property NON-ENUMERABLE directly on the
 * resolved result object.
 *
 * Non-enumerable is deliberate, not incidental: every downstream persistence
 * call site (this phase's gates/plan-review.ts, services/spec-approve.ts,
 * gates/code-review.ts, gates/security-audit.ts) reads the tag by exact name
 * (`result.providerSelection`), which a non-enumerable property still
 * supports — but this repo has pre-existing tests (`verifier-factory.test.ts`
 * "host-cli fallback wrapping" block, predating this phase) asserting a
 * call-time-fallback result via `toEqual({...})` with NO `providerSelection`
 * key. `toEqual`, `JSON.stringify`, and object-spread all skip non-enumerable
 * own properties, so those pre-existing exact-shape assertions keep passing
 * unmodified while every new named read below still resolves correctly — a
 * plain `Object.assign`/spread (enumerable by default) breaks the former.
 *
 * Best-effort, matching this codebase's "introspection never throws"
 * convention: a frozen/non-extensible result object can't accept a new
 * property at all; that's a reason to skip the tag, never a reason to crash
 * a gate over provenance metadata. `configurable: true` lets sticky
 * re-tagging (`wrapWithFallback` below) redefine the property on a result
 * object more than once, though in practice each call produces a fresh one.
 */
function tagProviderSelection<T>(result: T, tag: ProviderSelectionTag): T {
  if (result !== null && typeof result === 'object') {
    try {
      Object.defineProperty(result, 'providerSelection', {
        value: tag,
        enumerable: false,
        configurable: true,
      });
    } catch {
      /* best-effort — a frozen/non-extensible result simply keeps no tag */
    }
  }
  return result;
}

/**
 * Phase 165 T3, extended by Phase 263 T3 — wraps a verifier instance so that
 * every method call's resolved result carries `providerSelection`
 * (`tagProviderSelection` above), and — when `fallbackOpts` is supplied —
 * a `HostCliError` (binary not found, spawn failure, non-zero exit,
 * unparseable output — see `host-cli-client.ts`) thrown/rejected by any of
 * its methods is caught and the call is transparently redirected to
 * `fallbackOpts.fallback`'s same-named method instead of crashing the gate
 * or hanging. `createVerifierFactory` calls this on EVERY return path — the
 * three real-provider builds, the three selection-time mock downgrades, and
 * the plain `spec.mock()` explicit-mock/host-cli branches — not only the
 * `host-cli` family, since 263-01's tagging computation is universal across
 * all seven verifier seams (only `fallbackOpts` — real call-time delegation
 * — is `host-cli`-specific).
 *
 * `V` is generic and unknown to this module — each verifier family
 * (`PerTaskVerifier`, `CodeReviewVerifier`, `Verifier`, …) defines its own
 * interface shape, and `verifier-factory.ts` must work for all of them
 * without per-family edits. Rather than hardcoding a method name like
 * `verify`, this wraps *every* function-valued property behind a `Proxy`:
 * whichever method the caller invokes, a synchronous throw or a rejected
 * `Promise` carrying a `HostCliError` triggers one warning (mirroring the
 * `anthropic`/`local` prerequisite-missing warnings above) and a delegate
 * call to the same method on `fallbackOpts.fallback`. Non-`HostCliError`
 * failures (e.g. the repair-retry harness exhausting retries on genuinely bad
 * model output) are real verification failures, not host-cli-availability
 * problems, and are left to propagate unchanged.
 *
 * The call-time fallback check can only run lazily, at actual call time —
 * unlike the `anthropic`/`local` branches, whether the host CLI binary exists
 * or is authenticated can't be determined synchronously without a blocking
 * probe on every selection (see the `host-cli` branch below), so the warning
 * fires on first failed call rather than at selection time. No timers/delays
 * are added here, so a caller awaiting the wrapped method never waits longer
 * than the underlying primary + fallback calls themselves take.
 *
 * Sticky-per-instance state (263-01 AC-2): `stuckFallback` starts `true` iff
 * `initialTag === 'fallback'` (a selection-time downgrade already happened)
 * and flips permanently `true` the first time any call on THIS Proxy falls
 * back at call time — every later call on the same instance, even one that
 * itself succeeds on the primary provider, is then tagged `'fallback'` too
 * (any-fallback-wins, not last-write-wins; see the "multi-call-in-one-run"
 * test in `verifier-factory.test.ts`). This is deliberately per-instance
 * state, not global/module-level: every context builder that selects a
 * verifier (`buildSettleContext`/`buildDraftContext` in
 * services/settle.ts/gates/draft-context.ts, `spec-approve-ports.ts`'s
 * `resolveSpecReviewPort`/`resolveUiSpecReviewPort`) allocates a fresh
 * instance per settle/gate/approve invocation — including under
 * `cadence mcp serve`, whose tool handlers (`mcp/tools.ts`) call
 * `settleService`/`specApproveService`/draft-approve fresh per tool call with
 * no injected long-lived verifier ports — so no caller anywhere holds one
 * instance across multiple logical runs for this sticky state to leak across.
 */
function wrapWithFallback<V>(
  primary: V,
  initialTag: ProviderSelectionTag,
  fallbackOpts?: { fallback: V; warn: (message: string) => void; label: string },
): V {
  // `V` is unconstrained at the `createVerifierFactory<C, V>` call site (any
  // verifier family's interface), but every family's builder in practice
  // returns a plain object/class instance — `Proxy` requires an object
  // target, so narrow via a local cast rather than constraining the exported
  // generic (which would ripple into every `VerifierFactorySpec<C, V>` usage).
  let stuckFallback = initialTag === 'fallback';
  const targetObj = primary as object;

  const delegateToFallback = (prop: PropertyKey, args: unknown[], err: unknown): unknown => {
    if (!fallbackOpts || !(err instanceof HostCliError)) throw err;
    stuckFallback = true;
    fallbackOpts.warn(
      `${fallbackOpts.label}: host-cli provider failed (${err.reason}: ${err.message}) — falling back to mock provider for this call.`,
    );
    const fallbackObj = fallbackOpts.fallback as object;
    const fallbackFn = Reflect.get(fallbackObj, prop, fallbackObj);
    if (typeof fallbackFn !== 'function') throw err;
    const result = Reflect.apply(fallbackFn as (...a: unknown[]) => unknown, fallbackObj, args);
    if (result instanceof Promise) {
      return result.then((r: unknown) => tagProviderSelection(r, 'fallback'));
    }
    return tagProviderSelection(result, 'fallback');
  };

  return new Proxy(targetObj, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]): unknown => {
        let result: unknown;
        try {
          result = Reflect.apply(value as (...a: unknown[]) => unknown, target, args);
        } catch (err) {
          return delegateToFallback(prop, args, err);
        }
        if (result instanceof Promise) {
          return result
            .then((r: unknown) => tagProviderSelection(r, stuckFallback ? 'fallback' : 'configured'))
            .catch((err: unknown) => delegateToFallback(prop, args, err));
        }
        return tagProviderSelection(result, stuckFallback ? 'fallback' : 'configured');
      };
    },
  }) as V;
}

export function createVerifierFactory<C, V>(
  spec: VerifierFactorySpec<C, V>,
): (config: C | null, opts?: VerifierSelectOptions) => V {
  return (config: C | null, opts: VerifierSelectOptions = {}): V => {
    const slice = spec.read(config);
    const provider = opts.override ?? slice?.provider ?? 'mock';
    const env = opts.env ?? process.env;
    const cwd = opts.cwd ?? process.cwd();
    const warn = opts.warn ?? ((m: string) => process.stderr.write(m + '\n'));

    if (provider === 'anthropic') {
      const apiKey = discoverKey('ANTHROPIC_API_KEY', env, cwd).value;
      if (!apiKey) {
        warn(
          buildDowngradeBanner(
            `${spec.label}: anthropic provider requested but ANTHROPIC_API_KEY is unset (a Claude Code/IDE login does not satisfy this — anthropic calls the Anthropic SDK directly and needs a separately API-billed key) — falling back to mock provider.`,
          ),
        );
        return wrapWithFallback(spec.mock(), 'fallback');
      }
      const model = slice?.model;
      return wrapWithFallback(
        spec.anthropic({
          apiKey,
          ...(model ? { model } : {}),
          ...(slice?.timeoutMs !== undefined ? { timeout: slice.timeoutMs } : {}),
          ...(slice?.maxRetries !== undefined
            ? { maxRetries: slice.maxRetries }
            : {}),
        }),
        'configured',
      );
    }

    if (provider === 'local') {
      const baseURL = discoverKey('CADENCE_LOCAL_BASE_URL', env, cwd).value;
      const model = slice?.model ?? discoverKey('CADENCE_LOCAL_MODEL', env, cwd).value;
      if (!baseURL || !model) {
        warn(
          buildDowngradeBanner(
            `${spec.label}: local provider requested but CADENCE_LOCAL_BASE_URL / model unset — falling back to mock provider.`,
          ),
        );
        return wrapWithFallback(spec.mock(), 'fallback');
      }
      const localApiKey = discoverKey('CADENCE_LOCAL_API_KEY', env, cwd).value;
      const headers = buildLocalHeaders(localApiKey, slice?.localHeaders);
      return wrapWithFallback(
        spec.local({ baseURL, model, ...(headers ? { headers } : {}) }),
        'configured',
      );
    }

    if (provider === 'host-cli') {
      if (!spec.hostCli) {
        warn(
          buildDowngradeBanner(
            `${spec.label}: host-cli provider requested but this verifier family has not wired a host-cli builder yet — falling back to mock provider.`,
          ),
        );
        return wrapWithFallback(spec.mock(), 'fallback');
      }
      // Phase 165: binary name/path is env/`.env`-discoverable the same way
      // `local`'s baseURL/model are (`discoverKey`), not a new config schema
      // field — defaults to `claude` on PATH. Whether the binary actually
      // exists/authenticates is checked lazily at spawn time inside
      // `host-cli-client.ts`, mirroring how `local`/`anthropic` don't probe
      // connectivity during selection either.
      const bin = discoverKey('CADENCE_HOST_CLI_BIN', env, cwd).value ?? 'claude';
      const model = slice?.model;
      const primary = spec.hostCli({ bin, ...(model ? { model } : {}) });
      // T3: the binary's existence/auth status is only knowable once a real
      // call is attempted (see `wrapWithFallback`'s doc comment) — wrap here
      // rather than probing synchronously, so a missing/unauthenticated
      // binary degrades to `mock` per-call with a loud warning instead of
      // throwing out of the gate or hanging on interactive auth (AC-2).
      return wrapWithFallback(primary, 'configured', {
        fallback: spec.mock(),
        warn,
        label: spec.label,
      });
    }

    return wrapWithFallback(spec.mock(), 'configured');
  };
}
